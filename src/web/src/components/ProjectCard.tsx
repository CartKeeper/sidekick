import { useAppStore } from '../stores/app';
import type { Project } from '../api/client';

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const { currentProjectId, selectProject } = useAppStore();
  const isActive = currentProjectId === project.id;

  const visibleTags = project.stack?.slice(0, 2) ?? [];

  return (
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
          borderRadius: '8px',
          borderLeft: isActive ? '3px solid #6366f1' : '3px solid transparent',
          backgroundColor: isActive
            ? 'rgba(99, 102, 241, 0.15)'
            : 'transparent',
          transition: 'background-color 150ms ease, border-color 150ms ease',
        }}
        onMouseEnter={(e) => {
          if (!isActive) {
            (e.currentTarget as HTMLDivElement).style.backgroundColor =
              '#222230';
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive) {
            (e.currentTarget as HTMLDivElement).style.backgroundColor =
              'transparent';
          }
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
              color: isActive ? '#e4e4ed' : '#e4e4ed',
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
            {/* Secret count badge */}
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

            {/* Stack tags */}
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
      </div>
    </button>
  );
}
