import { useEffect } from 'react';
import { useAppStore } from './stores/app';
import { SetupScreen } from './components/SetupScreen';
import { UnlockScreen } from './components/UnlockScreen';

export function App() {
  const { needsSetup, isLocked, authLoading, checkAuth } = useAppStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <div className="text-text-muted text-[14px]">Loading…</div>
      </div>
    );
  }

  if (needsSetup) return <SetupScreen />;
  if (isLocked) return <UnlockScreen />;

  // Placeholder until Layout is built
  return (
    <div className="min-h-screen bg-void text-text-primary flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-[28px] font-bold">Sidekick</h1>
        <p className="text-text-muted mt-2 text-[14px]">Vault unlocked. UI coming soon.</p>
      </div>
    </div>
  );
}
