import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FolderOpen, Tag, Loader2 } from 'lucide-react';
import { api } from '../api/client';
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

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

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
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              zIndex: 50,
            }}
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 51,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px',
              pointerEvents: 'none',
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                pointerEvents: 'all',
                width: '100%',
                maxWidth: '512px',
                backgroundColor: '#1a1a25',
                border: '1px solid #2a2a3a',
                borderRadius: '16px',
                overflow: 'hidden',
                boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
              }}
            >
              {/* Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px 20px',
                  borderBottom: '1px solid #2a2a3a',
                }}
              >
                <h2
                  style={{
                    fontSize: '16px',
                    fontWeight: 600,
                    color: '#e4e4ed',
                    margin: 0,
                  }}
                >
                  New Project
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="no-drag focus-ring"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'transparent',
                    border: 'none',
                    color: '#6b6b80',
                    cursor: 'pointer',
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
                  <X size={16} />
                </button>
              </div>

              {/* Body */}
              <form onSubmit={handleSubmit}>
                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

                  {/* Icon + Name row */}
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    {/* Icon picker */}
                    <div style={{ flexShrink: 0 }}>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: '#a1a1b5',
                          marginBottom: '6px',
                          letterSpacing: '0.05em',
                          textTransform: 'uppercase',
                        }}
                      >
                        Icon
                      </label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxWidth: '120px' }}>
                        {PRESET_ICONS.map((ic) => (
                          <button
                            key={ic}
                            type="button"
                            onClick={() => setIcon(ic)}
                            style={{
                              width: '32px',
                              height: '32px',
                              fontSize: '16px',
                              borderRadius: '6px',
                              border: icon === ic ? '2px solid #6366f1' : '2px solid transparent',
                              backgroundColor: icon === ic ? 'rgba(99,102,241,0.15)' : '#2a2a3a',
                              cursor: 'pointer',
                              transition: 'all 150ms ease',
                            }}
                          >
                            {ic}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Name */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label
                        htmlFor="proj-name"
                        style={{
                          display: 'block',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: '#a1a1b5',
                          marginBottom: '6px',
                          letterSpacing: '0.05em',
                          textTransform: 'uppercase',
                        }}
                      >
                        Name <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <input
                        ref={nameRef}
                        id="proj-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="My Project"
                        className="focus-ring"
                        style={{
                          width: '100%',
                          height: '40px',
                          padding: '0 12px',
                          fontSize: '14px',
                          color: '#e4e4ed',
                          backgroundColor: '#12121a',
                          border: '1px solid #2a2a3a',
                          borderRadius: '8px',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label
                      htmlFor="proj-desc"
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#a1a1b5',
                        marginBottom: '6px',
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                      }}
                    >
                      Description
                    </label>
                    <input
                      id="proj-desc"
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Optional description"
                      className="focus-ring"
                      style={{
                        width: '100%',
                        height: '40px',
                        padding: '0 12px',
                        fontSize: '14px',
                        color: '#e4e4ed',
                        backgroundColor: '#12121a',
                        border: '1px solid #2a2a3a',
                        borderRadius: '8px',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  {/* Path */}
                  <div>
                    <label
                      htmlFor="proj-path"
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#a1a1b5',
                        marginBottom: '6px',
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                      }}
                    >
                      Project Path
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
                        id="proj-path"
                        type="text"
                        value={path}
                        onChange={(e) => setPath(e.target.value)}
                        placeholder="/path/to/project"
                        className="focus-ring"
                        style={{
                          width: '100%',
                          height: '40px',
                          paddingLeft: '34px',
                          paddingRight: '12px',
                          fontSize: '14px',
                          fontFamily: 'var(--font-mono)',
                          color: '#e4e4ed',
                          backgroundColor: '#12121a',
                          border: '1px solid #2a2a3a',
                          borderRadius: '8px',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </div>

                  {/* Stack tags */}
                  <div>
                    <label
                      htmlFor="proj-stack"
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#a1a1b5',
                        marginBottom: '6px',
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                      }}
                    >
                      Stack Tags
                    </label>
                    <div style={{ position: 'relative' }}>
                      <Tag
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
                        id="proj-stack"
                        type="text"
                        value={stackInput}
                        onChange={(e) => setStackInput(e.target.value)}
                        placeholder="node, react, postgres"
                        className="focus-ring"
                        style={{
                          width: '100%',
                          height: '40px',
                          paddingLeft: '34px',
                          paddingRight: '12px',
                          fontSize: '14px',
                          color: '#e4e4ed',
                          backgroundColor: '#12121a',
                          border: '1px solid #2a2a3a',
                          borderRadius: '8px',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                    <p style={{ fontSize: '12px', color: '#6b6b80', marginTop: '4px' }}>
                      Comma-separated tags
                    </p>
                  </div>

                  {/* Color picker */}
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#a1a1b5',
                        marginBottom: '6px',
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                      }}
                    >
                      Color
                    </label>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {PRESET_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setColor(c)}
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

                  {/* Error */}
                  {error && (
                    <p
                      style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#ef4444',
                        margin: 0,
                      }}
                    >
                      {error}
                    </p>
                  )}
                </div>

                {/* Footer */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: '8px',
                    padding: '16px 20px',
                    borderTop: '1px solid #2a2a3a',
                  }}
                >
                  <button
                    type="button"
                    onClick={onClose}
                    className="no-drag focus-ring"
                    style={{
                      height: '40px',
                      padding: '0 16px',
                      fontSize: '14px',
                      fontWeight: 500,
                      color: '#a1a1b5',
                      backgroundColor: 'transparent',
                      border: '1px solid #2a2a3a',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      minWidth: '80px',
                      transition: 'background-color 150ms ease, color 150ms ease',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#222230';
                      (e.currentTarget as HTMLButtonElement).style.color = '#e4e4ed';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                      (e.currentTarget as HTMLButtonElement).style.color = '#a1a1b5';
                    }}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={loading}
                    className="no-drag focus-ring"
                    style={{
                      height: '40px',
                      padding: '0 16px',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#ffffff',
                      backgroundColor: loading ? '#5558e6' : '#6366f1',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      minWidth: '120px',
                      opacity: loading ? 0.7 : 1,
                      transition: 'background-color 150ms ease, opacity 150ms ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    onMouseEnter={(e) => {
                      if (!loading) {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#5558e6';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!loading) {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#6366f1';
                      }
                    }}
                  >
                    {loading ? (
                      <>
                        <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                        Creating...
                      </>
                    ) : (
                      'Create Project'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
