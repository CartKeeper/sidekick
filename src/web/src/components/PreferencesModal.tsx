import { useEffect, useState } from 'react';
import { Monitor, Lock, Palette } from 'lucide-react';
import { Select, Spinner, cn } from './ui';
import { ThemePicker } from './ThemePicker';

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

function SectionHeader({ icon: Icon, children }: { icon: typeof Monitor; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-1">
      <Icon size={14} className="text-text-secondary" />
      <span className="text-[12px] font-semibold text-text-secondary tracking-widest uppercase">{children}</span>
    </div>
  );
}

/** A tiny monitor glyph with the dock strip drawn on the chosen side — makes "edge" obvious. */
function EdgePreview({ side }: { side: 'left' | 'right' }) {
  return (
    <span className="relative block w-10 h-6.5 rounded border border-current/40">
      <span
        className={cn(
          'absolute top-1 bottom-1 w-[5px] rounded-[2px] bg-current',
          side === 'left' ? 'left-1' : 'right-1',
        )}
      />
    </span>
  );
}

/**
 * The settings body — shared by the dock-mode Preferences panel and the main-window
 * Settings dialog (gear). All dock options use the `window.sidekick` bridge, so they
 * work from either display mode.
 */
export function PreferencesContent() {
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

  const flashSaved = () => {
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1000);
  };

  const onDisplayChange = (value: string) => {
    const id = value === 'auto' ? null : Number(value);
    setDisplayId(id);
    window.sidekick?.setDockPosition?.({ displayId: id });
    flashSaved();
  };

  const onEdgeChange = (next: 'left' | 'right') => {
    setEdge(next);
    window.sidekick?.setDockPosition?.({ edge: next });
    flashSaved();
  };

  const onAutoLockChange = (value: string) => {
    const next = value === 'null' ? null : Number(value);
    setAutoLockMsState(next);
    window.sidekick?.setAutoLockTimeout?.(next);
    flashSaved();
  };

  return (
    <div className="flex flex-col gap-6 text-text-primary">
      {/* Saved indicator */}
      <span
        aria-live="polite"
        className="pointer-events-none -mb-3 self-end text-[11px] font-semibold text-success transition-opacity duration-200"
        style={{ opacity: savedFlash ? 1 : 0 }}
      >
        Saved ✓
      </span>

      {/* Appearance */}
      <section>
        <SectionHeader icon={Palette}>Appearance</SectionHeader>
        <p className="text-[12px] text-text-muted mb-3 leading-normal">
          Pick a skin. Applies everywhere and is remembered across restarts.
        </p>
        <ThemePicker />
      </section>

      {/* Dock Position */}
      <section>
        <SectionHeader icon={Monitor}>Dock Position</SectionHeader>
        <p className="text-[12px] text-text-muted mb-3 leading-normal">
          When you switch to the slim <strong className="text-text-secondary font-semibold">docked strip</strong>,
          this controls which screen it attaches to and which side it hugs.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-text-muted text-[13px]">
            <Spinner size={14} />
            Loading displays…
          </div>
        ) : (
          <>
            <label className="text-[12px] font-semibold text-text-secondary block mb-1">Monitor</label>
            <p className="text-[12px] text-text-muted mb-1.5 leading-normal">
              Which display the docked strip snaps to.
            </p>
            <Select
              value={displayId == null ? 'auto' : String(displayId)}
              onChange={(e) => onDisplayChange(e.target.value)}
              className="mb-4"
              aria-label="Dock display"
            >
              <option value="auto">Auto — follow the window's current screen</option>
              {displays.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                  {d.isPrimary ? ' (primary)' : ''}
                </option>
              ))}
            </Select>

            <label className="text-[12px] font-semibold text-text-secondary block mb-1">Side of the screen</label>
            <p className="text-[12px] text-text-muted mb-2 leading-normal">
              Which edge Sidekick clings to — pick the side that stays out of your way.
            </p>
            <div className="flex gap-2">
              {(['left', 'right'] as const).map((option) => {
                const isActive = edge === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onEdgeChange(option)}
                    aria-label={`Dock to the ${option} edge`}
                    aria-pressed={isActive}
                    className={cn(
                      'flex-1 flex flex-col items-center gap-1.5 py-3 rounded-lg cursor-pointer capitalize',
                      'border text-[12px] font-semibold',
                      'transition-[background-color,color,border-color] duration-150',
                      'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
                      isActive
                        ? 'text-accent bg-accent/15 border-accent'
                        : 'text-text-muted bg-void border-border-default hover:bg-surface-hover hover:text-text-primary',
                    )}
                  >
                    <EdgePreview side={option} />
                    {option}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* Auto-Lock */}
      <section>
        <SectionHeader icon={Lock}>Auto-Lock</SectionHeader>
        <p className="text-[12px] text-text-muted mb-3 leading-normal">
          Automatically lock the vault after you've been idle, so your secrets aren't left exposed.
        </p>
        <label className="text-[12px] font-semibold text-text-secondary block mb-1.5">Lock after idle</label>
        <Select
          value={autoLockMs == null ? 'null' : String(autoLockMs)}
          onChange={(e) => onAutoLockChange(e.target.value)}
          aria-label="Auto-lock timeout"
        >
          {AUTO_LOCK_OPTIONS.map((opt) => (
            <option key={String(opt.value)} value={opt.value == null ? 'null' : String(opt.value)}>
              {opt.label}
            </option>
          ))}
        </Select>
        <p className="text-[12px] text-text-muted mt-2 leading-normal">
          Idle = no mouse or keyboard activity inside Sidekick. “Never” keeps it unlocked until you quit or use Lock
          Vault.
        </p>
      </section>
    </div>
  );
}

/** Dock-mode preferences panel (rendered inside the dock panel). */
export function PreferencesPanel() {
  return (
    <div className="no-drag h-full overflow-auto px-5 py-5">
      <h2 className="m-0 mb-4 text-base font-bold tracking-tight text-text-primary">Preferences</h2>
      <PreferencesContent />
    </div>
  );
}
