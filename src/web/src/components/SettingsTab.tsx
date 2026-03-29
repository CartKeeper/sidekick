import { useState, useEffect, useRef } from 'react';
import { FolderOpen, AlertTriangle, Loader2 } from 'lucide-react';
import { api, type Project, type Environment } from '../api/client';
import { useAppStore } from '../stores/app';

const PRESET_COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#ef4444',
  '#f59e0b',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
];

const PRESET_ICONS = ['📁', '🚀', '🔐', '⚙️', '🌐', '📦', '🗄️', '💻', '🔧', '⚡'];

interface SettingsTabProps {
  project: Project & { environments: Environment[] };
  onUpdate: () => void;
}

// Minimal saved indicator
function SavedIndicator({ show }: { show: boolean }) {
  return (
    <span
      style={{
        fontSize: '11px',
        fontWeight: 600,
        color: '#22c55e',
        opacity: show ? 1 : 0,
        transition: 'opacity 300ms ease',
        letterSpacing: '0.03em',
        marginLeft: '8px',
      }}
    >
      Saved
    </span>
  );
}

const sectionLabel: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  color: '#a1a1b5',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  marginBottom: '6px',
  display: 'block',
};

const inputStyle: React.CSSProperties = {
  height: '40px',
  padding: '0 12px',
  fontSize: '14px',
  color: '#e4e4ed',
  backgroundColor: '#12121a',
  border: '1px solid #2a2a3a',
  borderRadius: '8px',
  outline: 'none',
  boxSizing: 'border-box',
  width: '100%',
  transition: 'border-color 150ms ease',
};

