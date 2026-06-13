import { useEffect, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useAppStore } from '../stores/app';
import { connectProcessStream } from '../api/client';
import { DockStrip } from './DockStrip';
import { DockPanel } from './DockPanel';

export function DockLayout() {
  const {
    panelOpen,
    activeTab,
    dockEdge,
    setActiveTab,
    setPanelOpen,
  } = useAppStore();

  // Fetch projects on mount so dock strip icons appear immediately
  useEffect(() => {
    useAppStore.getState().fetchProjects();
    useAppStore.getState().fetchStats();
  }, []);

  // Connect to SSE process output stream
  useEffect(() => {
    const cleanup = connectProcessStream(
      (event) => {
        useAppStore.getState().appendOutput(event.processId, event.data);
      },
      (event) => {
        useAppStore.getState().handleProcessExit(event.processId);
      },
      (processes) => {
        useAppStore.setState({ runningProcesses: processes });
      }
    );

    return cleanup;
  }, []);

  const handleTabClick = useCallback(
    (tabId: string) => {
      if (panelOpen && activeTab === tabId) {
        // Clicking the same active tab closes the panel
        setPanelOpen(false);
        // Also tell Electron to collapse
        if (window.sidekick?.togglePanel) {
          window.sidekick.togglePanel();
        }
      } else {
        setActiveTab(tabId);
        if (!panelOpen) {
          setPanelOpen(true);
          // Tell Electron to expand
          if (window.sidekick?.togglePanel) {
            window.sidekick.togglePanel();
          }
        }
      }
    },
    [panelOpen, activeTab, setActiveTab, setPanelOpen]
  );

  const handleUndock = useCallback(() => {
    if (window.sidekick?.switchToDetached) {
      window.sidekick.switchToDetached();
    } else {
      // Browser fallback: toggle dock mode in store
      useAppStore.getState().setDockMode(false);
    }
  }, []);

  // Escape key closes the panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && panelOpen) {
        setPanelOpen(false);
        if (window.sidekick?.togglePanel) {
          window.sidekick.togglePanel();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [panelOpen, setPanelOpen]);

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
      {/* Panel slides in next to the strip when open */}
      <AnimatePresence>
        {panelOpen && <DockPanel activeTab={activeTab} />}
      </AnimatePresence>

      {/* Strip sits on the screen edge (right by default, left if configured) */}
      <DockStrip
        activeTab={activeTab}
        onTabClick={handleTabClick}
        onUndock={handleUndock}
      />
    </div>
  );
}
