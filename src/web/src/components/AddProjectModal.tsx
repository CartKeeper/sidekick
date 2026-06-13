import { useState, useEffect, useRef } from 'react';
import { FolderOpen, Tag } from 'lucide-react';
import { api } from '../api/client';
import { useAppStore } from '../stores/app';
import { Modal, Button, Input } from './ui';

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

interface AddProjectModalProps {
  open: boolean;
  onClose: () => void;
}

export function AddProjectModal({ open, onClose }: AddProjectModalProps) {
  const { fetchProjects, selectProject } = useAppStore();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [path, setPath] = useState('');
  const [stackInput, setStackInput] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [icon, setIcon] = useState(PRESET_ICONS[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);

  // Focus name input when modal opens
  useEffect(() => {
    if (open) {
      setTimeout(() => nameRef.current?.focus(), 50);
    }
  }, [open]);

  // Reset form when closed
  useEffect(() => {
    if (!open) {
      setName('');
      setDescription('');
      setPath('');
      setStackInput('');
      setColor(PRESET_COLORS[0]);
      setIcon(PRESET_ICONS[0]);
      setError(null);
      setLoading(false);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Project name is required.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const stack = stackInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const project = await api.projects.create({
        name: name.trim(),
        description: description.trim(),
        path: path.trim(),
        stack,
        color,
        icon,
      });
      await fetchProjects();
      await selectProject(project.id);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="sm" labelledBy="add-project-title">
      <Modal.Header title="New Project" onClose={onClose} id="add-project-title" />

      <form onSubmit={handleSubmit}>
        <Modal.Body className="flex flex-col gap-4">

          {/* Icon + Name row */}
          <div className="flex gap-3 items-start">
            {/* Icon picker */}
            <div className="shrink-0">
              <label className="block text-[12px] font-semibold text-text-secondary mb-1.5 tracking-widest uppercase">
                Icon
              </label>
              <div className="flex flex-wrap gap-1" style={{ maxWidth: '120px' }}>
                {PRESET_ICONS.map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    onClick={() => setIcon(ic)}
                    className="w-8 h-8 text-base rounded-md cursor-pointer transition-colors duration-150"
                    style={{
                      border: icon === ic ? '2px solid #6366f1' : '2px solid transparent',
                      backgroundColor: icon === ic ? 'rgba(99,102,241,0.15)' : 'rgb(var(--color-border-default) / 1)',
                    }}
                  >
                    {ic}
                  </button>
                ))}
              </div>
            </div>

            {/* Name */}
            <div className="flex-1 min-w-0">
              <label
                htmlFor="proj-name"
                className="block text-[12px] font-semibold text-text-secondary mb-1.5 tracking-widest uppercase"
              >
                Name <span className="text-danger">*</span>
              </label>
              <Input
                ref={nameRef}
                id="proj-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Project"
                error={!!error && !name.trim()}
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="proj-desc"
              className="block text-[12px] font-semibold text-text-secondary mb-1.5 tracking-widest uppercase"
            >
              Description
            </label>
            <Input
              id="proj-desc"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
            />
          </div>

          {/* Path */}
          <div>
            <label
              htmlFor="proj-path"
              className="block text-[12px] font-semibold text-text-secondary mb-1.5 tracking-widest uppercase"
            >
              Project Path
            </label>
            <div className="relative">
              <FolderOpen
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
              />
              <Input
                id="proj-path"
                type="text"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/path/to/project"
                className="font-mono pl-8"
              />
            </div>
          </div>

          {/* Stack tags */}
          <div>
            <label
              htmlFor="proj-stack"
              className="block text-[12px] font-semibold text-text-secondary mb-1.5 tracking-widest uppercase"
            >
              Stack Tags
            </label>
            <div className="relative">
              <Tag
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
              />
              <Input
                id="proj-stack"
                type="text"
                value={stackInput}
                onChange={(e) => setStackInput(e.target.value)}
                placeholder="node, react, postgres"
                className="pl-8"
              />
            </div>
            <p className="text-[12px] text-text-muted mt-1">Comma-separated tags</p>
          </div>

          {/* Color picker */}
          <div>
            <label className="block text-[12px] font-semibold text-text-secondary mb-1.5 tracking-widest uppercase">
              Color
            </label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  title={c}
                  className="w-7 h-7 rounded-full cursor-pointer shrink-0 transition-[border-color] duration-150"
                  style={{
                    backgroundColor: c,
                    border: color === c ? '3px solid #e4e4ed' : '3px solid transparent',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="text-[12px] font-semibold text-danger m-0">{error}</p>
          )}
        </Modal.Body>

        <Modal.Footer>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={loading}>
            Create Project
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
