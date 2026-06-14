// src/process/manager.ts
import { spawn, type ChildProcess } from 'node:child_process';
import { execSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { buildProcessEnv } from './env.js';

export interface ProcessInfo {
  id: string;
  projectId: string;
  projectName: string;
  command: string;
  commandName: string;
  cwd: string;
  status: 'running' | 'stopped' | 'crashed';
  pid: number | null;
  startedAt: string;
  exitCode: number | null;
}

interface InternalProcess extends ProcessInfo {
  process: ChildProcess;
}

export interface ProcessOutput {
  processId: string;
  data: string;
  stream: 'stdout' | 'stderr';
}

export interface LogEntry {
  ts: string;
  stream: 'stdout' | 'stderr';
  data: string;
}

const LOG_BUFFER_LIMIT = 2000;

export class ProcessManager extends EventEmitter {
  private processes = new Map<string, InternalProcess>();
  private logs = new Map<string, LogEntry[]>();
  private idCounter = 0;

  private appendLog(processId: string, entry: LogEntry) {
    let buf = this.logs.get(processId);
    if (!buf) {
      buf = [];
      this.logs.set(processId, buf);
    }
    buf.push(entry);
    if (buf.length > LOG_BUFFER_LIMIT) {
      buf.splice(0, buf.length - LOG_BUFFER_LIMIT);
    }
  }

  /**
   * Get buffered log entries for a single process.
   */
  getLogs(processId: string, lines?: number): LogEntry[] {
    const buf = this.logs.get(processId) ?? [];
    if (lines && lines > 0 && buf.length > lines) {
      return buf.slice(-lines);
    }
    return buf.slice();
  }

  /**
   * Get buffered log entries for every process belonging to a project,
   * merged in timestamp order.
   */
  getLogsByProject(
    projectId: string,
    opts?: { lines?: number; stream?: 'stdout' | 'stderr' }
  ): Array<LogEntry & { processId: string; commandName: string }> {
    const merged: Array<LogEntry & { processId: string; commandName: string }> = [];
    for (const proc of this.processes.values()) {
      if (proc.projectId !== projectId) continue;
      const buf = this.logs.get(proc.id) ?? [];
      for (const entry of buf) {
        if (opts?.stream && entry.stream !== opts.stream) continue;
        merged.push({ ...entry, processId: proc.id, commandName: proc.commandName });
      }
    }
    merged.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
    if (opts?.lines && opts.lines > 0 && merged.length > opts.lines) {
      return merged.slice(-opts.lines);
    }
    return merged;
  }

  /**
   * Generate a unique process ID
   */
  private genId(): string {
    return `proc-${Date.now()}-${++this.idCounter}`;
  }

  /**
   * Launch one or more commands for a project.
   * Returns array of process info objects.
   */
  launch(opts: {
    projectId: string;
    projectName: string;
    commands: { name: string; command: string; path?: string }[];
    cwd: string;
    secrets?: Record<string, string>;
  }): ProcessInfo[] {
    const { projectId, projectName, commands, cwd, secrets } = opts;

    // Clear out finished (crashed/stopped) processes for this project so old
    // dead terminals don't pile up every time we launch.
    for (const [id, proc] of this.processes) {
      if (proc.projectId === projectId && proc.status !== 'running') {
        this.processes.delete(id);
        this.logs.delete(id);
      }
    }

    const env = buildProcessEnv(secrets);
    const launched: ProcessInfo[] = [];

    for (const cmd of commands) {
      const id = this.genId();
      const workDir = cmd.path || cwd;

      const proc = spawn(cmd.command, [], {
        shell: true,
        cwd: workDir,
        env,
        stdio: 'pipe',
      });

      const info: InternalProcess = {
        id,
        projectId,
        projectName,
        command: cmd.command,
        commandName: cmd.name,
        cwd: workDir,
        status: 'running',
        pid: proc.pid ?? null,
        startedAt: new Date().toISOString(),
        exitCode: null,
        process: proc,
      };

      proc.stdout?.on('data', (data: Buffer) => {
        const str = data.toString();
        this.appendLog(id, { ts: new Date().toISOString(), stream: 'stdout', data: str });
        this.emit('output', {
          processId: id,
          data: str,
          stream: 'stdout',
        } satisfies ProcessOutput);
      });

      proc.stderr?.on('data', (data: Buffer) => {
        const str = data.toString();
        this.appendLog(id, { ts: new Date().toISOString(), stream: 'stderr', data: str });
        this.emit('output', {
          processId: id,
          data: str,
          stream: 'stderr',
        } satisfies ProcessOutput);
      });

      proc.on('exit', (code, signal) => {
        const p = this.processes.get(id);
        if (p) {
          p.status = code === 0 || p.status === 'stopped' ? 'stopped' : 'crashed';
          p.exitCode = code;
          p.pid = null;
        }
        this.emit('exit', { processId: id, code, signal });
      });

      proc.on('error', (err) => {
        const p = this.processes.get(id);
        if (p) {
          p.status = 'crashed';
          p.pid = null;
        }
        const errMsg = `Error: ${err.message}\n`;
        this.appendLog(id, { ts: new Date().toISOString(), stream: 'stderr', data: errMsg });
        this.emit('output', {
          processId: id,
          data: errMsg,
          stream: 'stderr',
        } satisfies ProcessOutput);
        this.emit('exit', { processId: id, code: 1, signal: null });
      });

      this.processes.set(id, info);
      launched.push(this.toPublic(info));
    }

    return launched;
  }

  /**
   * Stop all processes for a project (graceful SIGTERM, then SIGKILL after timeout)
   */
  async stop(projectId: string): Promise<void> {
    const procs = this.getByProject(projectId).filter((p) => p.status === 'running');

    for (const proc of procs) {
      const internal = this.processes.get(proc.id);
      if (!internal?.process) continue;

      internal.status = 'stopped';
      this.killTree(internal.process.pid!);
    }

    // Wait for processes to exit (up to 5s)
    await Promise.all(
      procs.map(
        (p) =>
          new Promise<void>((resolve) => {
            const internal = this.processes.get(p.id);
            if (!internal?.process || internal.process.exitCode !== null) {
              resolve();
              return;
            }
            const timeout = setTimeout(() => {
              // Force kill if still running
              if (internal.process && internal.process.exitCode === null) {
                this.killTree(internal.process.pid!, true);
              }
              resolve();
            }, 5000);
            internal.process.once('exit', () => {
              clearTimeout(timeout);
              resolve();
            });
          })
      )
    );
  }

  /**
   * Restart all processes for a project
   */
  async restart(
    projectId: string,
    opts: {
      projectName: string;
      commands: { name: string; command: string; path?: string }[];
      cwd: string;
      secrets?: Record<string, string>;
    }
  ): Promise<ProcessInfo[]> {
    await this.stop(projectId);
    // Clean up old processes (and their log buffers) for this project
    for (const [id, proc] of this.processes) {
      if (proc.projectId === projectId) {
        this.processes.delete(id);
        this.logs.delete(id);
      }
    }
    return this.launch({ projectId, ...opts });
  }

  /**
   * Kill a specific process by ID (force)
   */
  kill(processId: string): void {
    const proc = this.processes.get(processId);
    if (!proc?.process || proc.status !== 'running') return;
    proc.status = 'stopped';
    this.killTree(proc.process.pid!, true);
  }

  /**
   * Remove a finished (crashed/stopped) process and its logs from the list.
   * Running processes are left alone — stop or kill them first.
   */
  remove(processId: string): boolean {
    const proc = this.processes.get(processId);
    if (!proc || proc.status === 'running') return false;
    this.processes.delete(processId);
    this.logs.delete(processId);
    return true;
  }

  /**
   * Get all processes for a project
   */
  getByProject(projectId: string): ProcessInfo[] {
    const result: ProcessInfo[] = [];
    for (const proc of this.processes.values()) {
      if (proc.projectId === projectId) {
        result.push(this.toPublic(proc));
      }
    }
    return result;
  }

  /**
   * Get all running processes
   */
  getAll(): ProcessInfo[] {
    return Array.from(this.processes.values()).map((p) => this.toPublic(p));
  }

  /**
   * Check if a project has running processes
   */
  isRunning(projectId: string): boolean {
    for (const proc of this.processes.values()) {
      if (proc.projectId === projectId && proc.status === 'running') return true;
    }
    return false;
  }

  /**
   * Kill a process tree (parent + all descendants)
   */
  private killTree(pid: number, force = false): void {
    try {
      // Get all descendant PIDs
      const descendants = this.getDescendants(pid);
      const signal = force ? 'SIGKILL' : 'SIGTERM';

      // Kill descendants first (bottom-up), then parent
      for (const dpid of descendants.reverse()) {
        try {
          process.kill(dpid, signal);
        } catch {
          // Process may already be dead
        }
      }

      try {
        process.kill(pid, signal);
      } catch {
        // Process may already be dead
      }
    } catch {
      // Best effort
    }
  }

  /**
   * Get all descendant PIDs of a process
   */
  private getDescendants(pid: number): number[] {
    try {
      const output = execSync(`pgrep -P ${pid}`, { encoding: 'utf8' }).trim();
      if (!output) return [];
      const children = output.split('\n').map(Number).filter(Boolean);
      const all: number[] = [];
      for (const child of children) {
        all.push(child);
        all.push(...this.getDescendants(child));
      }
      return all;
    } catch {
      return [];
    }
  }

  private toPublic(p: InternalProcess): ProcessInfo {
    const { process: _, ...info } = p;
    return info;
  }
}
