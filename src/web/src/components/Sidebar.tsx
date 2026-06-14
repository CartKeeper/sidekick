import { Plus, Lock, RefreshCw, Network } from 'lucide-react';
import { useAppStore } from '../stores/app';
import { ProjectCard } from './ProjectCard';
import { AddProjectModal } from './AddProjectModal';
import { IconButton, cn } from './ui';

export function Sidebar() {
  const { projects, stats, lock, addProjectOpen, setAddProjectOpen, fetchProjects, fetchStats, currentProjectId, selectProject, view, setView } = useAppStore();

  const activeProjects = projects.filter((p) => !p.archived);

  return (
    <>
      <aside className="w-82 shrink-0 flex flex-col bg-abyss border-r border-border-default h-full overflow-hidden">
        {/* App title — sits below drag region, clear of traffic lights */}
        <div className="no-drag flex items-center gap-2 px-4 py-2.5 border-b border-border-default shrink-0">
          <img src="/logo.png" alt="" className="w-7 h-7 rounded-md object-contain shrink-0" />
          <span className="text-[16px] font-bold text-text-primary tracking-[-0.01em]">
            Sidekick
          </span>
        </div>

        {/* Projects section */}
        <div className="no-drag flex items-center justify-between px-4 pt-2.5 pb-1.5 shrink-0">
          <span className="text-[11px] font-semibold text-text-muted uppercase tracking-[0.08em]">
            Projects
          </span>
          <div className="flex gap-0.5">
            <IconButton
              aria-label="Refresh projects"
              size="sm"
              onClick={async () => {
                await fetchProjects();
                await fetchStats();
                if (currentProjectId) selectProject(currentProjectId);
              }}
            >
              <RefreshCw size={12} />
            </IconButton>
            <IconButton
              aria-label="Add project"
              size="sm"
              onClick={() => setAddProjectOpen(true)}
            >
              <Plus size={14} />
            </IconButton>
          </div>
        </div>

        {/* Scrollable project list */}
        <div className="no-drag flex-1 overflow-y-auto px-2 py-1 flex flex-col gap-0.5">
          {activeProjects.length === 0 ? (
            <div className="px-4 py-6 text-center text-text-muted text-[13px]">
              <p className="mb-2">No projects yet.</p>
              <button
                type="button"
                onClick={() => setAddProjectOpen(true)}
                className="text-[13px] font-semibold text-accent bg-transparent border-none cursor-pointer p-0
                           hover:text-accent/80 transition-colors duration-150
                           focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1 rounded"
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
        <div className="no-drag border-t border-border-default shrink-0">
          {/* Stats */}
          {stats && (
            <div className="flex gap-4 px-4 pt-2.5 pb-2">
              <span className="text-[11px] font-semibold text-text-muted">
                {stats.projectCount} projects
              </span>
              <span className="text-[11px] font-semibold text-text-muted">
                {stats.secretCount} secrets
              </span>
            </div>
          )}

          {/* Actions row — card-style buttons */}
          <div className="flex items-stretch gap-2 px-3 pb-3 pt-1">
            {/* Ports (toggle) */}
            <button
              type="button"
              onClick={() => setView(view === 'ports' ? 'projects' : 'ports')}
              aria-label="Toggle ports view"
              aria-pressed={view === 'ports'}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 h-11 rounded-lg border text-[12px] font-semibold cursor-pointer',
                'transition-colors duration-150',
                'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
                view === 'ports'
                  ? 'text-accent border-accent/40 bg-accent-muted'
                  : 'text-text-secondary border-border-default bg-surface hover:bg-surface-hover hover:text-text-primary hover:border-border-strong',
              )}
            >
              <Network size={14} />
              Ports
            </button>

            {/* Lock Vault */}
            <button
              type="button"
              onClick={lock}
              aria-label="Lock vault"
              className={cn(
                'flex-1 flex items-center justify-center gap-2 h-11 rounded-lg border text-[12px] font-semibold cursor-pointer',
                'transition-colors duration-150 text-text-secondary border-border-default bg-surface',
                'hover:text-danger hover:border-danger/40 hover:bg-danger/10',
                'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
              )}
            >
              <Lock size={14} />
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
