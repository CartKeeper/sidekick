import { useEffect, useState } from 'react';
import { Monitor, Lock } from 'lucide-react';
import { Select, Spinner, cn } from './ui';

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
    <div className="no-drag h-full overflow-auto px-5.5 py-5 text-text-primary">
      <div className="flex items-center justify-between mb-4.5">
        <h2 className="m-0 text-base font-bold tracking-tight">Preferences</h2>
        <span
          className="text-[11px] font-semibold text-success transition-opacity duration-200"
          style={{ opacity: savedFlash ? 1 : 0 }}
        >
          Saved
        </span>
      </div>

      <section className="mb-5.5">
        <div className="flex items-center gap-2 mb-2.5">
          <Monitor size={14} className="text-text-secondary" />
          <span className="text-[12px] font-semibold text-text-secondary tracking-widest uppercase">
            Dock Position
          </span>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-text-muted text-[13px]">
            <Spinner size={14} />
            Loading displays…
          </div>
        ) : (
          <>
            <label className="text-[12px] text-text-secondary block mb-1.5">
              Display
            </label>
            <Select
              value={displayId == null ? 'auto' : String(displayId)}
              onChange={(e) => onDisplayChange(e.target.value)}
              className="mb-3.5"
            >
              <option value="auto">Auto (whichever display the window is on)</option>
              {displays.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </Select>

            <label className="text-[12px] text-text-secondary block mb-1.5">
              Edge
            </label>
            <div className="flex gap-2">
              {(['left', 'right'] as const).map((option) => {
                const isActive = edge === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onEdgeChange(option)}
                    className={cn(
                      'flex-1 h-9.5 text-[13px] font-semibold rounded-md cursor-pointer capitalize',
                      'border transition-[background-color,color,border-color] duration-150',
                      'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
                      isActive
                        ? 'text-text-primary bg-accent/15 border-accent'
                        : 'text-text-muted bg-void border-border-default hover:bg-surface-hover hover:text-text-primary',
                    )}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
            <p className="text-[12px] text-text-muted mt-2.5 leading-normal">
              Sidekick docks to the chosen edge of the selected display. "Auto" uses whichever display the window is
              currently on when you switch to dock mode.
            </p>
          </>
        )}
      </section>

      <section>
        <div className="flex items-center gap-2 mb-2.5">
          <Lock size={14} className="text-text-secondary" />
          <span className="text-[12px] font-semibold text-text-secondary tracking-widest uppercase">
            Auto-Lock
          </span>
        </div>

        <label className="text-[12px] text-text-secondary block mb-1.5">
          Lock vault after idle
        </label>
        <Select
          value={autoLockMs == null ? 'null' : String(autoLockMs)}
          onChange={(e) => onAutoLockChange(e.target.value)}
        >
          {AUTO_LOCK_OPTIONS.map((opt) => (
            <option key={String(opt.value)} value={opt.value == null ? 'null' : String(opt.value)}>
              {opt.label}
            </option>
          ))}
        </Select>
        <p className="text-[12px] text-text-muted mt-2.5 leading-normal">
          Idle is measured by mouse and keyboard activity inside Sidekick. "Never" disables auto-lock until you quit
          or use Lock Vault from the tray.
        </p>
      </section>
    </div>
  );
}
