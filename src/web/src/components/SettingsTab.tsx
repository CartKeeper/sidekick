import { useState, useEffect, useRef } from 'react';
import { FolderOpen, AlertTriangle, Upload, X as XIcon } from 'lucide-react';
import { api, type Project, type Environment } from '../api/client';
import { useAppStore } from '../stores/app';
import { Button, Input, Textarea, Spinner } from './ui';

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
      className="text-success font-semibold transition-opacity duration-300"
      style={{
        fontSize: '11px',
        letterSpacing: '0.03em',
        marginLeft: '8px',
        opacity: show ? 1 : 0,
      }}
    >
      Saved
    </span>
  );
}

export function SettingsTab({ project, onUpdate }: SettingsTabProps) {
  const { fetchProjects, selectProject } = useAppStore();

  const [name, setName] = useState(project.name ?? '');
  const [description, setDescription] = useState(project.description ?? '');
  const [path, setPath] = useState(project.path ?? '');
  const [icon, setIcon] = useState(project.icon ?? '📁');
  const [color, setColor] = useState(project.color ?? PRESET_COLORS[0]);
  const [stackInput, setStackInput] = useState((project.stack ?? []).join(', '));
  const [savedField, setSavedField] = useState<string | null>(null);
  const [iconPath, setIconPath] = useState(project.icon_path ?? '');
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);


  // Keep local state synced if project changes (e.g., after re-fetch)
  useEffect(() => {
    setName(project.name ?? '');
    setDescription(project.description ?? '');
    setPath(project.path ?? '');
    setIcon(project.icon ?? '📁');
    setIconPath(project.icon_path ?? '');
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
    } catch (err: unknown) {
      console.error('Archive failed:', err);
      setArchiveError(err instanceof Error ? err.message : 'Archive failed');
    } finally {
      setArchiving(false);
      setArchiveConfirm(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">

      {/* Name */}
      <div>
        <label className="block text-[12px] font-semibold text-text-secondary uppercase tracking-[0.05em] mb-1.5">
          Name
          <SavedIndicator show={savedField === 'name'} />
        </label>
        <Input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={async () => {
            if (name.trim() && name !== project.name) {
              await saveField({ name: name.trim() }, 'name');
            }
          }}
          placeholder="Project name"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-[12px] font-semibold text-text-secondary uppercase tracking-[0.05em] mb-1.5">
          Description
          <SavedIndicator show={savedField === 'description'} />
        </label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={async () => {
            if (description !== project.description) {
              await saveField({ description: description.trim() }, 'description');
            }
          }}
          placeholder="Optional description"
          rows={3}
        />
      </div>

      {/* Path */}
      <div>
        <label className="block text-[12px] font-semibold text-text-secondary uppercase tracking-[0.05em] mb-1.5">
          Project Path
          <SavedIndicator show={savedField === 'path'} />
        </label>
        <div className="relative">
          <FolderOpen
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
          />
          <Input
            type="text"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            onBlur={async () => {
              if (path !== project.path) {
                await saveField({ path: path.trim() }, 'path');
              }
            }}
            placeholder="/path/to/project"
            className="font-mono pl-8"
          />
        </div>
      </div>

      {/* Icon */}
      <div>
        <label className="block text-[12px] font-semibold text-text-secondary uppercase tracking-[0.05em] mb-1.5">
          Icon
          <SavedIndicator show={savedField === 'icon'} />
        </label>

        {/* Current icon preview */}
        {iconPath && (
          <div className="flex items-center gap-3 mb-3">
            <img
              src={`/api/projects/icon/${iconPath.split('/').pop()}`}
              alt="Project icon"
              className="w-12 h-12 rounded-xl object-cover border-2 border-accent bg-surface"
            />
            <button
              type="button"
              onClick={async () => {
                setIconPath('');
                await saveField({ icon_path: '' }, 'icon');
              }}
              className="h-7 px-2 text-[11px] font-semibold text-danger bg-transparent border border-danger/30
                         rounded-md cursor-pointer flex items-center gap-1
                         hover:bg-danger/10 transition-colors duration-150
                         focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
            >
              <XIcon size={10} />
              Remove
            </button>
          </div>
        )}

        {/* Upload button */}
        <div className="flex items-center gap-2 mb-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const result = await api.projects.uploadIcon(project.id, file);
                setIconPath(result.icon_path);
                showSaved('icon');
                onUpdate();
              } catch (err: unknown) {
                console.error('Icon upload failed:', err);
              }
              // Reset input so re-uploading the same file triggers onChange
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="h-8 px-3 text-[12px] font-semibold text-text-secondary bg-surface border border-border-default
                       rounded-md cursor-pointer flex items-center gap-1.5
                       hover:border-accent hover:text-text-primary transition-colors duration-150
                       focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          >
            <Upload size={13} />
            Upload Logo
          </button>
          <span className="text-[11px] text-text-muted">PNG, JPG, WebP, SVG</span>
        </div>

        {/* Emoji presets */}
        <p className="text-[12px] text-text-muted mb-1.5">
          Or choose an emoji:
        </p>
        <div className="flex flex-wrap gap-1.5">
          {PRESET_ICONS.map((ic) => (
            <button
              key={ic}
              type="button"
              onClick={async () => {
                setIcon(ic);
                await saveField({ icon: ic }, 'icon');
              }}
              aria-label={`Select icon ${ic}`}
              className={[
                'w-9 h-9 text-[18px] rounded-lg flex items-center justify-center cursor-pointer',
                'transition-colors duration-150',
                'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
                icon === ic && !iconPath
                  ? 'border-2 border-accent bg-accent/15'
                  : 'border-2 border-transparent bg-surface',
              ].join(' ')}
            >
              {ic}
            </button>
          ))}
        </div>
        <p className="text-[12px] text-text-muted mt-1.5">
          Custom emoji:
        </p>
        <Input
          type="text"
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          onBlur={async () => {
            if (icon !== project.icon) {
              await saveField({ icon: icon.trim() || '📁' }, 'icon');
            }
          }}
          placeholder="📁"
          className="w-20"
        />
      </div>

      {/* Color */}
      <div>
        <label className="block text-[12px] font-semibold text-text-secondary uppercase tracking-[0.05em] mb-1.5">
          Color
          <SavedIndicator show={savedField === 'color'} />
        </label>
        <div className="flex gap-2 flex-wrap">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={async () => {
                setColor(c);
                await saveField({ color: c }, 'color');
              }}
              title={c}
              aria-label={`Select color ${c}`}
              style={{ backgroundColor: c }}
              className={[
                'w-7 h-7 rounded-full cursor-pointer shrink-0 transition-[border-color] duration-150',
                'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
                color === c ? 'border-[3px] border-text-primary' : 'border-[3px] border-transparent',
              ].join(' ')}
            />
          ))}
        </div>
      </div>

      {/* Stack Tags */}
      <div>
        <label className="block text-[12px] font-semibold text-text-secondary uppercase tracking-[0.05em] mb-1.5">
          Stack Tags
          <SavedIndicator show={savedField === 'stack'} />
        </label>
        <Input
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
        />
        {/* Tag pills preview */}
        {stackInput.trim() && (
          <div className="flex gap-1.5 flex-wrap mt-2">
            {stackInput
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
              .map((tag, i) => (
                <span
                  key={i}
                  className="inline-flex items-center h-6 px-2 text-[11px] font-semibold
                             text-text-secondary bg-border-default rounded-md tracking-[0.03em] whitespace-nowrap"
                >
                  {tag}
                </span>
              ))}
          </div>
        )}
        <p className="text-[12px] text-text-muted mt-1.5">
          Comma-separated tags
        </p>
      </div>

      {/* Danger Zone */}
      <div className="border border-danger/30 rounded-xl p-4 bg-danger/3">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle size={14} className="text-danger" />
          <span className="text-[12px] font-semibold text-danger uppercase tracking-[0.05em]">
            Danger Zone
          </span>
        </div>

        <p className="text-[14px] text-text-secondary mb-3">
          This will hide the project from your list. You can unarchive it later.
        </p>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="danger"
            size="sm"
            loading={archiving}
            onClick={handleArchive}
            className={archiveConfirm ? '' : 'bg-transparent text-danger border border-danger/50 hover:bg-danger hover:text-white'}
          >
            {archiving ? (
              'Archiving…'
            ) : archiveConfirm ? (
              'Confirm Archive'
            ) : (
              'Archive Project'
            )}
          </Button>
          {archiveConfirm && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setArchiveConfirm(false)}
            >
              Cancel
            </Button>
          )}
        </div>
        {archiveError && (
          <p className="text-[13px] text-danger mt-2">
            {archiveError}
          </p>
        )}
      </div>
    </div>
  );
}
