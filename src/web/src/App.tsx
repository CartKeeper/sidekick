import { useEffect, useState, useRef, useCallback, useId } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Lock, Eye, EyeOff, Maximize2, Shield } from 'lucide-react';
import { useAppStore } from './stores/app';
import { SetupScreen } from './components/SetupScreen';
import { UnlockScreen } from './components/UnlockScreen';
import { MigrationScreen } from './components/MigrationScreen';
import { Layout } from './components/Layout';
import { DockLayout } from './components/DockLayout';
import { api } from './api/client';

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
  const [showPassword, setShowPassword] = useState(false);
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

  const stripBtnStyle: React.CSSProperties = {
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
      style={{
        display: 'flex',
        flexDirection: dockEdge === 'left' ? 'row-reverse' : 'row',
        height: '100vh',
        backgroundColor: '#0a0a0f',
        overflow: 'hidden',
      }}
    >
      {/* Unlock panel */}
      <AnimatePresence>
        {panelOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 600, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            style={{
              flexShrink: 0,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: '#0a0a0f',
              borderRight: '1px solid #2a2a3a',
              height: '100%',
            }}
          >
            <div style={{ width: '600px', height: '100%', display: 'flex', flexDirection: 'column' }}>
              {/* Drag region */}
              <div className="drag-region" style={{ height: '40px', width: '100%', flexShrink: 0 }} />

              {/* Centered unlock form */}
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 24px 40px',
                }}
              >
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: 'easeOut', delay: 0.1 }}
                  style={{ width: '100%', maxWidth: '340px' }}
                >
                  <div
                    style={{
                      backgroundColor: '#1a1a25',
                      border: '1px solid #2a2a3a',
                      borderRadius: '12px',
                      padding: '16px',
                    }}
                  >
                    {/* Lock icon + title */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '12px',
                        marginBottom: '24px',
                      }}
                    >
                      <div
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '8px',
                          backgroundColor: 'rgba(99,102,241,0.15)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Lock size={20} color="#6366f1" />
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <h1
                          style={{
                            fontSize: '20px',
                            fontWeight: 700,
                            color: '#e4e4ed',
                            lineHeight: 1.2,
                            margin: 0,
                          }}
                        >
                          Sidekick
                        </h1>
                        <p
                          style={{
                            fontSize: '13px',
                            color: '#6b6b80',
                            marginTop: '4px',
                            margin: '4px 0 0',
                          }}
                        >
                          Vault is locked
                        </p>
                      </div>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} noValidate>
                      <div style={{ marginBottom: '16px' }}>
                        <label
                          htmlFor={passwordId}
                          style={{
                            display: 'block',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: '#a1a1b5',
                            marginBottom: '6px',
                          }}
                        >
                          Master Password
                        </label>
                        <div style={{ position: 'relative' }}>
                          <input
                            ref={inputRef}
                            id={passwordId}
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter master password"
                            autoComplete="current-password"
                            style={{
                              width: '100%',
                              height: '40px',
                              backgroundColor: '#0d0d14',
                              border: `1px solid ${error ? '#ef4444' : '#2a2a3a'}`,
                              borderRadius: '8px',
                              padding: '0 40px 0 12px',
                              fontSize: '14px',
                              color: '#e4e4ed',
                              outline: 'none',
                              transition: 'border-color 150ms ease',
                              boxSizing: 'border-box',
                            }}
                            onFocus={(e) => {
                              if (!error) e.currentTarget.style.borderColor = '#6366f1';
                            }}
                            onBlur={(e) => {
                              if (!error) e.currentTarget.style.borderColor = '#2a2a3a';
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            tabIndex={-1}
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                            style={{
                              position: 'absolute',
                              right: '12px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: '#6b6b80',
                              padding: 0,
                              display: 'flex',
                            }}
                          >
                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                        {error && (
                          <p
                            style={{
                              fontSize: '12px',
                              fontWeight: 600,
                              color: '#ef4444',
                              marginTop: '4px',
                              margin: '4px 0 0',
                            }}
                          >
                            {error}
                          </p>
                        )}
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        style={{
                          width: '100%',
                          height: '40px',
                          borderRadius: '8px',
                          padding: '0 16px',
                          fontSize: '14px',
                          fontWeight: 600,
                          color: '#ffffff',
                          backgroundColor: '#6366f1',
                          border: 'none',
                          cursor: loading ? 'not-allowed' : 'pointer',
                          opacity: loading ? 0.5 : 1,
                          transition: 'background-color 150ms ease',
                        }}
                        onMouseEnter={(e) => {
                          if (!loading)
                            (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#5558e6';
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#6366f1';
                        }}
                      >
                        {loading ? 'Unlocking\u2026' : 'Unlock'}
                      </button>
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
        className="no-drag"
        style={{
          width: '72px',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          backgroundColor: '#12121a',
          ...(dockEdge === 'left'
            ? { borderRight: '1px solid #2a2a3a' }
            : { borderLeft: '1px solid #2a2a3a' }),
          height: '100%',
          padding: '14px 0',
          gap: '6px',
          overflow: 'hidden',
        } as React.CSSProperties}
      >
        {/* Lock icon — tap to toggle panel */}
        <button
          type="button"
          title={panelOpen ? 'Close unlock panel' : 'Unlock vault'}
          onClick={handleTogglePanel}
          style={{
            ...stripBtnStyle,
            backgroundColor: panelOpen ? 'rgba(99,102,241,0.15)' : 'transparent',
            ...(dockEdge === 'left'
              ? { borderRight: panelOpen ? '3px solid #6366f1' : '3px solid transparent' }
              : { borderLeft: panelOpen ? '3px solid #6366f1' : '3px solid transparent' }),
            color: panelOpen ? '#e4e4ed' : '#6b6b80',
          }}
          onMouseEnter={(e) => {
            if (!panelOpen) {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#222230';
              (e.currentTarget as HTMLButtonElement).style.color = '#e4e4ed';
            }
          }}
          onMouseLeave={(e) => {
            if (!panelOpen) {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
              (e.currentTarget as HTMLButtonElement).style.color = '#6b6b80';
            }
          }}
        >
          <Lock size={24} />
        </button>

        <div style={{ flex: 1 }} />

        {/* Undock button */}
        <button
          type="button"
          title="Detach to window"
          onClick={handleUndock}
          style={stripBtnStyle}
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
