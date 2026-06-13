import { useEffect, useState, useRef, useCallback, useId } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Lock, Maximize2 } from 'lucide-react';
import { useAppStore } from './stores/app';
import { SetupScreen } from './components/SetupScreen';
import { UnlockScreen } from './components/UnlockScreen';
import { MigrationScreen } from './components/MigrationScreen';
import { Layout } from './components/Layout';
import { DockLayout } from './components/DockLayout';
import { api } from './api/client';
import { Button, Input, cn } from './components/ui';

// TypeScript declarations for the Electron preload bridge
declare global {
  interface Window {
    sidekick?: {
      platform: string;
      togglePanel: () => void;
      switchToDocked: () => void;
      switchToDetached: () => void;
      getDockState: () => { dockMode: boolean; panelOpen: boolean; dockEdge: 'left' | 'right' };
      reportActivity: () => void;
      setAutoLockTimeout?: (ms: number | null) => void;
      getAutoLockTimeout?: () => Promise<number | null>;
      openExternal: (url: string) => void;
      openInVscode: (path: string) => void;
      onDockState: (
        callback: (state: { dockMode: boolean; panelOpen: boolean; dockEdge: 'left' | 'right' }) => void
      ) => () => void;
      onLockVault: (callback: () => void) => () => void;
      listDisplays: () => Promise<
        { id: number; label: string; bounds: { x: number; y: number; width: number; height: number }; workArea: { x: number; y: number; width: number; height: number }; isPrimary: boolean }[]
      >;
      getDockPosition: () => Promise<{ displayId: number | null; edge: 'left' | 'right' }>;
      setDockPosition: (pos: { displayId?: number | null; edge?: 'left' | 'right' }) => Promise<{ ok: boolean }>;
    };
  }
}

function DockUnlockLayout() {
  const unlock = useAppStore((s) => s.unlock);
  const dockEdge = useAppStore((s) => s.dockEdge);
  const panelOpen = useAppStore((s) => s.panelOpen);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const passwordId = useId();

  // Auto-open the panel on mount IFF it is currently closed.
  // Lock can be triggered while the panel is already open — in that case the
  // Electron-side panelOpen is already true, and a blind togglePanel() would
  // close it (leaving the unlock form unreachable until the app is relaunched).
  useEffect(() => {
    const state = window.sidekick?.getDockState?.();
    if (state && !state.panelOpen && window.sidekick?.togglePanel) {
      window.sidekick.togglePanel();
    }
    // No local state to set — the dock-state event listener in <App/> will
    // sync the store's panelOpen for us.
  }, []);

  // Focus the password input whenever the panel becomes visible
  useEffect(() => {
    if (panelOpen) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [panelOpen]);

  const handleTogglePanel = () => {
    // Drive Electron only; the dock-state echo will update the store.
    if (window.sidekick?.togglePanel) {
      window.sidekick.togglePanel();
    }
  };

  const handleUndock = () => {
    if (window.sidekick?.switchToDetached) {
      window.sidekick.switchToDetached();
    } else {
      useAppStore.getState().setDockMode(false);
    }
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!password) {
      setError('Please enter your master password.');
      return;
    }
    setLoading(true);
    try {
      await unlock(password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Incorrect password.');
      setLoading(false);
      setPassword('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  return (
    <div
      className="flex h-screen bg-void overflow-hidden"
      style={{ flexDirection: dockEdge === 'left' ? 'row-reverse' : 'row' }}
    >
      {/* Unlock panel */}
      <AnimatePresence>
        {panelOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 600, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className={cn(
              'shrink-0 overflow-hidden flex flex-col bg-void h-full',
              dockEdge === 'left' ? 'border-l border-border-default' : 'border-r border-border-default',
            )}
          >
            <div className="w-150 h-full flex flex-col">
              {/* Drag region */}
              <div className="drag-region h-10 w-full shrink-0" />

              {/* Centered unlock form */}
              <div className="flex-1 flex items-center justify-center px-6 pb-10">
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: 'easeOut', delay: 0.1 }}
                  className="w-full max-w-85"
                >
                  <div className="bg-surface border border-border-default rounded-xl p-4">
                    {/* Lock icon + title */}
                    <div className="flex flex-col items-center gap-3 mb-6">
                      <div className="w-10 h-10 rounded-lg bg-accent-muted flex items-center justify-center">
                        <Lock size={20} className="text-accent" />
                      </div>
                      <div className="text-center">
                        <h1 className="text-[20px] font-bold text-text-primary leading-tight m-0">
                          Sidekick
                        </h1>
                        <p className="text-[13px] text-text-muted mt-1">
                          Vault is locked
                        </p>
                      </div>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} noValidate>
                      <div className="mb-4">
                        <label
                          htmlFor={passwordId}
                          className="block text-[12px] font-semibold text-text-secondary mb-1.5"
                        >
                          Master Password
                        </label>
                        <Input
                          ref={inputRef}
                          id={passwordId}
                          type="password"
                          revealable
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Enter master password"
                          autoComplete="current-password"
                          error={!!error}
                        />
                        {error && (
                          <p className="text-[12px] font-semibold text-danger mt-1">
                            {error}
                          </p>
                        )}
                      </div>

                      <Button
                        type="submit"
                        variant="primary"
                        size="md"
                        loading={loading}
                        className="w-full"
                      >
                        {loading ? 'Unlocking…' : 'Unlock'}
                      </Button>
                    </form>
                  </div>
                </motion.div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dock strip — sits on the configured screen edge */}
      <div
        className={cn(
          'no-drag w-18 shrink-0 flex flex-col items-center bg-abyss h-full py-3.5 gap-1.5 overflow-hidden',
          dockEdge === 'left' ? 'border-r border-border-default' : 'border-l border-border-default',
        )}
      >
        {/* Lock icon — tap to toggle panel */}
        <button
          type="button"
          aria-label={panelOpen ? 'Close unlock panel' : 'Unlock vault'}
          onClick={handleTogglePanel}
          className={cn(
            'w-14 h-14 rounded-xl flex items-center justify-center shrink-0',
            'border-transparent transition-colors duration-150',
            panelOpen
              ? 'bg-accent-muted text-text-primary'
              : 'bg-transparent text-text-muted hover:bg-surface-hover hover:text-text-primary',
          )}
          style={
            panelOpen
              ? dockEdge === 'left'
                ? { borderRight: '3px solid var(--color-accent)' }
                : { borderLeft: '3px solid var(--color-accent)' }
              : dockEdge === 'left'
                ? { borderRight: '3px solid transparent' }
                : { borderLeft: '3px solid transparent' }
          }
        >
          <Lock size={24} />
        </button>

        <div className="flex-1" />

        {/* Undock button */}
        <button
          type="button"
          aria-label="Detach to window"
          onClick={handleUndock}
          className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 bg-transparent text-text-muted hover:bg-surface-hover hover:text-text-primary transition-colors duration-150"
        >
          <Maximize2 size={20} />
        </button>
      </div>
    </div>
  );
}

