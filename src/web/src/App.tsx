import { useEffect } from 'react';
import { useAppStore } from './stores/app';
import { SetupScreen } from './components/SetupScreen';
import { UnlockScreen } from './components/UnlockScreen';
import { Layout } from './components/Layout';

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

  return <Layout />;
}
