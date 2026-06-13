import { useState, useEffect, useRef } from 'react';
import { api } from '../api/client';
import { useAppStore } from '../stores/app';
import { Modal, Button, Input, Textarea, Select } from './ui';

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
    <Modal open={open} onClose={handleClose} size="sm" labelledBy="add-secret-title">
      <Modal.Header
        title={isEdit ? 'Edit Secret' : 'Add Secret'}
        onClose={handleClose}
        id="add-secret-title"
      />

      <form onSubmit={handleSubmit}>
        <Modal.Body className="flex flex-col gap-4">

          {/* Key */}
          <div>
            <label
              htmlFor="secret-key"
              className="block text-[12px] font-semibold text-text-secondary mb-1.5 tracking-widest uppercase"
            >
              Key <span className="text-danger">*</span>
            </label>
            <Input
              ref={keyRef}
              id="secret-key"
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value.toUpperCase())}
              placeholder="DATABASE_URL"
              disabled={isEdit}
              className="font-mono"
            />
            {isEdit && (
              <p className="text-[12px] text-text-muted mt-1 mb-0">
                Key cannot be changed after creation.
              </p>
            )}
          </div>

          {/* Value */}
          <div>
            <label
              htmlFor="secret-value"
              className="block text-[12px] font-semibold text-text-secondary mb-1.5 tracking-widest uppercase"
            >
              Value <span className="text-danger">*</span>
            </label>
            <Textarea
              id="secret-value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Enter the secret value..."
              rows={3}
              className="font-mono text-[13px] min-h-20 resize-y leading-relaxed"
            />
          </div>

          {/* Type */}
          <div>
            <label
              htmlFor="secret-type"
              className="block text-[12px] font-semibold text-text-secondary mb-1.5 tracking-widest uppercase"
            >
              Type
            </label>
            <Select
              id="secret-type"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {SECRET_TYPES.map((t) => (
                <option key={t.value} value={t.value} className="bg-surface">
                  {t.label}
                </option>
              ))}
            </Select>
          </div>

          {/* Notes */}
          <div>
            <label
              htmlFor="secret-notes"
              className="block text-[12px] font-semibold text-text-secondary mb-1.5 tracking-widest uppercase"
            >
              Notes{' '}
              <span className="text-[11px] font-normal normal-case tracking-normal text-text-muted">
                (optional)
              </span>
            </label>
            <Textarea
              id="secret-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What is this secret for?"
              rows={2}
              className="text-[14px] min-h-16 resize-y leading-relaxed"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-[12px] font-semibold text-danger m-0">{error}</p>
          )}
        </Modal.Body>

        <Modal.Footer>
          <Button type="button" variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={loading}>
            {isEdit ? 'Save Changes' : 'Add Secret'}
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
