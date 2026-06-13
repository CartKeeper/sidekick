import { useState, useEffect } from 'react';
import { RefreshCw, Square, X as XIcon } from 'lucide-react';
import { useAppStore } from '../stores/app';
import { TerminalPanel } from './TerminalPanel';
import { ProjectIcon } from './ProjectIcon';

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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: '#6b6b80',
          fontSize: '14px',
        }}
      >
        Project not found.
      </div>
    );
  }

  const headerBtnStyle: React.CSSProperties = {
    height: '32px',
    padding: '0 12px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    borderRadius: '8px',
    border: '1px solid #2a2a3a',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 600,
    transition: 'color 150ms ease, border-color 150ms ease, background-color 150ms ease',
    flexShrink: 0,
    whiteSpace: 'nowrap',
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Header: project name + Restart + Stop All */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 16px',
          borderBottom: '1px solid #2a2a3a',
          flexShrink: 0,
        }}
      >
        {/* Project icon + name */}
        <ProjectIcon
          icon={project.icon}
          iconPath={project.icon_path}
          color={project.color}
          name={project.name}
          size={28}
          borderRadius={8}
        />
        <span
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: '#e4e4ed',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {project.name}
        </span>

        {/* Restart button */}
        {isRunning && (
          <button
            type="button"
            title="Restart all"
            onClick={() => restartProject(projectId)}
            style={{ ...headerBtnStyle, color: '#89b4fa' }}
            onMouseEnter={(e) => {
              const el = e.currentTarget;
              el.style.borderColor = 'rgba(137,180,250,0.4)';
              el.style.backgroundColor = 'rgba(137,180,250,0.08)';
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget;
              el.style.borderColor = '#2a2a3a';
              el.style.backgroundColor = 'transparent';
            }}
          >
            <RefreshCw size={12} />
            Restart
          </button>
        )}

        {/* Stop All button */}
        {isRunning && (
          <button
            type="button"
            title="Stop all processes"
            onClick={() => stopProject(projectId)}
            style={{ ...headerBtnStyle, color: '#f38ba8' }}
            onMouseEnter={(e) => {
              const el = e.currentTarget;
              el.style.borderColor = 'rgba(243,139,168,0.4)';
              el.style.backgroundColor = 'rgba(243,139,168,0.08)';
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget;
              el.style.borderColor = '#2a2a3a';
              el.style.backgroundColor = 'transparent';
            }}
          >
            <Square size={12} />
            Stop All
          </button>
        )}

        {/* Launch button when not running */}
        {!isRunning && (
          <button
            type="button"
            title="Launch project"
            onClick={() => launchProject(projectId)}
            style={{ ...headerBtnStyle, color: '#a6e3a1' }}
            onMouseEnter={(e) => {
              const el = e.currentTarget;
              el.style.borderColor = 'rgba(166,227,161,0.4)';
              el.style.backgroundColor = 'rgba(166,227,161,0.08)';
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget;
              el.style.borderColor = '#2a2a3a';
              el.style.backgroundColor = 'transparent';
            }}
          >
            ▶ Launch
          </button>
        )}
      </div>

      {/* Process tab bar */}
      {projectProcesses.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0',
            padding: '0 8px',
            borderBottom: '1px solid #2a2a3a',
            flexShrink: 0,
            overflowX: 'auto',
            backgroundColor: '#0d0d14',
          }}
        >
          {projectProcesses.map((proc) => {
            const isActive = selectedProcessId === proc.id;
            const procRunning =
              proc.status !== 'stopped' && proc.status !== 'killed' && proc.status !== 'crashed';
            const procCrashed = proc.status === 'crashed';

            return (
              <div
                key={proc.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 12px',
                  cursor: 'pointer',
                  borderBottom: isActive ? '2px solid #6366f1' : '2px solid transparent',
                  color: isActive ? '#e4e4ed' : '#6b6b80',
                  fontSize: '12px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  transition: 'color 150ms ease, border-color 150ms ease',
                  flexShrink: 0,
                }}
                onClick={() => setSelectedProcessId(proc.id)}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.color = '#e4e4ed';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.color = '#6b6b80';
                  }
                }}
              >
                {/* Status dot */}
                <span
                  style={{
                    display: 'inline-block',
                    width: '6px',
                    height: '6px',
                    borderRadius: '9999px',
                    backgroundColor: procRunning ? '#a6e3a1' : procCrashed ? '#f38ba8' : '#585b70',
                    boxShadow: procRunning ? '0 0 4px #a6e3a1' : 'none',
                    flexShrink: 0,
                  }}
                />

                {/* Command name */}
                <span>{proc.commandName || proc.name || proc.id}</span>

                {/* Kill button for this process */}
                {procRunning && (
                  <button
                    type="button"
                    title={`Kill ${proc.commandName || proc.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      killProcess(proc.id);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '18px',
                      height: '18px',
                      borderRadius: '4px',
                      border: 'none',
                      backgroundColor: 'transparent',
                      cursor: 'pointer',
                      color: '#585b70',
                      padding: 0,
                      transition: 'color 150ms ease, background-color 150ms ease',
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => {
                      const el = e.currentTarget;
                      el.style.color = '#f38ba8';
                      el.style.backgroundColor = 'rgba(243,139,168,0.1)';
                    }}
                    onMouseLeave={(e) => {
                      const el = e.currentTarget;
                      el.style.color = '#585b70';
                      el.style.backgroundColor = 'transparent';
                    }}
                  >
                    <XIcon size={10} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Terminal output for selected process */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
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
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: '12px',
              color: '#6b6b80',
              padding: '16px',
              textAlign: 'center',
            }}
          >
            <span style={{ fontSize: '14px' }}>
              {project.start_commands && project.start_commands.length > 0
                ? 'Click Launch to start this project.'
                : 'No start commands configured.'}
            </span>
            {project.start_commands && project.start_commands.length > 0 && (
              <div style={{ fontSize: '12px', color: '#585b70' }}>
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
