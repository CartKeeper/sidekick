import { useState } from 'react';
import { Plus, Trash2, Edit2, Check, X, Terminal, Code2, Globe, Rocket, FolderOpen, Square, RefreshCw } from 'lucide-react';
import { api, type Project, type Environment } from '../api/client';
import { useAppStore } from '../stores/app';
import { TerminalPanel } from './TerminalPanel';
import { Button, IconButton, Input, Select, EmptyState, cn } from './ui';

interface StartCommand {
  name: string;
  command: string;
  path?: string;
}

interface LaunchTabProps {
  project: Project & { environments: Environment[] };
  onUpdate: () => void;
}

// Toggle switch component
function Toggle({
  checked,
  onChange,
  label,
  icon,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border-default">
      <div className="flex items-center gap-[10px]">
        <span className="text-text-muted">{icon}</span>
        <span className="text-[14px] text-text-primary">{label}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'w-10 h-6 rounded-full border-0 cursor-pointer relative shrink-0 p-0',
          'transition-colors duration-150',
          checked ? 'bg-accent' : 'bg-border-default',
        )}
      >
        <span
          className="absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white transition-[left] duration-150 shadow-[0_1px_3px_rgba(0,0,0,0.3)]"
          style={{ left: checked ? '19px' : '3px' }}
        />
      </button>
    </div>
  );
}

// Section label
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[12px] font-semibold text-text-secondary tracking-[0.05em] uppercase mb-3">
      {children}
    </p>
  );
}

