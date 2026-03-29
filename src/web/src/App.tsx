import { useEffect, useState, useRef, useCallback } from 'react';
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
      getDockState: () => { dockMode: boolean; panelOpen: boolean };
      reportActivity: () => void;
      onDockState: (callback: (state: { dockMode: boolean; panelOpen: boolean }) => void) => () => void;
      onLockVault: (callback: () => void) => () => void;
    };
  }
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
    }

    const unsubscribe = window.sidekick.onDockState((state) => {
      setDockMode(state.dockMode);
      setPanelOpen(state.panelOpen);
    });

    return unsubscribe;
  }, [setDockMode, setPanelOpen]);

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
  if (isLocked) return <UnlockScreen />;

  if (showMigration && migrationPreview) {
    return (
      <MigrationScreen
        preview={migrationPreview}
        onComplete={() => setShowMigration(false)}
        onSkip={() => setShowMigration(false)}
      />
    );
  }

  // Render based on dock mode
  if (dockMode) {
    return <DockLayout />;
  }

  return <Layout />;
}
