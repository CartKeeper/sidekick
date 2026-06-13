import { useState } from 'react';
import { Eye, EyeOff, Copy, Pencil, Trash2, Check } from 'lucide-react';
import { api, type Secret } from '../api/client';
import { useAppStore } from '../stores/app';
import { IconButton, TypeBadge, ConfirmDialog } from './ui';

export function SecretRow({ secret }: { secret: Secret }) {
  const { setEditingSecret, fetchSecrets } = useAppStore();
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!secret.value) return;
    try {
      await navigator.clipboard.writeText(secret.value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await api.secrets.remove(secret.id);
      await fetchSecrets();
    } catch {
      setDeleting(false);
      setConfirmOpen(false);
    }
  };

  return (
    <div className="group py-2.5 border-b border-border-default transition-colors duration-150 hover:bg-white/[0.025]">
      <div className="flex items-center gap-2">
        <span className="flex-1 min-w-0 truncate text-[13px] font-semibold text-text-primary">{secret.key}</span>
        <TypeBadge type={secret.type || 'generic'} />
        {secret.source === 'supabase' && <TypeBadge type="supabase" label="supabase" />}

        <div className="flex gap-0.5 shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
          <IconButton size="sm" aria-label={revealed ? 'Hide value' : 'Reveal value'} onClick={(e) => { e.stopPropagation(); setRevealed((v) => !v); }}>
            {revealed ? <EyeOff size={12} /> : <Eye size={12} />}
          </IconButton>
          <IconButton size="sm" aria-label="Copy value" onClick={handleCopy}>
            {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
          </IconButton>
          <IconButton size="sm" aria-label="Edit secret" onClick={(e) => { e.stopPropagation(); setEditingSecret(secret); }}>
            <Pencil size={12} />
          </IconButton>
          <IconButton size="sm" variant="danger" aria-label="Delete secret" disabled={deleting} onClick={(e) => { e.stopPropagation(); setConfirmOpen(true); }}>
            <Trash2 size={12} />
          </IconButton>
        </div>
      </div>

      <div className={revealed ? 'mt-1 font-mono text-[12px] truncate text-text-secondary select-text' : 'mt-1 font-mono text-[12px] truncate text-text-muted select-none'}>
        {revealed ? (secret.value ?? '(empty)') : '••••••••••••••••'}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete Secret"
        message={<>Delete secret &ldquo;{secret.key}&rdquo;? This cannot be undone.</>}
        confirmLabel="Delete Secret"
        danger
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
