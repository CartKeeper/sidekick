import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { FolderOpen } from 'lucide-react';
import { useAppStore } from '../stores/app';
import { Sidebar } from './Sidebar';

// Placeholder until ProjectDetail is implemented in the next task
function WelcomeDashboard() {
  const { stats } = useAppStore();

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: '24px',
        color: '#6b6b80',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: '64px',
          height: '64px',
          borderRadius: '16px',
          backgroundColor: 'rgba(99,102,241,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <FolderOpen size={28} color="#6366f1" />
      </div>

      <div>
        <h2
          style={{
            fontSize: '20px',
            fontWeight: 600,
            color: '#e4e4ed',
            margin: '0 0 8px',
          }}
        >
          Select a project
        </h2>
        <p
          style={{
            fontSize: '14px',
            color: '#6b6b80',
            margin: 0,
            maxWidth: '320px',
          }}
        >
          Choose a project from the sidebar to view its secrets and environments.
        </p>
      </div>

      {stats && (
        <div
          style={{
            display: 'flex',
            gap: '32px',
            padding: '16px 32px',
            backgroundColor: '#1a1a25',
            border: '1px solid #2a2a3a',
            borderRadius: '12px',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                fontSize: '28px',
                fontWeight: 700,
                color: '#e4e4ed',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {stats.projectCount}
            </div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#6b6b80', marginTop: '2px' }}>
              Projects
            </div>
          </div>
          <div
            style={{
              width: '1px',
              backgroundColor: '#2a2a3a',
              alignSelf: 'stretch',
            }}
          />
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                fontSize: '28px',
                fontWeight: 700,
                color: '#e4e4ed',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {stats.secretCount}
            </div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#6b6b80', marginTop: '2px' }}>
              Secrets
            </div>
          </div>
          <div
            style={{
              width: '1px',
              backgroundColor: '#2a2a3a',
              alignSelf: 'stretch',
            }}
          />
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                fontSize: '28px',
                fontWeight: 700,
                color: '#e4e4ed',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {stats.environmentCount}
            </div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#6b6b80', marginTop: '2px' }}>
              Environments
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

function ProjectDetailPlaceholder() {
  const { currentProject } = useAppStore();

  return (
    <motion.div
      key={currentProject?.id}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '0 0 16px',
          borderBottom: '1px solid #2a2a3a',
        }}
      >
        <span style={{ fontSize: '28px' }}>{currentProject?.icon || '📁'}</span>
        <div>
          <h1
            style={{
              fontSize: '20px',
              fontWeight: 600,
              color: '#e4e4ed',
              margin: '0 0 2px',
            }}
          >
            {currentProject?.name}
          </h1>
          {currentProject?.description && (
            <p style={{ fontSize: '14px', color: '#a1a1b5', margin: 0 }}>
              {currentProject.description}
            </p>
          )}
        </div>
      </div>

      <div
        style={{
          padding: '16px',
          backgroundColor: '#1a1a25',
          border: '1px solid #2a2a3a',
          borderRadius: '12px',
          color: '#a1a1b5',
          fontSize: '14px',
        }}
      >
        Project detail coming in the next task. Secrets, environments, and tooling will appear here.
      </div>
    </motion.div>
  );
}

export function Layout() {
  const { currentProjectId, fetchProjects, fetchStats } = useAppStore();

  // Load data when layout mounts (vault is unlocked)
  useEffect(() => {
    fetchProjects();
    fetchStats();
  }, [fetchProjects, fetchStats]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        backgroundColor: '#0a0a0f',
        overflow: 'hidden',
      }}
    >
      {/* Electron drag region at top */}
      <div
        className="drag-region"
        style={{
          height: '40px',
          flexShrink: 0,
          backgroundColor: '#12121a',
          borderBottom: '1px solid #2a2a3a',
        }}
      />

      {/* App body: sidebar + content */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          overflow: 'hidden',
        }}
      >
        <Sidebar />

        {/* Main content area */}
        <main
          className="no-drag"
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '24px',
          }}
        >
          {currentProjectId ? <ProjectDetailPlaceholder /> : <WelcomeDashboard />}
        </main>
      </div>
    </div>
  );
}
