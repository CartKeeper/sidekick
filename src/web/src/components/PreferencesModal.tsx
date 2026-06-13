import { useEffect, useState } from 'react';
import { Monitor, Loader2, Lock } from 'lucide-react';

const AUTO_LOCK_OPTIONS: { label: string; value: number | null }[] = [
  { label: '15 minutes', value: 15 * 60 * 1000 },
  { label: '30 minutes', value: 30 * 60 * 1000 },
  { label: '1 hour', value: 60 * 60 * 1000 },
  { label: '4 hours', value: 4 * 60 * 60 * 1000 },
  { label: '8 hours', value: 8 * 60 * 60 * 1000 },
  { label: 'Never', value: null },
];

interface DisplayInfo {
  id: number;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  workArea: { x: number; y: number; width: number; height: number };
  isPrimary: boolean;
}

export function PreferencesPanel() {
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [displayId, setDisplayId] = useState<number | null>(null);
  const [edge, setEdge] = useState<'left' | 'right'>('right');
  const [autoLockMs, setAutoLockMsState] = useState<number | null>(30 * 60 * 1000);
  const [loading, setLoading] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      window.sidekick?.listDisplays?.() ?? Promise.resolve([]),
      window.sidekick?.getDockPosition?.() ?? Promise.resolve({ displayId: null, edge: 'right' as const }),
      window.sidekick?.getAutoLockTimeout?.() ?? Promise.resolve(30 * 60 * 1000),
    ])
      .then(([disp, pos, lockMs]) => {
        setDisplays(disp);
        setDisplayId(pos.displayId);
        setEdge(pos.edge);
        setAutoLockMsState(lockMs);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (next: { displayId?: number | null; edge?: 'left' | 'right' }) => {
    await window.sidekick?.setDockPosition?.(next);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1000);
  };

  const onDisplayChange = (value: string) => {
    const id = value === 'auto' ? null : Number(value);
    setDisplayId(id);
    handleSave({ displayId: id });
  };

  const onEdgeChange = (next: 'left' | 'right') => {
    setEdge(next);
    handleSave({ edge: next });
  };

  const onAutoLockChange = (value: string) => {
    const next = value === 'null' ? null : Number(value);
    setAutoLockMsState(next);
    window.sidekick?.setAutoLockTimeout?.(next);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1000);
  };

  return (
    <div
      className="no-drag"
      style={{
        height: '100%',
        overflow: 'auto',
        padding: '20px 22px',
        color: '#e4e4ed',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
        <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, letterSpacing: '-0.01em' }}>Preferences</h2>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: '#22c55e',
            opacity: savedFlash ? 1 : 0,
            transition: 'opacity 200ms ease',
          }}
        >
          Saved
        </span>
      </div>

      <section style={{ marginBottom: '22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <Monitor size={14} color="#a1a1b5" />
          <span
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: '#a1a1b5',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            Dock Position
          </span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#6b6b80', fontSize: '13px' }}>
            <Loader2 size={14} className="animate-spin" />
            Loading displays…
          </div>
        ) : (
          <>
            <label
              style={{
                fontSize: '12px',
                color: '#a1a1b5',
                display: 'block',
                marginBottom: '6px',
              }}
            >
              Display
            </label>
            <select
              value={displayId == null ? 'auto' : String(displayId)}
              onChange={(e) => onDisplayChange(e.target.value)}
              style={{
                width: '100%',
                height: '38px',
                padding: '0 10px',
                fontSize: '13px',
                color: '#e4e4ed',
                backgroundColor: '#12121a',
                border: '1px solid #2a2a3a',
                borderRadius: '8px',
                outline: 'none',
                marginBottom: '14px',
              }}
            >
              <option value="auto">Auto (whichever display the window is on)</option>
              {displays.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>

            <label
              style={{
                fontSize: '12px',
                color: '#a1a1b5',
                display: 'block',
                marginBottom: '6px',
              }}
            >
              Edge
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['left', 'right'] as const).map((option) => {
                const isActive = edge === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onEdgeChange(option)}
                    style={{
                      flex: 1,
                      height: '38px',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: isActive ? '#e4e4ed' : '#6b6b80',
                      backgroundColor: isActive ? 'rgba(99,102,241,0.15)' : '#12121a',
                      border: `1px solid ${isActive ? '#6366f1' : '#2a2a3a'}`,
                      borderRadius: '8px',
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                      transition: 'background-color 150ms ease, color 150ms ease, border-color 150ms ease',
                    }}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
            <p style={{ fontSize: '12px', color: '#6b6b80', marginTop: '10px', lineHeight: 1.5 }}>
              Sidekick docks to the chosen edge of the selected display. "Auto" uses whichever display the window is
              currently on when you switch to dock mode.
            </p>
          </>
        )}
      </section>

      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <Lock size={14} color="#a1a1b5" />
          <span
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: '#a1a1b5',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            Auto-Lock
          </span>
        </div>

        <label style={{ fontSize: '12px', color: '#a1a1b5', display: 'block', marginBottom: '6px' }}>
          Lock vault after idle
        </label>
        <select
          value={autoLockMs == null ? 'null' : String(autoLockMs)}
          onChange={(e) => onAutoLockChange(e.target.value)}
          style={{
            width: '100%',
            height: '38px',
            padding: '0 10px',
            fontSize: '13px',
            color: '#e4e4ed',
            backgroundColor: '#12121a',
            border: '1px solid #2a2a3a',
            borderRadius: '8px',
            outline: 'none',
          }}
        >
          {AUTO_LOCK_OPTIONS.map((opt) => (
            <option key={String(opt.value)} value={opt.value == null ? 'null' : String(opt.value)}>
              {opt.label}
            </option>
          ))}
        </select>
        <p style={{ fontSize: '12px', color: '#6b6b80', marginTop: '10px', lineHeight: 1.5 }}>
          Idle is measured by mouse and keyboard activity inside Sidekick. "Never" disables auto-lock until you quit
          or use Lock Vault from the tray.
        </p>
      </section>
    </div>
  );
}
