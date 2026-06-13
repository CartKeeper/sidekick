import { Maximize2, Settings, Shield } from 'lucide-react';
import { useAppStore } from '../stores/app';
import { ProjectIcon } from './ProjectIcon';
import { IconButton, cn } from './ui';

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
  // COMPUTED: active indicator border lives on the outer (screen-facing) edge.
  // dock right → borderLeft; dock left → borderRight. Driven by runtime value.
  const indicatorStyle: React.CSSProperties =
    edge === 'left'
      ? { borderRight: active ? '3px solid var(--color-accent)' : '3px solid transparent' }
      : { borderLeft: active ? '3px solid var(--color-accent)' : '3px solid transparent' };

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      data-tab-id={id}
      style={indicatorStyle}
      className={cn(
        'w-14 h-14 rounded-xl flex items-center justify-center shrink-0',
        'border-y-0 border-[unset] cursor-pointer relative',
        'transition-[background-color,color,border-color] duration-150',
        'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
        active
          ? 'bg-accent/15 text-text-primary'
          : 'bg-transparent text-text-muted hover:bg-surface-hover hover:text-text-primary',
      )}
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

  // Projects that have launch commands and aren't hidden from the toolbar
  const launchableProjects = projects.filter(
    (p) => p.start_commands && p.start_commands.length > 0 && p.include_in_toolbar !== false
  );

  const isProjectRunning = (projectId: string) =>
    activeProcesses.some((p) => p.projectId === projectId);

  const handleProjectClick = async (projectId: string) => {
    if (!isProjectRunning(projectId)) {
      await launchProject(projectId);
    }
    onTabClick(`project:${projectId}`);
  };

  return (
    <div
      className={cn(
        'no-drag flex-col items-center bg-abyss h-full py-3.5 gap-1.5 overflow-hidden',
        // COMPUTED: border side depends on dock edge runtime value
        edge === 'left' ? 'border-r border-border-default' : 'border-l border-border-default',
      )}
      // COMPUTED: fixed 72px width must stay inline — not a token
      style={{ width: '72px', flexShrink: 0, display: 'flex' }}
    >
      {/* Main app tab — Sidekick shield */}
      <StripTab
        id="main"
        edge={edge}
        active={activeTab === 'main'}
        onClick={() => onTabClick('main')}
        title="Sidekick"
      >
        <Shield size={24} fill="var(--color-accent)" color="var(--color-accent)" />
      </StripTab>

      {/* Separator before launchable projects */}
      {launchableProjects.length > 0 && (
        <div className="w-10 h-px bg-border-default my-1 shrink-0" />
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
            <div className="relative">
              <ProjectIcon
                icon={proj.icon}
                iconPath={proj.icon_path}
                color={proj.color}
                name={proj.name}
                size={44}
                borderRadius={11}
              />
              {/* Running indicator dot */}
              {running && (
                <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-success shrink-0"
                  style={{
                    boxShadow: '0 0 4px var(--color-success)',
                    border: '2px solid var(--color-abyss)',
                  }}
                />
              )}
            </div>
          </StripTab>
        );
      })}

      {/* Spacer */}
      <div className="flex-1" />

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
      <IconButton
        aria-label="Detach to window"
        title="Detach to window"
        onClick={onUndock}
        className="w-14 h-14 rounded-xl shrink-0"
      >
        <Maximize2 size={20} />
      </IconButton>
    </div>
  );
}
