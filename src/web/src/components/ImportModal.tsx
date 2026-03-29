import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, CheckCircle } from 'lucide-react';
import { api } from '../api/client';
import { useAppStore } from '../stores/app';

export function ImportModal() {
  const {
    importOpen,
    setImportOpen,
    currentProject,
    currentEnvId,
    fetchSecrets,
  } = useAppStore();

  const [format, setFormat] = useState<'dotenv' | 'json'>('dotenv');
  const [content, setContent] = useState('');
  const [overwrite, setOverwrite] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState<number | null>(null);

  // Reset on open
  useEffect(() => {
    if (importOpen) {
      setFormat('dotenv');
      setContent('');
      setOverwrite(false);
      setError(null);
      setImportedCount(null);
    }
  }, [importOpen]);

  // Close on Escape
  useEffect(() => {
    if (!importOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [importOpen]);

  const handleClose = () => {
    setImportOpen(false);
  };

  const currentEnv = currentProject?.environments?.find((e) => e.id === currentEnvId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) { setError('Paste some content to import.'); return; }
    if (!currentProject) { setError('No project selected.'); return; }
    if (!currentEnv) { setError('No environment selected.'); return; }

    setLoading(true);
    setError(null);
    setImportedCount(null);

    try {
      const result = await api.export.import(currentProject.id, {
        env: currentEnv.slug,
        format,
        content: content.trim(),
        overwrite,
      });
      setImportedCount(result.imported);
      await fetchSecrets();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const pillBtn = (active: boolean) => ({
    height: '32px',
    padding: '0 14px',
    fontSize: '13px',
    fontWeight: 600,
    color: active ? '#6366f1' : '#6b6b80',
    backgroundColor: active ? 'rgba(99,102,241,0.12)' : 'transparent',
    border: active ? '1px solid rgba(99,102,241,0.4)' : '1px solid #2a2a3a',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 150ms ease',
    whiteSpace: 'nowrap' as const,
  });

  return (
    <AnimatePresence>
      {importOpen && (
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
                maxWidth: '520px',
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
                <div>
                  <h2
                    style={{
                      fontSize: '16px',
                      fontWeight: 600,
                      color: '#e4e4ed',
                      margin: '0 0 2px',
                    }}
                  >
                    Import Secrets
                  </h2>
                  {currentEnv && (
                    <p style={{ fontSize: '12px', color: '#6b6b80', margin: 0 }}>
                      Into environment: <strong style={{ color: '#a1a1b5' }}>{currentEnv.name}</strong>
                    </p>
                  )}
                </div>
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

                  {/* Format selector */}
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#a1a1b5',
                        marginBottom: '8px',
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                      }}
                    >
                      Format
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => setFormat('dotenv')}
                        style={pillBtn(format === 'dotenv')}
                      >
                        .env
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormat('json')}
                        style={pillBtn(format === 'json')}
                      >
                        JSON
                      </button>
                    </div>
                    <p style={{ fontSize: '12px', color: '#6b6b80', marginTop: '6px', marginBottom: 0 }}>
                      {format === 'dotenv'
                        ? 'Paste .env file content: KEY=VALUE lines'
                        : 'Paste JSON object: { "KEY": "value" }'}
                    </p>
                  </div>

                  {/* Content textarea */}
                  <div>
                    <label
                      htmlFor="import-content"
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
                      Content <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <textarea
                      id="import-content"
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      placeholder={
                        format === 'dotenv'
                          ? 'DATABASE_URL=postgres://...\nAPI_KEY=sk-...'
                          : '{\n  "DATABASE_URL": "postgres://...",\n  "API_KEY": "sk-..."\n}'
                      }
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
                        minHeight: '200px',
                        lineHeight: '1.6',
                        transition: 'border-color 150ms ease',
                      }}
                      onFocus={(e) => {
                        (e.currentTarget as HTMLTextAreaElement).style.borderColor = '#6366f1';
                      }}
                      onBlur={(e) => {
                        (e.currentTarget as HTMLTextAreaElement).style.borderColor = '#2a2a3a';
                      }}
                    />
                  </div>

                  {/* Overwrite checkbox */}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      color: '#a1a1b5',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={overwrite}
                      onChange={(e) => setOverwrite(e.target.checked)}
                      style={{
                        width: '16px',
                        height: '16px',
                        accentColor: '#6366f1',
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    />
                    Overwrite existing secrets with the same key
                  </label>

                  {/* Success state */}
                  {importedCount !== null && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '12px 14px',
                        backgroundColor: 'rgba(34,197,94,0.1)',
                        border: '1px solid rgba(34,197,94,0.3)',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: 600,
                        color: '#22c55e',
                      }}
                    >
                      <CheckCircle size={16} />
                      Imported {importedCount} secret{importedCount !== 1 ? 's' : ''} successfully.
                    </div>
                  )}

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
                    {importedCount !== null ? 'Close' : 'Cancel'}
                  </button>

                  {importedCount === null && (
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
                          Importing...
                        </>
                      ) : (
                        'Import'
                      )}
                    </button>
                  )}
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