export function SettingsTab({ project, onUpdate }: SettingsTabProps) {
  const { fetchProjects, selectProject } = useAppStore();

  const [name, setName] = useState(project.name ?? '');
  const [description, setDescription] = useState(project.description ?? '');
  const [path, setPath] = useState(project.path ?? '');
  const [icon, setIcon] = useState(project.icon ?? '📁');
  const [color, setColor] = useState(project.color ?? PRESET_COLORS[0]);
  const [stackInput, setStackInput] = useState((project.stack ?? []).join(', '));
  const [savedField, setSavedField] = useState<string | null>(null);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep local state synced if project changes (e.g., after re-fetch)
  useEffect(() => {
    setName(project.name ?? '');
    setDescription(project.description ?? '');
    setPath(project.path ?? '');
    setIcon(project.icon ?? '📁');
    setColor(project.color ?? PRESET_COLORS[0]);
    setStackInput((project.stack ?? []).join(', '));
  }, [project.id]);

  const showSaved = (field: string) => {
    setSavedField(field);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSavedField(null), 2000);
  };

  const saveField = async (fields: Partial<Project>, fieldKey: string) => {
    try {
      await api.projects.update(project.id, fields);
      showSaved(fieldKey);
      onUpdate();
    } catch {
      // Non-critical — field stays edited
    }
  };

  const handleArchive = async () => {
    if (!archiveConfirm) {
      setArchiveConfirm(true);
      return;
    }
    setArchiving(true);
    try {
      await api.projects.archive(project.id);
      await fetchProjects();
      selectProject(null);
    } finally {
      setArchiving(false);
      setArchiveConfirm(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Name */}
      <div>
        <label style={sectionLabel}>
          Name
          <SavedIndicator show={savedField === 'name'} />
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={async () => {
            if (name.trim() && name !== project.name) {
              await saveField({ name: name.trim() }, 'name');
            }
          }}
          placeholder="Project name"
          style={inputStyle}
        />
      </div>

      {/* Description */}
      <div>
        <label style={sectionLabel}>
          Description
          <SavedIndicator show={savedField === 'description'} />
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={async () => {
            if (description !== project.description) {
              await saveField({ description: description.trim() }, 'description');
            }
          }}
          placeholder="Optional description"
          rows={3}
          style={{
            ...inputStyle,
            height: 'auto',
            padding: '10px 12px',
            resize: 'vertical',
            lineHeight: '1.5',
            minHeight: '80px',
          }}
        />
      </div>

      {/* Path */}
      <div>
        <label style={sectionLabel}>
          Project Path
          <SavedIndicator show={savedField === 'path'} />
        </label>
        <div style={{ position: 'relative' }}>
          <FolderOpen
            size={14}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#6b6b80',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            onBlur={async () => {
              if (path !== project.path) {
                await saveField({ path: path.trim() }, 'path');
              }
            }}
            placeholder="/path/to/project"
            style={{
              ...inputStyle,
              fontFamily: 'var(--font-mono, monospace)',
              paddingLeft: '34px',
            }}
          />
        </div>
      </div>

      {/* Icon */}
      <div>
        <label style={sectionLabel}>
          Icon
          <SavedIndicator show={savedField === 'icon'} />
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {PRESET_ICONS.map((ic) => (
            <button
              key={ic}
              type="button"
              onClick={async () => {
                setIcon(ic);
                await saveField({ icon: ic }, 'icon');
              }}
              style={{
                width: '36px',
                height: '36px',
                fontSize: '18px',
                borderRadius: '8px',
                border: icon === ic ? '2px solid #6366f1' : '2px solid transparent',
                backgroundColor: icon === ic ? 'rgba(99,102,241,0.15)' : '#1a1a25',
                cursor: 'pointer',
                transition: 'all 150ms ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {ic}
            </button>
          ))}
        </div>
        <p style={{ fontSize: '12px', color: '#6b6b80', marginTop: '6px' }}>
          Or type a custom emoji:
        </p>
        <input
          type="text"
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          onBlur={async () => {
            if (icon !== project.icon) {
              await saveField({ icon: icon.trim() || '📁' }, 'icon');
            }
          }}
          placeholder="📁"
          style={{ ...inputStyle, width: '80px' }}
        />
      </div>

      {/* Color */}
      <div>
        <label style={sectionLabel}>
          Color
          <SavedIndicator show={savedField === 'color'} />
        </label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={async () => {
                setColor(c);
                await saveField({ color: c }, 'color');
              }}
              title={c}
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                backgroundColor: c,
                border: color === c ? '3px solid #e4e4ed' : '3px solid transparent',
                cursor: 'pointer',
                transition: 'border-color 150ms ease',
                flexShrink: 0,
              }}
            />
          ))}
        </div>
      </div>

      {/* Stack Tags */}
      <div>
        <label style={sectionLabel}>
          Stack Tags
          <SavedIndicator show={savedField === 'stack'} />
        </label>
        <input
          type="text"
          value={stackInput}
          onChange={(e) => setStackInput(e.target.value)}
          onBlur={async () => {
            const stack = stackInput
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
            const currentStack = project.stack ?? [];
            if (JSON.stringify(stack) !== JSON.stringify(currentStack)) {
              await saveField({ stack }, 'stack');
            }
          }}
          placeholder="node, react, postgres"
          style={inputStyle}
        />
        {/* Tag pills preview */}
        {stackInput.trim() && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
            {stackInput
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
              .map((tag, i) => (
                <span
                  key={i}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    height: '24px',
                    padding: '0 8px',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#a1a1b5',
                    backgroundColor: '#2a2a3a',
                    borderRadius: '6px',
                    letterSpacing: '0.03em',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tag}
                </span>
              ))}
          </div>
        )}
        <p style={{ fontSize: '12px', color: '#6b6b80', marginTop: '6px' }}>
          Comma-separated tags
        </p>
      </div>

      {/* Danger Zone */}
      <div
        style={{
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: '12px',
          padding: '16px',
          backgroundColor: 'rgba(239,68,68,0.03)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <AlertTriangle size={14} color="#ef4444" />
          <span
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: '#ef4444',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            Danger Zone
          </span>
        </div>

        <p style={{ fontSize: '14px', color: '#a1a1b5', margin: '0 0 12px' }}>
          This will hide the project from your list. You can unarchive it later.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            onClick={handleArchive}
            disabled={archiving}
            style={{
              height: '36px',
              padding: '0 16px',
              fontSize: '13px',
              fontWeight: 600,
              color: archiveConfirm ? '#ffffff' : '#ef4444',
              backgroundColor: archiveConfirm ? '#ef4444' : 'transparent',
              border: '1px solid rgba(239,68,68,0.5)',
              borderRadius: '8px',
              cursor: archiving ? 'not-allowed' : 'pointer',
              opacity: archiving ? 0.7 : 1,
              transition: 'background-color 150ms ease, color 150ms ease',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => {
              if (!archiving && !archiveConfirm) {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(239,68,68,0.1)';
              }
            }}
            onMouseLeave={(e) => {
              if (!archiving && !archiveConfirm) {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
              }
            }}
          >
            {archiving ? (
              <>
                <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                Archiving...
              </>
            ) : archiveConfirm ? (
              'Confirm Archive'
            ) : (
              'Archive Project'
            )}
          </button>
          {archiveConfirm && (
            <button
              type="button"
              onClick={() => setArchiveConfirm(false)}
              style={{
                height: '36px',
                padding: '0 12px',
                fontSize: '13px',
                color: '#6b6b80',
                backgroundColor: 'transparent',
                border: '1px solid #2a2a3a',
                borderRadius: '8px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