export function LaunchTab({ project, onUpdate }: LaunchTabProps) {
  const { runningProcesses, processOutput, launchProject, stopProject, restartProject, killProcess } = useAppStore();

  const [commands, setCommands] = useState<StartCommand[]>(
    project.start_commands ?? []
  );
  const [devUrl, setDevUrl] = useState(project.dev_url ?? '');
  const [defaultEnv, setDefaultEnv] = useState(project.default_environment ?? '');
  const [enableTerminal, setEnableTerminal] = useState(project.enable_terminal ?? true);
  const [enableVscode, setEnableVscode] = useState(project.enable_vscode ?? false);
  const [enableBrowser, setEnableBrowser] = useState(project.enable_browser ?? true);
  const [saving, setSaving] = useState(false);
  const [launching, setLaunching] = useState(false);

  // Add command state
  const [addingCmd, setAddingCmd] = useState(false);
  const [newCmdName, setNewCmdName] = useState('');
  const [newCmdCommand, setNewCmdCommand] = useState('');
  const [newCmdPath, setNewCmdPath] = useState('');

  // Edit command state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editCommand, setEditCommand] = useState('');
  const [editPath, setEditPath] = useState('');

  // Active process tab (for multi-process output)
  const [activeProcessId, setActiveProcessId] = useState<string | null>(null);

  // Determine if this project is running
  const projectProcesses = runningProcesses.filter((p) => p.projectId === project.id);
  const isRunning = projectProcesses.length > 0 && projectProcesses.some(
    (p) => p.status !== 'stopped' && p.status !== 'crashed' && p.status !== 'killed'
  );

  // Active process for terminal display
  const activeProcess = activeProcessId
    ? projectProcesses.find((p) => p.id === activeProcessId) ?? projectProcesses[0]
    : projectProcesses[0];

  const save = async (fields: Partial<Project>) => {
    setSaving(true);
    try {
      await api.projects.update(project.id, fields);
      onUpdate();
    } finally {
      setSaving(false);
    }
  };

  const handleAddCommand = async () => {
    if (!newCmdName.trim() || !newCmdCommand.trim()) return;
    const updated = [
      ...commands,
      { name: newCmdName.trim(), command: newCmdCommand.trim(), path: newCmdPath.trim() || undefined },
    ];
    setCommands(updated);
    setAddingCmd(false);
    setNewCmdName('');
    setNewCmdCommand('');
    setNewCmdPath('');
    await save({ start_commands: updated });
  };

  const handleDeleteCommand = async (index: number) => {
    const updated = commands.filter((_, i) => i !== index);
    setCommands(updated);
    await save({ start_commands: updated });
  };

  const handleStartEdit = (index: number) => {
    const cmd = commands[index];
    setEditingIndex(index);
    setEditName(cmd.name);
    setEditCommand(cmd.command);
    setEditPath(cmd.path ?? '');
  };

  const handleSaveEdit = async () => {
    if (editingIndex === null) return;
    const updated = commands.map((cmd, i) =>
      i === editingIndex
        ? { name: editName.trim(), command: editCommand.trim(), path: editPath.trim() || undefined }
        : cmd
    );
    setCommands(updated);
    setEditingIndex(null);
    await save({ start_commands: updated });
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
  };

  const handleLaunch = async () => {
    setLaunching(true);
    try {
      await launchProject(project.id);
    } finally {
      setLaunching(false);
    }
  };

  const handleStop = async () => {
    await stopProject(project.id);
  };

  const handleRestart = async () => {
    await restartProject(project.id);
  };

  return (
    <div className="flex flex-col gap-6">

      {/* Start Commands */}
      <section>
        <SectionLabel>Start Commands</SectionLabel>
        <div className="bg-surface border border-border-default rounded-xl overflow-hidden">
          {commands.length === 0 && !addingCmd ? (
            <EmptyState
              icon={Terminal}
              title="No start commands configured"
              actionLabel="Add your first command"
              onAction={() => setAddingCmd(true)}
            />
          ) : (
            <div>
              {commands.map((cmd, i) => (
                <div
                  key={i}
                  className={cn(
                    'px-4 py-3',
                    (i < commands.length - 1 || addingCmd) && 'border-b border-border-default',
                  )}
                >
                  {editingIndex === i ? (
                    // Edit mode
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <Input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="Command name"
                          className="flex-none w-[140px]"
                        />
                        <Input
                          type="text"
                          value={editCommand}
                          onChange={(e) => setEditCommand(e.target.value)}
                          placeholder="npm run dev"
                          className="flex-1 font-mono"
                        />
                      </div>
                      <div className="flex gap-2 items-center">
                        <div className="relative flex-1">
                          <FolderOpen
                            size={13}
                            className="absolute left-[10px] top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
                          />
                          <Input
                            type="text"
                            value={editPath}
                            onChange={(e) => setEditPath(e.target.value)}
                            placeholder="Working dir (optional)"
                            className="font-mono pl-[30px]"
                          />
                        </div>
                        <IconButton
                          aria-label="Save edit"
                          onClick={handleSaveEdit}
                          className="text-success bg-success-muted border border-success/30 hover:bg-success-muted hover:text-success rounded-md"
                        >
                          <Check size={14} />
                        </IconButton>
                        <IconButton
                          aria-label="Cancel edit"
                          onClick={handleCancelEdit}
                          className="border border-border-default rounded-md"
                        >
                          <X size={14} />
                        </IconButton>
                      </div>
                    </div>
                  ) : (
                    // Display mode
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] font-semibold text-text-primary mb-0.5 truncate">
                          {cmd.name}
                        </div>
                        <div className="text-[12px] text-text-secondary font-mono truncate">
                          {cmd.command}
                        </div>
                        {cmd.path && (
                          <div className="text-[11px] text-text-muted font-mono mt-0.5 truncate">
                            {cmd.path}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <IconButton
                          aria-label="Edit command"
                          onClick={() => handleStartEdit(i)}
                          className="border border-border-default rounded-md"
                        >
                          <Edit2 size={13} />
                        </IconButton>
                        <IconButton
                          aria-label="Delete command"
                          variant="danger"
                          onClick={() => handleDeleteCommand(i)}
                          className="border border-border-default hover:border-danger/40 rounded-md"
                        >
                          <Trash2 size={13} />
                        </IconButton>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Add new command inline form */}
              {addingCmd && (
                <div className="px-4 py-3 flex flex-col gap-2">
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      value={newCmdName}
                      onChange={(e) => setNewCmdName(e.target.value)}
                      placeholder="Command name"
                      autoFocus
                      className="flex-none w-[140px]"
                    />
                    <Input
                      type="text"
                      value={newCmdCommand}
                      onChange={(e) => setNewCmdCommand(e.target.value)}
                      placeholder="npm run dev"
                      className="flex-1 font-mono"
                    />
                  </div>
                  <div className="flex gap-2 items-center">
                    <div className="relative flex-1">
                      <FolderOpen
                        size={13}
                        className="absolute left-[10px] top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
                      />
                      <Input
                        type="text"
                        value={newCmdPath}
                        onChange={(e) => setNewCmdPath(e.target.value)}
                        placeholder="Working dir (optional)"
                        className="font-mono pl-[30px]"
                      />
                    </div>
                    <IconButton
                      aria-label="Add command"
                      onClick={handleAddCommand}
                      className="text-success bg-success-muted border border-success/30 hover:bg-success-muted hover:text-success rounded-md"
                    >
                      <Check size={14} />
                    </IconButton>
                    <IconButton
                      aria-label="Cancel add command"
                      onClick={() => { setAddingCmd(false); setNewCmdName(''); setNewCmdCommand(''); setNewCmdPath(''); }}
                      className="border border-border-default rounded-md"
                    >
                      <X size={14} />
                    </IconButton>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Add Command button (shown when there are already commands) */}
        {commands.length > 0 && !addingCmd && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAddingCmd(true)}
            className="mt-2"
          >
            <Plus size={13} />
            Add Command
          </Button>
        )}
      </section>

      {/* Dev URL */}
      <section>
        <SectionLabel>Dev URL</SectionLabel>
        <Input
          type="text"
          value={devUrl}
          onChange={(e) => setDevUrl(e.target.value)}
          onBlur={async () => {
            if (devUrl !== project.dev_url) {
              await save({ dev_url: devUrl });
            }
          }}
          placeholder="http://localhost:3000"
        />
      </section>

      {/* Default Environment */}
      <section>
        <SectionLabel>Default Environment</SectionLabel>
        <Select
          value={defaultEnv}
          onChange={async (e) => {
            setDefaultEnv(e.target.value);
            await save({ default_environment: e.target.value });
          }}
        >
          <option value="">None</option>
          {project.environments?.map((env) => (
            <option key={env.id} value={env.slug}>
              {env.name}
            </option>
          ))}
        </Select>
      </section>

      {/* Launch Actions */}
      <section>
        <SectionLabel>Launch Actions</SectionLabel>
        <div className="bg-surface border border-border-default rounded-xl px-4">
          <Toggle
            checked={enableTerminal}
            onChange={async (val) => {
              setEnableTerminal(val);
              await save({ enable_terminal: val });
            }}
            label="Open Terminal"
            icon={<Terminal size={16} />}
          />
          <Toggle
            checked={enableVscode}
            onChange={async (val) => {
              setEnableVscode(val);
              await save({ enable_vscode: val });
            }}
            label="Open VS Code"
            icon={<Code2 size={16} />}
          />
          <div className="[&>div]:border-b-0">
            <Toggle
              checked={enableBrowser}
              onChange={async (val) => {
                setEnableBrowser(val);
                await save({ enable_browser: val });
              }}
              label="Open Browser"
              icon={<Globe size={16} />}
            />
          </div>
        </div>
      </section>

      {/* Launch / Stop / Restart Buttons */}
      <section>
        {isRunning ? (
          <div className="flex gap-2">
            {/* Stop button */}
            <button
              type="button"
              onClick={handleStop}
              className={cn(
                'flex-1 h-12 rounded-md text-[14px] font-semibold',
                'flex items-center justify-center gap-2',
                'bg-warning-muted border border-warning/25 text-warning',
                'hover:bg-warning-muted/70 hover:border-warning/45',
                'transition-[background-color,border-color] duration-150',
              )}
            >
              <Square size={16} />
              Stop
            </button>

            {/* Restart button */}
            <button
              type="button"
              onClick={handleRestart}
              className={cn(
                'flex-1 h-12 rounded-md text-[14px] font-semibold',
                'flex items-center justify-center gap-2',
                'bg-accent-muted border border-accent/25 text-accent',
                'hover:bg-accent-muted/70 hover:border-accent/45',
                'transition-[background-color,border-color] duration-150',
              )}
            >
              <RefreshCw size={16} />
              Restart
            </button>
          </div>
        ) : (
          <Button
            variant="primary"
            size="lg"
            onClick={handleLaunch}
            disabled={launching || saving || commands.length === 0}
            loading={launching}
            className="w-full"
          >
            <Rocket size={18} />
            {launching ? 'Launching…' : commands.length === 0 ? 'Add a command to launch' : 'Launch Project'}
          </Button>
        )}
      </section>

      {/* Terminal Output — shown when processes exist */}
      {projectProcesses.length > 0 && (
        <section>
          <SectionLabel>Process Output</SectionLabel>

          {/* Process tabs (shown when multiple processes) */}
          {projectProcesses.length > 1 && (
            <div className="flex gap-1 mb-2 overflow-x-auto">
              {projectProcesses.map((proc) => {
                const isActive = (activeProcessId ?? projectProcesses[0]?.id) === proc.id;
                const procRunning = proc.status !== 'stopped' && proc.status !== 'crashed' && proc.status !== 'killed';
                return (
                  <button
                    key={proc.id}
                    type="button"
                    onClick={() => setActiveProcessId(proc.id)}
                    className={cn(
                      'h-8 px-3 text-[12px] font-semibold rounded-md shrink-0',
                      'flex items-center gap-1.5 whitespace-nowrap',
                      'transition-[color,border-color,background-color] duration-150',
                      isActive
                        ? 'border border-accent bg-accent-muted text-accent'
                        : 'border border-border-default bg-transparent text-text-muted',
                    )}
                  >
                    <span
                      className={cn(
                        'w-1.5 h-1.5 rounded-full shrink-0',
                        procRunning
                          ? 'bg-success shadow-[0_0_4px_var(--color-success)]'
                          : 'bg-text-muted',
                      )}
                    />
                    {proc.name || proc.id}
                  </button>
                );
              })}
            </div>
          )}

          {/* Terminal panel for active process */}
          {activeProcess && (
            <TerminalPanel
              processId={activeProcess.id}
              processName={activeProcess.name || activeProcess.id}
              projectId={project.id}
              onStop={
                activeProcess.status !== 'stopped' && activeProcess.status !== 'crashed'
                  ? handleStop
                  : undefined
              }
              onRestart={handleRestart}
              onKill={() => killProcess(activeProcess.id)}
            />
          )}
        </section>
      )}
    </div>
  );
}
