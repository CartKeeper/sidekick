import { Maximize2, Settings, Shield } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useAppStore } from '../stores/app';
import { ProjectIcon } from './ProjectIcon';

interface DockStripProps {
  activeTab: string;
  onTabClick: (tabId: string) => void;
  onUndock: () => void;
}

function StripTab({
  id,
  active,
  onClick,
  children,
  title,
  edge,
}: {
  id: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
  edge: 'left' | 'right';
}) {
  // Active indicator lives on the OUTER edge (screen-facing side):
  // dock on the right → indicator on the left; dock on the left → on the right
  const indicator = active ? '3px solid #6366f1' : '3px solid transparent';
  const indicatorStyle: React.CSSProperties =
    edge === 'left' ? { borderRight: indicator } : { borderLeft: indicator };
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      data-tab-id={id}
      style={{
        width: '56px',
        height: '56px',
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: active ? 'rgba(99,102,241,0.15)' : 'transparent',
        border: 'none',
        ...indicatorStyle,
        cursor: 'pointer',
        color: active ? '#e4e4ed' : '#6b6b80',
        transition: 'background-color 150ms ease, color 150ms ease, border-color 150ms ease',
        flexShrink: 0,
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#222230';
          (e.currentTarget as HTMLButtonElement).style.color = '#e4e4ed';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
          (e.currentTarget as HTMLButtonElement).style.color = '#6b6b80';
        }
      }}
    >
      {children}
    </button>
  );
}

export function DockStrip({ activeTab, onTabClick, onUndock }: DockStripProps) {
  const { runningProcesses, projects, launchProject, dockEdge } = useAppStore();
  const edge: 'left' | 'right' = dockEdge ?? 'right';

  // Only show actively running processes
  const activeProcesses = runningProcesses.filter(
    (p) => p.status !== 'stopped' && p.status !== 'killed'
  );

  // Projects that have launch commands
  const launchableProjects = projects.filter(
    (p) => p.start_commands && p.start_commands.length > 0
  );

  const isProjectRunning = (projectId: string) =>
    activeProcesses.some((p) => p.projectId === projectId);

  const handleProjectClick = async (projectId: string) => {
    if (!isProjectRunning(projectId)) {
      await launchProject(projectId);
    }
    onTabClick(`project:${projectId}`);
  };

  const btnStyle: React.CSSProperties = {
    width: '56px',
    height: '56px',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: '#6b6b80',
    transition: 'background-color 150ms ease, color 150ms ease',
    flexShrink: 0,
  };

  return (
    <div
      className="no-drag"
      style={{
        width: '72px',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        backgroundColor: '#12121a',
        ...(edge === 'left'
          ? { borderRight: '1px solid #2a2a3a' }
          : { borderLeft: '1px solid #2a2a3a' }),
        height: '100%',
        padding: '14px 0',
        gap: '6px',
        overflow: 'hidden',
      } as CSSProperties}
    >
      {/* Main app tab — Sidekick shield */}
      <StripTab
        id="main"
        edge={edge}
        active={activeTab === 'main'}
        onClick={() => onTabClick('main')}
        title="Sidekick"
      >
        <Shield size={24} fill="#6366f1" color="#6366f1" />
      </StripTab>

      {/* Separator before launchable projects */}
      {launchableProjects.length > 0 && (
        <div
          style={{
            width: '40px',
            height: '1px',
            backgroundColor: '#2a2a3a',
            margin: '4px 0',
            flexShrink: 0,
          }}
        />
      )}

      {/* Launchable project icons */}
      {launchableProjects.map((proj) => {
        const running = isProjectRunning(proj.id);
        const tabId = `project:${proj.id}`;
        const isActive = activeTab === tabId;

        return (
          <StripTab
            key={proj.id}
            id={tabId}
            edge={edge}
            active={isActive}
            onClick={() => handleProjectClick(proj.id)}
            title={proj.name}
          >
            <div style={{ position: 'relative' }}>
              <ProjectIcon
                icon={proj.icon}
                iconPath={proj.icon_path}
                color={proj.color}
                name={proj.name}
                size={44}
                borderRadius={11}
              />
              {/* Running indicator */}
              {running && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '-2px',
                    right: '-2px',
                    width: '8px',
                    height: '8px',
                    borderRadius: '9999px',
                    backgroundColor: '#a6e3a1',
                    boxShadow: '0 0 4px #a6e3a1',
                    border: '2px solid #12121a',
                  }}
                />
              )}
            </div>
          </StripTab>
        );
      })}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Preferences (dock position, etc.) */}
      <StripTab
        id="preferences"
        edge={edge}
        active={activeTab === 'preferences'}
        onClick={() => onTabClick('preferences')}
        title="Preferences"
      >
        <Settings size={20} />
      </StripTab>

      {/* Undock / pop out button */}
      <button
        type="button"
        title="Detach to window"
        onClick={onUndock}
        style={btnStyle}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#222230';
          (e.currentTarget as HTMLButtonElement).style.color = '#e4e4ed';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
          (e.currentTarget as HTMLButtonElement).style.color = '#6b6b80';
        }}
      >
        <Maximize2 size={20} />
      </button>
    </div>
  );
}
