import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAppStore } from '../stores/app';
import { Sidebar } from './Sidebar';
import { ProjectDetail } from './ProjectDetail';
import { TerminalPanel } from './TerminalPanel';
import { HelpButton } from './HelpButton';

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
    <div
      style={{
        display: 'flex',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Compact sidebar for dock panel — narrower */}
      <div
        style={{
          width: '200px',
          flexShrink: 0,
          overflow: 'hidden',
          height: '100%',
        }}
      >
        <Sidebar />
      </div>

      {/* Content area */}
      <main
        className="no-drag"
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '16px',
          minWidth: 0,
        }}
      >
        {currentProjectId ? <ProjectDetail /> : <DockWelcome />}
      </main>
    </div>
  );
}

function DockWelcome() {
  const { stats } = useAppStore();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: '16px',
        color: '#6b6b80',
        textAlign: 'center',
        padding: '16px',
      }}
    >
      <span
        style={{
          fontSize: '16px',
          fontWeight: 600,
          color: '#e4e4ed',
        }}
      >
        Select a project
      </span>
      <span style={{ fontSize: '14px', color: '#6b6b80', maxWidth: '220px' }}>
        Choose a project from the sidebar.
      </span>
      {stats && (
        <div
          style={{
            display: 'flex',
            gap: '16px',
            fontSize: '12px',
            fontWeight: 600,
            color: '#6b6b80',
            marginTop: '8px',
          }}
        >
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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: '#6b6b80',
          fontSize: '14px',
        }}
      >
        Process not found.
      </div>
    );
  }

  return (
    <div style={{ padding: '16px', height: '100%', display: 'flex', flexDirection: 'column' }}>
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
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      style={{
        width: '408px',
        flexShrink: 0,
        height: '100%',
        backgroundColor: '#0a0a0f',
        borderRight: '1px solid #2a2a3a',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      {activeTab === 'main' ? (
        <MainPanelContent />
      ) : (
        <ProcessPanelContent processId={activeTab} />
      )}

      <HelpButton />
    </motion.div>
  );
}