export function App() {
  const {
    needsSetup,
    isLocked,
    authLoading,
    checkAuth,
    dockMode,
    setDockMode,
    setPanelOpen,
    setDockEdge,
    lock,
  } = useAppStore();

  const [migrationChecked, setMigrationChecked] = useState(false);
  const [showMigration, setShowMigration] = useState(false);
  const [migrationPreview, setMigrationPreview] = useState<any>(null);

  // Track the previous locked state so we know when a fresh unlock occurred
  const wasLockedRef = useRef<boolean | null>(null);

  // Throttle activity reporting to avoid flooding IPC
  const lastActivityRef = useRef(0);
  const ACTIVITY_THROTTLE_MS = 30_000; // Report activity at most every 30 seconds

  const reportActivity = useCallback(() => {
    const now = Date.now();
    if (now - lastActivityRef.current > ACTIVITY_THROTTLE_MS) {
      lastActivityRef.current = now;
      if (window.sidekick?.reportActivity) {
        window.sidekick.reportActivity();
      }
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Listen for dock state changes from Electron main process
  useEffect(() => {
    if (!window.sidekick?.onDockState) return;

    // Sync initial state from Electron
    if (window.sidekick.getDockState) {
      const initial = window.sidekick.getDockState();
      setDockMode(initial.dockMode);
      setPanelOpen(initial.panelOpen);
      if (initial.dockEdge) setDockEdge(initial.dockEdge);
    }

    const unsubscribe = window.sidekick.onDockState((state) => {
      setDockMode(state.dockMode);
      setPanelOpen(state.panelOpen);
      if (state.dockEdge) setDockEdge(state.dockEdge);
    });

    return unsubscribe;
  }, [setDockMode, setPanelOpen, setDockEdge]);

  // Listen for auto-lock from Electron main process
  useEffect(() => {
    if (!window.sidekick?.onLockVault) return;

    const unsubscribe = window.sidekick.onLockVault(() => {
      lock();
    });

    return unsubscribe;
  }, [lock]);

  // Report user activity for auto-lock timer reset
  useEffect(() => {
    if (!window.sidekick?.reportActivity) return;

    const events = ['mousedown', 'keydown', 'mousemove', 'touchstart'] as const;
    const handler = () => reportActivity();

    for (const event of events) {
      window.addEventListener(event, handler, { passive: true });
    }

    return () => {
      for (const event of events) {
        window.removeEventListener(event, handler);
      }
    };
  }, [reportActivity]);

  // After the vault unlocks, check for migration sources exactly once per session.
  useEffect(() => {
    if (authLoading) return;

    const nowUnlocked = !needsSetup && !isLocked;
    const justUnlocked = wasLockedRef.current === true && nowUnlocked;
    const freshLoad = wasLockedRef.current === null && nowUnlocked;

    // Update the ref to track current state
    wasLockedRef.current = isLocked;

    if ((justUnlocked || freshLoad) && !migrationChecked) {
      setMigrationChecked(true);

      // Don't show if user previously dismissed
      if (localStorage.getItem('sidekick_migration_dismissed') === 'true') return;

      api.migration.detect().then((result) => {
        const sources: any[] = result.sources ?? [];
        if (sources.length > 0) {
          setMigrationPreview(result.preview ?? {});
          setShowMigration(true);
        }
      }).catch(() => {
        // Migration detection failure is non-fatal — proceed to the app
      });
    }
  }, [authLoading, needsSetup, isLocked, migrationChecked]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <div className="text-text-muted text-[14px]">Loading...</div>
      </div>
    );
  }

  if (needsSetup) return <SetupScreen />;
  if (isLocked && !dockMode) return <UnlockScreen />;
  if (isLocked && dockMode) return <DockUnlockLayout />;

  if (showMigration && migrationPreview) {
    return (
      <MigrationScreen
        preview={migrationPreview}
        onComplete={() => {
          localStorage.setItem('sidekick_migration_dismissed', 'true');
          setShowMigration(false);
        }}
        onSkip={() => {
          localStorage.setItem('sidekick_migration_dismissed', 'true');
          setShowMigration(false);
        }}
      />
    );
  }

  // Render based on dock mode
  if (dockMode) {
    return <DockLayout />;
  }

  return <Layout />;
}
