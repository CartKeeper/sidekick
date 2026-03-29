import { useState } from 'react';
import { Eye, EyeOff, Copy, Pencil, Trash2, Check } from 'lucide-react';
import { api, type Secret } from '../api/client';
import { useAppStore } from '../stores/app';

const TYPE_COLORS: Record<string, string> = {
  api_key: '#f59e0b',
  secret: '#ef4444',
  token: '#a855f7',
  password: '#ec4899',
  connection: '#3b82f6',
  url: '#06b6d4',
  certificate: '#22c55e',
  generic: '#6b7280',
};

interface SecretRowProps {
  secret: Secret;
}

export function SecretRow({ secret }: SecretRowProps) {
  const { setEditingSecret, fetchSecrets } = useAppStore();
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [hovered, setHovered] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!secret.value) return;
    try {
      await navigator.clipboard.writeText(secret.value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSecret(secret);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete secret "${secret.key}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await api.secrets.remove(secret.id);
      await fetchSecrets();
    } catch {
      setDeleting(false);
    }
  };

  const typeColor = TYPE_COLORS[secret.type] ?? TYPE_COLORS.generic;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        height: '48px',
        padding: '0',
        borderBottom: '1px solid #2a2a3a',
        backgroundColor: hovered ? 'rgba(255,255,255,0.025)' : 'transparent',
        transition: 'background-color 150ms ease',
        cursor: 'default',
      }}
    >
      {/* Key name — takes available space, truncates */}
      <div style={{ flex: 1, minWidth: 0, paddingRight: '12px' }}>
        <span
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: '#e4e4ed',
            letterSpacing: '0.02em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            display: 'block',
          }}
        >
          {secret.key}
        </span>
      </div>

      {/* Type badge — fixed width column */}
      <div style={{ width: '90px', flexShrink: 0, paddingRight: '12px' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            height: '22px',
            padding: '0 8px',
            fontSize: '11px',
            fontWeight: 600,
            color: typeColor,
            backgroundColor: `${typeColor}1a`,
            borderRadius: '6px',
            whiteSpace: 'nowrap',
            letterSpacing: '0.02em',
          }}
        >
          {(secret.type || 'generic').replace(/_/g, ' ')}
        </span>
      </div>

      {/* Value — fixed width column */}
      <div
        style={{
          width: '140px',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: '12px',
            color: revealed ? '#a1a1b5' : '#6b6b80',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            minWidth: 0,
            userSelect: revealed ? 'text' : 'none',
          }}
        >
          {revealed ? (secret.value ?? '(empty)') : '••••••••••••'}
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setRevealed((v) => !v); }}
          title={revealed ? 'Hide' : 'Reveal'}
          style={{
            width: '24px',
            height: '24px',
            borderRadius: '6px',
            border: 'none',
            backgroundColor: 'transparent',
            color: '#6b6b80',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {revealed ? <EyeOff size={12} /> : <Eye size={12} />}
        </button>
      </div>

      {/* Actions — fixed width column */}
      <div
        style={{
          width: '104px',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: '2px',
          justifyContent: 'flex-end',
          opacity: hovered ? 1 : 0.3,
          transition: 'opacity 150ms ease',
        }}
      >
        <button
          type="button"
          onClick={handleCopy}
          title="Copy"
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: 'transparent',
            color: copied ? '#22c55e' : '#6b6b80',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
        <button
          type="button"
          onClick={handleEdit}
          title="Edit"
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: 'transparent',
            color: '#6b6b80',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          onClick={handleDelete}
          title="Delete"
          disabled={deleting}
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: 'transparent',
            color: '#6b6b80',
            cursor: deleting ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: deleting ? 0.5 : 1,
          }}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
