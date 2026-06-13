import { useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FolderOpen, PanelRightClose } from 'lucide-react';
import { useAppStore } from '../stores/app';
import { connectProcessStream } from '../api/client';
import { Sidebar } from './Sidebar';
import { ProjectDetail } from './ProjectDetail';
import { PortsTab } from './PortsTab';
import { IconButton } from './ui';

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

  const handleDock = useCallback(() => {
    if (window.sidekick?.switchToDocked) {
      window.sidekick.switchToDocked();
    } else {
      // Browser fallback
      useAppStore.getState().setDockMode(true);
    }
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
                   flex items-center justify-end pr-3"
      >
        {/* Dock button — return to docked sidebar mode */}
        <IconButton
          aria-label="Dock to screen edge"
          className="no-drag"
          onClick={handleDock}
        >
          <PanelRightClose size={16} />
        </IconButton>
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
    </div>
  );
}
