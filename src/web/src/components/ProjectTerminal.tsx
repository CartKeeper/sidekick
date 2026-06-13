import { useState, useEffect } from 'react';
import { RefreshCw, Square, X as XIcon } from 'lucide-react';
import { useAppStore } from '../stores/app';
import { TerminalPanel } from './TerminalPanel';
import { ProjectIcon } from './ProjectIcon';
import { Button, IconButton, cn } from './ui';

interface ProjectTerminalProps {
  projectId: string;
}

export function ProjectTerminal({ projectId }: ProjectTerminalProps) {
  const { projects, runningProcesses, stopProject, restartProject, killProcess, launchProject } =
    useAppStore();
  const project = projects.find((p) => p.id === projectId);

  // Get processes for this project (include stopped so tabs stay visible)
  const projectProcesses = runningProcesses.filter((p) => p.projectId === projectId);
  const activeProcesses = projectProcesses.filter(
    (p) => p.status !== 'stopped' && p.status !== 'killed'
  );
  const isRunning = activeProcesses.length > 0;

  // Track selected sub-tab
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null);

  // Auto-select first process when processes appear
  useEffect(() => {
    if (projectProcesses.length > 0 && !projectProcesses.find((p) => p.id === selectedProcessId)) {
      setSelectedProcessId(projectProcesses[0].id);
    }
  }, [projectProcesses, selectedProcessId]);

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-[14px]">
        Project not found.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header: project name + Restart + Stop All */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border-default shrink-0">
        {/* Project icon + name */}
        <ProjectIcon
          icon={project.icon}
          iconPath={project.icon_path}
          color={project.color}
          name={project.name}
          size={28}
          borderRadius={8}
        />
        <span className="text-[14px] font-semibold text-text-primary flex-1 min-w-0 truncate">
          {project.name}
        </span>

        {/* Restart button */}
        {isRunning && (
          <Button
            variant="ghost"
            size="sm"
            title="Restart all"
            onClick={() => restartProject(projectId)}
            className="text-accent hover:text-accent hover:border-accent/40 hover:bg-accent/10 border border-border-default"
          >
            <RefreshCw size={12} />
            Restart
          </Button>
        )}

        {/* Stop All button */}
        {isRunning && (
          <Button
            variant="ghost"
            size="sm"
            title="Stop all processes"
            onClick={() => stopProject(projectId)}
            className="text-danger hover:text-danger hover:border-danger/40 hover:bg-danger/10 border border-border-default"
          >
            <Square size={12} />
            Stop All
          </Button>
        )}

        {/* Launch button when not running */}
        {!isRunning && (
          <Button
            variant="ghost"
            size="sm"
            title="Launch project"
            onClick={() => launchProject(projectId)}
            className="text-success hover:text-success hover:border-success/40 hover:bg-success/10 border border-border-default"
          >
            ▶ Launch
          </Button>
        )}
      </div>

      {/* Process tab bar */}
      {projectProcesses.length > 0 && (
        <div className="flex items-center gap-0 px-2 border-b border-border-default shrink-0 overflow-x-auto bg-abyss">
          {projectProcesses.map((proc) => {
            const isActive = selectedProcessId === proc.id;
            const procRunning =
              proc.status !== 'stopped' && proc.status !== 'killed' && proc.status !== 'crashed';
            const procCrashed = proc.status === 'crashed';

            return (
              <div
                key={proc.id}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 cursor-pointer shrink-0 text-[12px] font-semibold whitespace-nowrap',
                  'transition-colors duration-150',
                  'border-b-2',
                  isActive
                    ? 'border-accent text-text-primary'
                    : 'border-transparent text-text-muted hover:text-text-primary'
                )}
                onClick={() => setSelectedProcessId(proc.id)}
              >
                {/* Status dot */}
                <span
                  className={cn(
                    'inline-block w-1.5 h-1.5 rounded-full shrink-0',
                    procRunning
                      ? 'bg-success shadow-[0_0_4px_var(--color-success)]'
                      : procCrashed
                        ? 'bg-danger'
                        : 'bg-text-muted'
                  )}
                />

                {/* Command name */}
                <span>{proc.commandName || proc.name || proc.id}</span>

                {/* Kill button for this process */}
                {procRunning && (
                  <IconButton
                    aria-label={`Kill ${proc.commandName || proc.name}`}
                    title={`Kill ${proc.commandName || proc.name}`}
                    variant="danger"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      killProcess(proc.id);
                    }}
                    className="w-[18px] h-[18px] rounded-sm"
                  >
                    <XIcon size={10} />
                  </IconButton>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Terminal output for selected process */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {selectedProcessId ? (
          <TerminalPanel
            key={selectedProcessId}
            processId={selectedProcessId}
            processName={
              projectProcesses.find((p) => p.id === selectedProcessId)?.commandName || undefined
            }
            projectId={projectId}
            onStop={() => stopProject(projectId)}
            onRestart={() => restartProject(projectId)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-text-muted p-4 text-center">
            <span className="text-[14px]">
              {project.start_commands && project.start_commands.length > 0
                ? 'Click Launch to start this project.'
                : 'No start commands configured.'}
            </span>
            {project.start_commands && project.start_commands.length > 0 && (
              <div className="text-[12px] text-text-muted">
                {project.start_commands.map((cmd, i) => (
                  <div key={i}>{cmd.name || cmd.command}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
