import { useState, useRef, useEffect } from 'react';
import { MoreHorizontal, Pencil, Copy, Trash2 } from 'lucide-react';
import { useAppStore } from '../stores/app';
import { api, type Project } from '../api/client';
import { ProjectIcon } from './ProjectIcon';
import { cn } from './ui';

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const { currentProjectId, selectProject, fetchProjects, duplicateProject } = useAppStore();
  const isActive = currentProjectId === project.id;
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const visibleTags = project.stack?.slice(0, 2) ?? [];

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setConfirmDelete(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    selectProject(project.id);
  };

  const handleDuplicate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDuplicating(true);
    setMenuOpen(false);
    try {
      await duplicateProject(project.id);
    } finally {
      setDuplicating(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      await api.projects.archive(project.id);
      await fetchProjects();
      if (currentProjectId === project.id) {
        selectProject(null);
      }
    } finally {
      setDeleting(false);
      setMenuOpen(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        data-selectable="true"
        data-selected={isActive}
        data-item-id={project.id}
        onClick={() => selectProject(project.id)}
        className="no-drag w-full text-left group cursor-pointer border-none bg-transparent p-0 font-[inherit] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
      >
        <div
          className={cn(
            'relative flex items-center gap-2.5 py-2 pl-3 pr-8 rounded-lg',
            'border-l-[3px] transition-[background-color,border-color] duration-150',
            isActive
              ? 'border-l-accent bg-accent-muted'
              : 'border-l-transparent hover:bg-surface-hover',
          )}
        >
          {/* Icon */}
          <ProjectIcon
            icon={project.icon}
            iconPath={project.icon_path}
            color={project.color}
            name={project.name}
            size={24}
            borderRadius={6}
          />

          {/* Name + metadata */}
          <div className="flex-1 min-w-0">
            <div
              className={cn(
                'text-[14px] text-text-primary truncate',
                isActive ? 'font-semibold' : 'font-normal',
              )}
            >
              {project.name}
            </div>

            <div className="flex items-center gap-1.5 mt-0.5 flex-nowrap overflow-hidden">
              <span className="text-[11px] font-semibold text-text-muted shrink-0">
                {project.secretCount ?? 0} secrets
              </span>

              {visibleTags.map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] font-semibold text-text-secondary bg-border-default rounded-sm px-1.5 py-px shrink-0 truncate max-w-15"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* Menu trigger — shows on hover or when open.
              role=button (not <button>) to avoid invalid nesting inside the card <button>. */}
          <div
            data-menu-trigger
            role="button"
            tabIndex={0}
            aria-label="Project actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(!menuOpen);
              setConfirmDelete(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                setMenuOpen(!menuOpen);
                setConfirmDelete(false);
              }
            }}
            className={cn(
              'absolute right-2 top-1/2 -translate-y-1/2',
              'w-6 h-6 rounded-md flex items-center justify-center cursor-pointer',
              'text-text-secondary transition-[opacity,background-color] duration-150',
              'hover:bg-border-default',
              'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 focus-visible:opacity-100',
              menuOpen ? 'opacity-100 bg-border-default' : 'opacity-0 group-hover:opacity-100',
            )}
          >
            <MoreHorizontal size={14} />
          </div>
        </div>
      </button>

      {/* Dropdown menu */}
      {menuOpen && (
        <div
          ref={menuRef}
          className="absolute top-full right-2 z-50 min-w-35 bg-surface border border-border-default rounded-lg shadow-md p-1 mt-0.5"
        >
          <button
            type="button"
            onClick={handleEdit}
            className="w-full flex items-center gap-2 px-2.5 py-2 text-[13px] font-medium text-text-primary bg-transparent border-none rounded-md cursor-pointer text-left transition-colors duration-150 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          >
            <Pencil size={14} className="text-text-secondary" />
            Edit
          </button>

          <button
            type="button"
            onClick={handleDuplicate}
            disabled={duplicating}
            className="w-full flex items-center gap-2 px-2.5 py-2 text-[13px] font-medium text-text-primary bg-transparent border-none rounded-md cursor-pointer text-left transition-colors duration-150 hover:bg-surface-hover disabled:opacity-60 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          >
            <Copy size={14} className="text-text-secondary" />
            {duplicating ? 'Duplicating…' : 'Duplicate'}
          </button>

          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className={cn(
              'w-full flex items-center gap-2 px-2.5 py-2 text-[13px] font-medium border-none rounded-md cursor-pointer text-left transition-[background-color,color] duration-150 disabled:opacity-60 disabled:pointer-events-none',
              'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
              confirmDelete
                ? 'bg-danger text-white hover:bg-danger'
                : 'bg-transparent text-danger hover:bg-danger-muted',
            )}
          >
            <Trash2 size={14} className={confirmDelete ? 'text-white' : 'text-danger'} />
            {deleting ? 'Deleting…' : confirmDelete ? 'Confirm Delete' : 'Delete'}
          </button>
        </div>
      )}
    </div>
  );
}
