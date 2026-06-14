import { Maximize2, Settings } from 'lucide-react';
import { useAppStore } from '../stores/app';
import { ProjectIcon } from './ProjectIcon';
import { IconButton, cn } from './ui';

interface DockStripProps {
  activeTab: string;
  onTabClick: (tabId: string) => void;
  onUndock: () => void;
}

// Convert a #rrggbb hex to rgba() so we can apply the project's color at a low
// opacity for the running glow. Falls back to the raw value if it isn't 6-hex.
function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? '').trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function StripTab({
  id,
  active,
  onClick,
  children,
  title,
  edge,
  glowColor,
  bare = false,
}: {
  id: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
  edge: 'left' | 'right';
  glowColor?: string;
  bare?: boolean;
}) {
  // COMPUTED: active indicator border lives on the outer (screen-facing) edge.
  // dock right → borderLeft; dock left → borderRight. Driven by runtime value.
  // `bare` tabs (the logo) carry no border or background — the icon stands alone.
  const indicatorStyle: React.CSSProperties = bare
    ? {}
    : edge === 'left'
      ? { borderRight: active ? '3px solid var(--color-accent)' : '3px solid transparent' }
      : { borderLeft: active ? '3px solid var(--color-accent)' : '3px solid transparent' };

  // A running project glows in its OWN color (the one chosen in Settings) — a
  // subtle backglow plus a faint tint, just enough to read "on" at a glance.
  if (glowColor && !bare) {
    indicatorStyle.boxShadow = `0 0 10px 1px ${hexToRgba(glowColor, 0.5)}`;
    if (!active) indicatorStyle.backgroundColor = hexToRgba(glowColor, 0.12);
  }

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
        'transition-[background-color,color,border-color,box-shadow] duration-150',
        'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
        bare
          ? 'bg-transparent'
          : active
            ? 'bg-accent/15 text-text-primary'
            : glowColor
              ? 'text-text-primary'
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

  // Projects pinned to the toolbar via the "Include in toolbar" checkbox. Shown
  // whether or not they have launch commands — a project with no commands just
  // opens when clicked instead of launching.
  const toolbarProjects = projects.filter(
    (p) => !p.archived && p.include_in_toolbar !== false
  );

  const isProjectRunning = (projectId: string) =>
    activeProcesses.some((p) => p.projectId === projectId);

  const handleProjectClick = async (projectId: string) => {
    const proj = toolbarProjects.find((p) => p.id === projectId);
    const hasCommands = !!(proj?.start_commands && proj.start_commands.length > 0);
    if (hasCommands && !isProjectRunning(projectId)) {
      await launchProject(projectId);
    }
    onTabClick(`project:${projectId}`);
  };

  return (
    <div
      className={cn(
        'no-drag flex-col items-center bg-abyss h-full py-3.5 gap-2.5 overflow-hidden',
        // COMPUTED: border side depends on dock edge runtime value
        edge === 'left' ? 'border-r border-border-default' : 'border-l border-border-default',
      )}
      // COMPUTED: fixed 72px width must stay inline — not a token
      style={{ width: '72px', flexShrink: 0, display: 'flex' }}
    >
      {/* Main app tab — Sidekick logo (bare: no tab background behind it) */}
      <StripTab
        id="main"
        edge={edge}
        active={activeTab === 'main'}
        onClick={() => onTabClick('main')}
        title="Sidekick"
        bare
      >
        <img src="/logo.png" alt="Sidekick" className="w-12 h-12 object-contain" />
      </StripTab>

      {/* Separator before launchable projects */}
      {toolbarProjects.length > 0 && (
        <div className="w-10 h-px bg-border-default my-1 shrink-0" />
      )}

      {/* Launchable project icons */}
      {toolbarProjects.map((proj) => {
        const running = isProjectRunning(proj.id);
        const tabId = `project:${proj.id}`;
        const isActive = activeTab === tabId;

        return (
          <StripTab
            key={proj.id}
            id={tabId}
            edge={edge}
            active={isActive}
            glowColor={running ? proj.color : undefined}
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
