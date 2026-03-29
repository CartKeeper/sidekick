import { useState, useRef, useEffect } from 'react';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useAppStore } from '../stores/app';
import { api, type Project } from '../api/client';

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const { currentProjectId, selectProject, fetchProjects } = useAppStore();
  const isActive = currentProjectId === project.id;
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
    // Select project and the App will show ProjectDetail — user can use Settings tab
    selectProject(project.id);
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
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        data-selectable="true"
        data-selected={isActive}
        data-item-id={project.id}
        onClick={() => selectProject(project.id)}
        className="no-drag w-full text-left group"
        style={{ cursor: 'pointer', border: 'none', background: 'none', padding: 0, font: 'inherit' }}
      >
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '8px 12px',
            paddingRight: '32px',
            borderRadius: '8px',
            borderLeft: isActive ? '3px solid #6366f1' : '3px solid transparent',
            backgroundColor: isActive
              ? 'rgba(99, 102, 241, 0.15)'
              : 'transparent',
            transition: 'background-color 150ms ease, border-color 150ms ease',
          }}
          onMouseEnter={(e) => {
            if (!isActive) {
              (e.currentTarget as HTMLDivElement).style.backgroundColor = '#222230';
            }
            // Show the menu trigger on hover
            const btn = e.currentTarget.querySelector('[data-menu-trigger]') as HTMLElement;
            if (btn) btn.style.opacity = '1';
          }}
          onMouseLeave={(e) => {
            if (!isActive) {
              (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent';
            }
            const btn = e.currentTarget.querySelector('[data-menu-trigger]') as HTMLElement;
            if (btn && !menuOpen) btn.style.opacity = '0';
          }}
        >
          {/* Icon — colored dot if no emoji set */}
          {project.icon && /\p{Emoji}/u.test(project.icon) ? (
            <span
              style={{
                fontSize: '16px',
                lineHeight: 1,
                flexShrink: 0,
                width: '24px',
                textAlign: 'center',
              }}
            >
              {project.icon}
            </span>
          ) : (
            <div
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: project.color || '#6366f1',
                flexShrink: 0,
                marginLeft: '7px',
              }}
            />
          )}

          {/* Name + metadata */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: '14px',
                fontWeight: isActive ? 600 : 400,
                color: '#e4e4ed',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {project.name}
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginTop: '2px',
                flexWrap: 'nowrap',
                overflow: 'hidden',
              }}
            >
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#6b6b80',
                  flexShrink: 0,
                }}
              >
                {project.secretCount ?? 0} secrets
              </span>

              {visibleTags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    color: '#a1a1b5',
                    backgroundColor: '#2a2a3a',
                    borderRadius: '4px',
                    padding: '1px 6px',
                    flexShrink: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: '60px',
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* Menu trigger — shows on hover */}
          <div
            data-menu-trigger
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(!menuOpen);
              setConfirmDelete(false);
            }}
            style={{
              position: 'absolute',
              right: '8px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '24px',
              height: '24px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: menuOpen ? '1' : '0',
              cursor: 'pointer',
              transition: 'opacity 150ms ease, background-color 150ms ease',
              backgroundColor: menuOpen ? '#2a2a3a' : 'transparent',
              color: '#a1a1b5',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.backgroundColor = '#2a2a3a';
            }}
            onMouseLeave={(e) => {
              if (!menuOpen) {
                (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent';
              }
            }}
          >
            <MoreHorizontal size={14} />
          </div>
        </div>
      </button>

      {/* Dropdown menu */}
      {menuOpen && (
        <div
          ref={menuRef}
          style={{
            position: 'absolute',
            top: '100%',
            right: '8px',
            zIndex: 50,
            minWidth: '140px',
            backgroundColor: '#1a1a25',
            border: '1px solid #2a2a3a',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            padding: '4px',
            marginTop: '2px',
          }}
        >
          <button
            type="button"
            onClick={handleEdit}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 10px',
              fontSize: '13px',
              fontWeight: 500,
              color: '#e4e4ed',
              backgroundColor: 'transparent',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'background-color 150ms ease',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#222230';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
            }}
          >
            <Pencil size={14} color="#a1a1b5" />
            Edit
          </button>

          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 10px',
              fontSize: '13px',
              fontWeight: 500,
              color: confirmDelete ? '#ffffff' : '#ef4444',
              backgroundColor: confirmDelete ? '#ef4444' : 'transparent',
              border: 'none',
              borderRadius: '6px',
              cursor: deleting ? 'not-allowed' : 'pointer',
              opacity: deleting ? 0.6 : 1,
              transition: 'background-color 150ms ease, color 150ms ease',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => {
              if (!confirmDelete) {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(239,68,68,0.1)';
              }
            }}
            onMouseLeave={(e) => {
              if (!confirmDelete) {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
              }
            }}
          >
            <Trash2 size={14} color={confirmDelete ? '#ffffff' : '#ef4444'} />
            {deleting ? 'Deleting...' : confirmDelete ? 'Confirm Delete' : 'Delete'}
          </button>
        </div>
      )}
    </div>
  );
}
