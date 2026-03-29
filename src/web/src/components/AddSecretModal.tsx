import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2 } from 'lucide-react';
import { api } from '../api/client';
import { useAppStore } from '../stores/app';

const SECRET_TYPES = [
  { value: 'api_key', label: 'API Key' },
  { value: 'secret', label: 'Secret' },
  { value: 'token', label: 'Token' },
  { value: 'password', label: 'Password' },
  { value: 'connection', label: 'Connection' },
  { value: 'url', label: 'URL' },
  { value: 'certificate', label: 'Certificate' },
  { value: 'generic', label: 'Generic' },
];

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 600,
  color: '#a1a1b5',
  marginBottom: '6px',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
};

const inputStyle: React.CSSProperties = {
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
  transition: 'border-color 150ms ease',
};

export function AddSecretModal() {
  const {
    addSecretOpen,
    setAddSecretOpen,
    editingSecret,
    setEditingSecret,
    currentEnvId,
    fetchSecrets,
  } = useAppStore();

  const isEdit = !!editingSecret;
  const open = addSecretOpen;

  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [type, setType] = useState('generic');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const keyRef = useRef<HTMLInputElement>(null);

  // Populate form when editing
  useEffect(() => {
    if (open && editingSecret) {
      setKey(editingSecret.key);
      setValue(editingSecret.value ?? '');
      setType(editingSecret.type || 'generic');
      setNotes(editingSecret.notes ?? '');
      setError(null);
    } else if (open && !editingSecret) {
      setKey('');
      setValue('');
      setType('generic');
      setNotes('');
      setError(null);
    }
  }, [open, editingSecret]);

  // Focus key input on open (value input in edit mode since key is disabled)
  useEffect(() => {
    if (open) {
      setTimeout(() => keyRef.current?.focus(), 60);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  const handleClose = () => {
    setEditingSecret(null);
    setAddSecretOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) { setError('Key is required.'); return; }
    if (!value.trim()) { setError('Value is required.'); return; }
    if (!currentEnvId && !isEdit) { setError('No environment selected.'); return; }

    setLoading(true);
    setError(null);
    try {
      if (isEdit && editingSecret) {
        await api.secrets.update(editingSecret.id, {
          value: value.trim(),
          type,
          notes: notes.trim(),
        });
      } else if (currentEnvId) {
        await api.secrets.create(currentEnvId, {
          key: key.trim().toUpperCase(),
          value: value.trim(),
          type,
          notes: notes.trim(),
        });
      }
      await fetchSecrets();
      handleClose();
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
            onClick={handleClose}
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
                maxWidth: '480px',
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
                  {isEdit ? 'Edit Secret' : 'Add Secret'}
                </h2>
                <button
                  type="button"
                  onClick={handleClose}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'transparent',
                    border: 'none',
                    color: '#6b6b80',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'background-color 150ms ease, color 150ms ease',
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => {
                    const btn = e.currentTarget as HTMLButtonElement;
                    btn.style.backgroundColor = '#222230';
                    btn.style.color = '#e4e4ed';
                  }}
                  onMouseLeave={(e) => {
                    const btn = e.currentTarget as HTMLButtonElement;
                    btn.style.backgroundColor = 'transparent';
                    btn.style.color = '#6b6b80';
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Body */}
              <form onSubmit={handleSubmit}>
                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

                  {/* Key */}
                  <div>
                    <label htmlFor="secret-key" style={labelStyle}>
                      Key <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      ref={keyRef}
                      id="secret-key"
                      type="text"
                      value={key}
                      onChange={(e) => setKey(e.target.value.toUpperCase())}
                      placeholder="DATABASE_URL"
                      disabled={isEdit}
                      style={{
                        ...inputStyle,
                        fontFamily: 'var(--font-mono, monospace)',
                        opacity: isEdit ? 0.5 : 1,
                        cursor: isEdit ? 'not-allowed' : 'text',
                      }}
                      onFocus={(e) => {
                        if (!isEdit) {
                          (e.currentTarget as HTMLInputElement).style.borderColor = '#6366f1';
                        }
                      }}
                      onBlur={(e) => {
                        (e.currentTarget as HTMLInputElement).style.borderColor = '#2a2a3a';
                      }}
                    />
                    {isEdit && (
                      <p style={{ fontSize: '12px', color: '#6b6b80', marginTop: '4px', marginBottom: 0 }}>
                        Key cannot be changed after creation.
                      </p>
                    )}
                  </div>

                  {/* Value */}
                  <div>
                    <label htmlFor="secret-value" style={labelStyle}>
                      Value <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <textarea
                      id="secret-value"
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      placeholder="Enter the secret value..."
                      rows={3}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        fontSize: '13px',
                        fontFamily: 'var(--font-mono, monospace)',
                        color: '#e4e4ed',
                        backgroundColor: '#12121a',
                        border: '1px solid #2a2a3a',
                        borderRadius: '8px',
                        outline: 'none',
                        boxSizing: 'border-box',
                        resize: 'vertical',
                        minHeight: '80px',
                        transition: 'border-color 150ms ease',
                        lineHeight: '1.5',
                      }}
                      onFocus={(e) => {
                        (e.currentTarget as HTMLTextAreaElement).style.borderColor = '#6366f1';
                      }}
                      onBlur={(e) => {
                        (e.currentTarget as HTMLTextAreaElement).style.borderColor = '#2a2a3a';
                      }}
                    />
                  </div>

                  {/* Type */}
                  <div>
                    <label htmlFor="secret-type" style={labelStyle}>
                      Type
                    </label>
                    <select
                      id="secret-type"
                      value={type}
                      onChange={(e) => setType(e.target.value)}
                      style={{
                        ...inputStyle,
                        cursor: 'pointer',
                        appearance: 'none',
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b6b80' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 12px center',
                        paddingRight: '36px',
                      }}
                      onFocus={(e) => {
                        (e.currentTarget as HTMLSelectElement).style.borderColor = '#6366f1';
                      }}
                      onBlur={(e) => {
                        (e.currentTarget as HTMLSelectElement).style.borderColor = '#2a2a3a';
                      }}
                    >
                      {SECRET_TYPES.map((t) => (
                        <option key={t.value} value={t.value} style={{ backgroundColor: '#1a1a25' }}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Notes */}
                  <div>
                    <label htmlFor="secret-notes" style={labelStyle}>
                      Notes <span style={{ fontSize: '11px', fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: '#6b6b80' }}>(optional)</span>
                    </label>
                    <textarea
                      id="secret-notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="What is this secret for?"
                      rows={2}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        fontSize: '14px',
                        color: '#e4e4ed',
                        backgroundColor: '#12121a',
                        border: '1px solid #2a2a3a',
                        borderRadius: '8px',
                        outline: 'none',
                        boxSizing: 'border-box',
                        resize: 'vertical',
                        minHeight: '64px',
                        transition: 'border-color 150ms ease',
                        lineHeight: '1.5',
                      }}
                      onFocus={(e) => {
                        (e.currentTarget as HTMLTextAreaElement).style.borderColor = '#6366f1';
                      }}
                      onBlur={(e) => {
                        (e.currentTarget as HTMLTextAreaElement).style.borderColor = '#2a2a3a';
                      }}
                    />
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
                    onClick={handleClose}
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
                    }}
                    onMouseEnter={(e) => {
                      const btn = e.currentTarget as HTMLButtonElement;
                      btn.style.backgroundColor = '#222230';
                      btn.style.color = '#e4e4ed';
                    }}
                    onMouseLeave={(e) => {
                      const btn = e.currentTarget as HTMLButtonElement;
                      btn.style.backgroundColor = 'transparent';
                      btn.style.color = '#a1a1b5';
                    }}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={loading}
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
                      minWidth: '100px',
                      opacity: loading ? 0.7 : 1,
                      transition: 'background-color 150ms ease, opacity 150ms ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      whiteSpace: 'nowrap',
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
                        Saving...
                      </>
                    ) : isEdit ? (
                      'Save Changes'
                    ) : (
                      'Add Secret'
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
