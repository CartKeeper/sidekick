import { useState, useEffect } from 'react';
import { CheckCircle } from 'lucide-react';
import { api } from '../api/client';
import { useAppStore } from '../stores/app';
import { Modal, Button, Textarea, cn } from './ui';

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

  return (
    <Modal open={importOpen} onClose={handleClose} size="sm" labelledBy="import-modal-title">
      <Modal.Header title="Import Secrets" onClose={handleClose} id="import-modal-title" />

      <form onSubmit={handleSubmit}>
        <Modal.Body className="flex flex-col gap-4">

          {/* Environment subtitle */}
          {currentEnv && (
            <p className="text-[12px] text-text-muted m-0 -mt-1">
              Into environment: <strong className="text-text-secondary">{currentEnv.name}</strong>
            </p>
          )}

          {/* Format selector */}
          <div>
            <label className="block text-[12px] font-semibold text-text-secondary mb-2 tracking-widest uppercase">
              Format
            </label>
            <div className="flex gap-2">
              {(['dotenv', 'json'] as const).map((fmt) => {
                const active = format === fmt;
                return (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setFormat(fmt)}
                    className={cn(
                      'h-8 px-3.5 text-[13px] font-semibold rounded-md cursor-pointer whitespace-nowrap',
                      'border transition-colors duration-150',
                      active
                        ? 'text-accent bg-accent/10 border-accent/40'
                        : 'text-text-muted bg-transparent border-border-default hover:text-text-primary hover:bg-surface-hover',
                    )}
                  >
                    {fmt === 'dotenv' ? '.env' : 'JSON'}
                  </button>
                );
              })}
            </div>
            <p className="text-[12px] text-text-muted mt-1.5 mb-0">
              {format === 'dotenv'
                ? 'Paste .env file content: KEY=VALUE lines'
                : 'Paste JSON object: { "KEY": "value" }'}
            </p>
          </div>

          {/* Content textarea */}
          <div>
            <label
              htmlFor="import-content"
              className="block text-[12px] font-semibold text-text-secondary mb-1.5 tracking-widest uppercase"
            >
              Content <span className="text-danger">*</span>
            </label>
            <Textarea
              id="import-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={
                format === 'dotenv'
                  ? 'DATABASE_URL=postgres://...\nAPI_KEY=sk-...'
                  : '{\n  "DATABASE_URL": "postgres://...",\n  "API_KEY": "sk-..."\n}'
              }
              className="font-mono text-[13px] min-h-50 resize-y leading-relaxed"
            />
          </div>

          {/* Overwrite checkbox */}
          <label className="flex items-center gap-2.5 cursor-pointer text-[14px] text-text-secondary">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
              className="w-4 h-4 cursor-pointer shrink-0 accent-accent"
            />
            Overwrite existing secrets with the same key
          </label>

          {/* Success state */}
          {importedCount !== null && (
            <div className="flex items-center gap-2 px-3.5 py-3 bg-success/10 border border-success/30 rounded-md text-[14px] font-semibold text-success">
              <CheckCircle size={16} />
              Imported {importedCount} secret{importedCount !== 1 ? 's' : ''} successfully.
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-[12px] font-semibold text-danger m-0">{error}</p>
          )}
        </Modal.Body>

        <Modal.Footer>
          <Button type="button" variant="ghost" onClick={handleClose}>
            {importedCount !== null ? 'Close' : 'Cancel'}
          </Button>
          {importedCount === null && (
            <Button type="submit" variant="primary" loading={loading}>
              Import
            </Button>
          )}
        </Modal.Footer>
      </form>
    </Modal>
  );
}
