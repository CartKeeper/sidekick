import { Maximize2, Lock } from 'lucide-react';
import { useAppStore } from '../stores/app';

interface DockStripProps {
  activeTab: string;
  onTabClick: (tabId: string) => void;
  onUndock: () => void;
  onLock: () => void;
}

// Generate a deterministic color for a process based on its name
function getProcessColor(name: string): string {
  const colors = [
    '#6366f1', // indigo
    '#a855f7', // purple
    '#ec4899', // pink
    '#f59e0b', // amber
    '#22c55e', // green
    '#3b82f6', // blue
    '#06b6d4', // cyan
    '#14b8a6', // teal
    '#f97316', // orange
    '#ef4444', // red
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function StripTab({
  id,
  active,
  onClick,
  children,
  title,
}: {
  id: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      data-tab-id={id}
      style={{
        width: '36px',
        height: '36px',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: active ? 'rgba(99,102,241,0.15)' : 'transparent',
        border: 'none',
        borderLeft: active ? '3px solid #6366f1' : '3px solid transparent',
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

export function DockStrip({ activeTab, onTabClick, onUndock, onLock }: DockStripProps) {
  const { runningProcesses } = useAppStore();

  // Only show actively running processes
  const activeProcesses = runningProcesses.filter(
    (p) => p.status !== 'stopped' && p.status !== 'killed'
  );

  const btnStyle: React.CSSProperties = {
    width: '36px',
    height: '36px',
    borderRadius: '8px',
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
        width: '52px',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        backgroundColor: '#12121a',
        borderLeft: '1px solid #2a2a3a',
        height: '100%',
        padding: '12px 0',
        gap: '4px',
        overflow: 'hidden',
      }}
    >
      {/* Main app tab — Sidekick shield */}
      <StripTab
        id="main"
        active={activeTab === 'main'}
        onClick={() => onTabClick('main')}
        title="Sidekick"
      >
        <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#6366f1' }} />
      </StripTab>

      {/* Separator */}
      {activeProcesses.length > 0 && (
        <div
          style={{
            width: '24px',
            height: '1px',
            backgroundColor: '#2a2a3a',
            margin: '4px 0',
            flexShrink: 0,
          }}
        />
      )}

      {/* Running process tabs */}
      {activeProcesses.map((proc) => {
        const color = getProcessColor(proc.name || proc.id);
        const letter = (proc.name || proc.id || '?').charAt(0).toUpperCase();
        return (
          <StripTab
            key={proc.id}
            id={proc.id}
            active={activeTab === proc.id}
            onClick={() => onTabClick(proc.id)}
            title={proc.name || proc.id}
          >
            <div
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '6px',
                backgroundColor: `${color}22`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                fontWeight: 700,
                color: color,
                fontFamily: 'var(--font-mono, monospace)',
              }}
            >
              {letter}
            </div>
          </StripTab>
        );
      })}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

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
        <Maximize2 size={16} />
      </button>

      {/* Lock vault button */}
      <button
        type="button"
        title="Lock vault"
        onClick={onLock}
        style={btnStyle}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(239,68,68,0.1)';
          (e.currentTarget as HTMLButtonElement).style.color = '#ef4444';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
          (e.currentTarget as HTMLButtonElement).style.color = '#6b6b80';
        }}
      >
        <Lock size={16} />
      </button>
    </div>
  );
}
