// src/__tests__/process/manager.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { ProcessManager, type ProcessOutput } from '../../process/manager.js';

let pm: ProcessManager;

afterEach(async () => {
  if (pm) {
    // Kill all remaining processes
    for (const proc of pm.getAll()) {
      if (proc.status === 'running') {
        pm.kill(proc.id);
      }
    }
    // Wait a tick for cleanup
    await new Promise((r) => setTimeout(r, 200));
  }
});

describe('ProcessManager', () => {
  it('launches a process and captures output', async () => {
    pm = new ProcessManager();
    const output: string[] = [];

    pm.on('output', (data: ProcessOutput) => {
      output.push(data.data);
    });

    const procs = pm.launch({
      projectId: 'p1',
      projectName: 'Test',
      commands: [{ name: 'echo', command: 'echo "hello from sidekick"' }],
      cwd: '/tmp',
    });

    expect(procs).toHaveLength(1);
    expect(procs[0].status).toBe('running');
    expect(procs[0].projectId).toBe('p1');
    expect(procs[0].commandName).toBe('echo');

    // Wait for process to finish
    await new Promise<void>((resolve) => {
      pm.on('exit', () => resolve());
    });

    expect(output.join('')).toContain('hello from sidekick');
  });

  it('launches multiple commands for a project', () => {
    pm = new ProcessManager();

    const procs = pm.launch({
      projectId: 'p1',
      projectName: 'Multi',
      commands: [
        { name: 'cmd1', command: 'sleep 10' },
        { name: 'cmd2', command: 'sleep 10' },
      ],
      cwd: '/tmp',
    });

    expect(procs).toHaveLength(2);
    expect(procs[0].commandName).toBe('cmd1');
    expect(procs[1].commandName).toBe('cmd2');
    expect(pm.isRunning('p1')).toBe(true);
  });

  it('stops all processes for a project', async () => {
    pm = new ProcessManager();

    pm.launch({
      projectId: 'p1',
      projectName: 'Stoppable',
      commands: [{ name: 'long', command: 'sleep 60' }],
      cwd: '/tmp',
    });

    expect(pm.isRunning('p1')).toBe(true);
    await pm.stop('p1');
    expect(pm.isRunning('p1')).toBe(false);
  });

  it('restarts processes for a project', async () => {
    pm = new ProcessManager();

    pm.launch({
      projectId: 'p1',
      projectName: 'Restartable',
      commands: [{ name: 'run', command: 'sleep 60' }],
      cwd: '/tmp',
    });

    const restarted = await pm.restart('p1', {
      projectName: 'Restartable',
      commands: [{ name: 'run', command: 'sleep 60' }],
      cwd: '/tmp',
    });

    expect(restarted).toHaveLength(1);
    expect(restarted[0].status).toBe('running');
    expect(pm.isRunning('p1')).toBe(true);
  });

  it('injects secrets as environment variables', async () => {
    pm = new ProcessManager();
    const output: string[] = [];

    pm.on('output', (data: ProcessOutput) => {
      output.push(data.data);
    });

    pm.launch({
      projectId: 'p1',
      projectName: 'Secrets',
      commands: [{ name: 'env', command: 'echo $MY_SECRET_KEY' }],
      cwd: '/tmp',
      secrets: { MY_SECRET_KEY: 'super-secret-123' },
    });

    await new Promise<void>((resolve) => {
      pm.on('exit', () => resolve());
    });

    expect(output.join('')).toContain('super-secret-123');
  });

  it('tracks process exit codes', async () => {
    pm = new ProcessManager();

    const procs = pm.launch({
      projectId: 'p1',
      projectName: 'Exit',
      commands: [{ name: 'fail', command: 'exit 42' }],
      cwd: '/tmp',
    });

    const exitEvent = await new Promise<any>((resolve) => {
      pm.on('exit', (data) => resolve(data));
    });

    expect(exitEvent.code).toBe(42);

    const all = pm.getByProject('p1');
    expect(all[0].status).toBe('crashed');
    expect(all[0].exitCode).toBe(42);
  });

  it('getAll returns all processes', () => {
    pm = new ProcessManager();

    pm.launch({
      projectId: 'p1',
      projectName: 'A',
      commands: [{ name: 'a', command: 'sleep 60' }],
      cwd: '/tmp',
    });
    pm.launch({
      projectId: 'p2',
      projectName: 'B',
      commands: [{ name: 'b', command: 'sleep 60' }],
      cwd: '/tmp',
    });

    expect(pm.getAll()).toHaveLength(2);
  });

  it('kills a specific process by ID', async () => {
    pm = new ProcessManager();

    const procs = pm.launch({
      projectId: 'p1',
      projectName: 'Killable',
      commands: [
        { name: 'a', command: 'sleep 60' },
        { name: 'b', command: 'sleep 60' },
      ],
      cwd: '/tmp',
    });

    pm.kill(procs[0].id);

    await new Promise((r) => setTimeout(r, 500));

    const all = pm.getByProject('p1');
    const killed = all.find((p) => p.id === procs[0].id);
    const alive = all.find((p) => p.id === procs[1].id);
    expect(killed?.status).toBe('stopped');
    expect(alive?.status).toBe('running');
  });
});
