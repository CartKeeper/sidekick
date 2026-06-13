import { useEffect, useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { FolderOpen, PanelRightClose, Settings } from 'lucide-react';
import { useAppStore } from '../stores/app';
import { connectProcessStream } from '../api/client';
import { Sidebar } from './Sidebar';
import { ProjectDetail } from './ProjectDetail';
import { PortsTab } from './PortsTab';
import { IconButton, Modal } from './ui';
import { PreferencesContent } from './PreferencesModal';

function WelcomeDashboard() {
  const { stats } = useAppStore();

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="flex flex-col items-center justify-center h-full gap-6 text-text-muted text-center"
    >
      <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center">
        <FolderOpen size={28} className="text-accent" />
      </div>

      <div>
        <h2 className="text-[20px] font-semibold text-text-primary mb-2">
          Select a project
        </h2>
        <p className="text-[14px] text-text-muted max-w-[320px]">
          Choose a project from the sidebar to view its secrets and environments.
        </p>
      </div>

      {stats && (
        <div className="flex gap-8 px-8 py-4 bg-surface border border-border-default rounded-xl">
          <div className="text-center">
            <div className="text-[28px] font-bold text-text-primary tabular-nums">
              {stats.projectCount}
            </div>
            <div className="text-[12px] font-semibold text-text-muted mt-0.5">
              Projects
            </div>
          </div>
          <div className="w-px bg-border-default self-stretch" />
          <div className="text-center">
            <div className="text-[28px] font-bold text-text-primary tabular-nums">
              {stats.secretCount}
            </div>
            <div className="text-[12px] font-semibold text-text-muted mt-0.5">
              Secrets
            </div>
          </div>
          <div className="w-px bg-border-default self-stretch" />
          <div className="text-center">
            <div className="text-[28px] font-bold text-text-primary tabular-nums">
              {stats.environmentCount}
            </div>
            <div className="text-[12px] font-semibold text-text-muted mt-0.5">
              Environments
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}


export function Layout() {
  const { currentProjectId, view, fetchProjects, fetchStats } = useAppStore();
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Docking needs the Electron OS-window bridge; it can't work in a plain browser.
  // Hide the control entirely outside Electron so it isn't a dead button.
  const canDock = typeof window !== 'undefined' && typeof window.sidekick?.switchToDocked === 'function';

  const handleDock = useCallback(() => {
    window.sidekick?.switchToDocked?.();
  }, []);

  // Load data when layout mounts (vault is unlocked)
  useEffect(() => {
    fetchProjects();
    fetchStats();
  }, [fetchProjects, fetchStats]);

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

  return (
    <div className="flex flex-col h-screen bg-void overflow-hidden">
      {/* Electron drag region at top */}
      <div
        className="drag-region h-10 shrink-0 bg-abyss border-b border-border-default
                   flex items-center justify-end gap-1 pr-3"
      >
        {/* Settings button */}
        <IconButton aria-label="Settings" className="no-drag" onClick={() => setSettingsOpen(true)}>
          <Settings size={16} />
        </IconButton>
        {/* Dock button — return to docked sidebar mode (Electron only) */}
        {canDock && (
          <IconButton
            aria-label="Dock to screen edge"
            className="no-drag"
            onClick={handleDock}
          >
            <PanelRightClose size={16} />
          </IconButton>
        )}
      </div>

      {/* App body: sidebar + content */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        {/* Main content area */}
        <main className="no-drag flex-1 overflow-auto overflow-x-hidden p-6 min-w-0">
          {view === 'ports' ? (
            <PortsTab />
          ) : currentProjectId ? (
            <ProjectDetail />
          ) : (
            <WelcomeDashboard />
          )}
        </main>
      </div>

      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} size="sm" labelledBy="settings-title">
        <Modal.Header title="Settings" onClose={() => setSettingsOpen(false)} id="settings-title" />
        <Modal.Body>
          <PreferencesContent />
        </Modal.Body>
      </Modal>
    </div>
  );
}
