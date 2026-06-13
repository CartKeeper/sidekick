import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAppStore } from '../stores/app';
import { Sidebar } from './Sidebar';
import { ProjectDetail } from './ProjectDetail';
import { TerminalPanel } from './TerminalPanel';
import { ProjectTerminal } from './ProjectTerminal';
import { PreferencesPanel } from './PreferencesModal';

interface DockPanelProps {
  activeTab: string;
}

function MainPanelContent() {
  const { currentProjectId, fetchProjects, fetchStats } = useAppStore();

  useEffect(() => {
    fetchProjects();
    fetchStats();
  }, [fetchProjects, fetchStats]);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Compact sidebar for dock panel — narrower */}
      <div className="shrink-0 overflow-hidden h-full" style={{ width: '200px' }}>
        <Sidebar />
      </div>

      {/* Content area — min-w-0 prevents flex child from overflowing */}
      <main className="no-drag flex-1 overflow-auto p-4 min-w-0">
        {currentProjectId ? <ProjectDetail /> : <DockWelcome />}
      </main>
    </div>
  );
}

function DockWelcome() {
  const { stats } = useAppStore();

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-text-muted text-center p-4">
      <span className="text-base font-semibold text-text-primary">
        Select a project
      </span>
      <span className="text-sm text-text-muted max-w-55">
        Choose a project from the sidebar.
      </span>
      {stats && (
        <div className="flex gap-4 text-xs font-semibold text-text-muted mt-2">
          <span>{stats.projectCount} projects</span>
          <span>{stats.secretCount} secrets</span>
        </div>
      )}
    </div>
  );
}

function ProcessPanelContent({ processId }: { processId: string }) {
  const { runningProcesses, stopProject, restartProject } = useAppStore();
  const proc = runningProcesses.find((p) => p.id === processId);

  if (!proc) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-sm">
        Process not found.
      </div>
    );
  }

  return (
    <div className="p-4 h-full flex flex-col">
      <TerminalPanel
        processId={proc.id}
        processName={proc.name}
        projectId={proc.projectId}
        onStop={() => stopProject(proc.projectId)}
        onRestart={() => restartProject(proc.projectId)}
      />
    </div>
  );
}

export function DockPanel({ activeTab }: DockPanelProps) {
  const isProjectTab = activeTab.startsWith('project:');
  const projectId = isProjectTab ? activeTab.slice('project:'.length) : null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="shrink-0 h-full bg-void border-r border-border-default overflow-hidden flex flex-col relative"
      // COMPUTED: fixed 600px panel width stays inline — pixel value, not a token
      style={{ width: '600px' }}
    >
      {activeTab === 'main' ? (
        <MainPanelContent />
      ) : activeTab === 'preferences' ? (
        <PreferencesPanel />
      ) : isProjectTab && projectId ? (
        <ProjectTerminal projectId={projectId} />
      ) : (
        <ProcessPanelContent processId={activeTab} />
      )}
    </motion.div>
  );
}
