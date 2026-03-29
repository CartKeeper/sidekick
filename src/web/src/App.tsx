import { useEffect, useState, useRef } from 'react';
import { useAppStore } from './stores/app';
import { SetupScreen } from './components/SetupScreen';
import { UnlockScreen } from './components/UnlockScreen';
import { MigrationScreen } from './components/MigrationScreen';
import { Layout } from './components/Layout';
import { api } from './api/client';

export function App() {
  const { needsSetup, isLocked, authLoading, checkAuth } = useAppStore();

  const [migrationChecked, setMigrationChecked] = useState(false);
  const [showMigration, setShowMigration] = useState(false);
  const [migrationPreview, setMigrationPreview] = useState<any>(null);

  // Track the previous locked state so we know when a fresh unlock occurred
  const wasLockedRef = useRef<boolean | null>(null);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // After the vault unlocks (isLocked transitions false→true after auth loads),
  // check for migration sources exactly once per session.
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
        <div className="text-text-muted text-[14px]">Loading…</div>
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

  return <Layout />;
}
