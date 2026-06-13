import { Plus, Lock, RefreshCw, Network } from 'lucide-react';
import { useAppStore } from '../stores/app';
import { ProjectCard } from './ProjectCard';
import { AddProjectModal } from './AddProjectModal';

export function Sidebar() {
  const { projects, stats, lock, addProjectOpen, setAddProjectOpen, fetchProjects, fetchStats, currentProjectId, selectProject, view, setView } = useAppStore();

  const activeProjects = projects.filter((p) => !p.archived);

  return (
    <>
      <aside
        style={{
          width: '260px',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#12121a',
          borderRight: '1px solid #2a2a3a',
          height: '100%',
          overflow: 'hidden',
        }}
      >
        {/* App title — sits below drag region, clear of traffic lights */}
        <div
          className="no-drag"
          style={{
            padding: '10px 16px',
            borderBottom: '1px solid #2a2a3a',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: '16px',
              fontWeight: 700,
              color: '#e4e4ed',
              letterSpacing: '-0.01em',
            }}
          >
            Sidekick
          </span>
        </div>

        {/* Projects section */}
        <div
          className="no-drag"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px 6px',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: '#6b6b80',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Projects
          </span>
          <div style={{ display: 'flex', gap: '2px' }}>
          <button
            type="button"
            onClick={async () => {
              await fetchProjects();
              await fetchStats();
              if (currentProjectId) selectProject(currentProjectId);
            }}
            title="Refresh projects"
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: 'transparent',
              color: '#6b6b80',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 150ms ease, color 150ms ease',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#222230';
              (e.currentTarget as HTMLButtonElement).style.color = '#e4e4ed';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
              (e.currentTarget as HTMLButtonElement).style.color = '#6b6b80';
            }}
          >
            <RefreshCw size={12} />
          </button>
          <button
            type="button"
            onClick={() => setAddProjectOpen(true)}
            title="Add project"
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: 'transparent',
              color: '#6b6b80',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 150ms ease, color 150ms ease',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#222230';
              (e.currentTarget as HTMLButtonElement).style.color = '#e4e4ed';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
              (e.currentTarget as HTMLButtonElement).style.color = '#6b6b80';
            }}
          >
            <Plus size={14} />
          </button>
          </div>
        </div>

        {/* Scrollable project list */}
        <div
          className="no-drag"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '4px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          }}
        >
          {activeProjects.length === 0 ? (
            <div
              style={{
                padding: '24px 16px',
                textAlign: 'center',
                color: '#6b6b80',
                fontSize: '13px',
              }}
            >
              <p style={{ margin: '0 0 8px' }}>No projects yet.</p>
              <button
                type="button"
                onClick={() => setAddProjectOpen(true)}
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#6366f1',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Create your first project →
              </button>
            </div>
          ) : (
            activeProjects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))
          )}
        </div>

        {/* Bottom area: stats + actions */}
        <div
          className="no-drag"
          style={{
            borderTop: '1px solid #2a2a3a',
            flexShrink: 0,
          }}
        >
          {/* Stats */}
          {stats && (
            <div
              style={{
                padding: '10px 16px 8px',
                display: 'flex',
                gap: '16px',
              }}
            >
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#6b6b80' }}>
                {stats.projectCount} projects
              </span>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#6b6b80' }}>
                {stats.secretCount} secrets
              </span>
            </div>
          )}

          {/* Actions row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px 12px',
              gap: '8px',
            }}
          >
            {/* Ports button */}
            <button
              type="button"
              onClick={() => setView(view === 'ports' ? 'projects' : 'ports')}
              title="View port listeners"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                height: '32px',
                padding: '0 12px',
                fontSize: '12px',
                fontWeight: 600,
                color: view === 'ports' ? '#a5b4fc' : '#6b6b80',
                backgroundColor: view === 'ports' ? 'rgba(99,102,241,0.12)' : 'transparent',
                border: `1px solid ${view === 'ports' ? 'rgba(99,102,241,0.4)' : '#2a2a3a'}`,
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'background-color 150ms ease, color 150ms ease, border-color 150ms ease',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => {
                if (view === 'ports') return;
                const btn = e.currentTarget as HTMLButtonElement;
                btn.style.backgroundColor = '#222230';
                btn.style.color = '#e4e4ed';
              }}
              onMouseLeave={(e) => {
                if (view === 'ports') return;
                const btn = e.currentTarget as HTMLButtonElement;
                btn.style.backgroundColor = 'transparent';
                btn.style.color = '#6b6b80';
              }}
            >
              <Network size={12} />
              Ports
            </button>

            {/* Lock button */}
            <button
              type="button"
              onClick={lock}
              title="Lock vault"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                height: '32px',
                padding: '0 12px',
                fontSize: '12px',
                fontWeight: 600,
                color: '#6b6b80',
                backgroundColor: 'transparent',
                border: '1px solid #2a2a3a',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'background-color 150ms ease, color 150ms ease, border-color 150ms ease',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              onMouseEnter={(e) => {
                const btn = e.currentTarget as HTMLButtonElement;
                btn.style.backgroundColor = 'rgba(239,68,68,0.1)';
                btn.style.color = '#ef4444';
                btn.style.borderColor = 'rgba(239,68,68,0.3)';
              }}
              onMouseLeave={(e) => {
                const btn = e.currentTarget as HTMLButtonElement;
                btn.style.backgroundColor = 'transparent';
                btn.style.color = '#6b6b80';
                btn.style.borderColor = '#2a2a3a';
              }}
            >
              <Lock size={12} />
              Lock Vault
            </button>
          </div>
        </div>
      </aside>

      <AddProjectModal
        open={addProjectOpen}
        onClose={() => setAddProjectOpen(false)}
      />
    </>
  );
}
