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

function TypeBadge({ type }: { type: string }) {
  const color = TYPE_COLORS[type] ?? TYPE_COLORS.generic;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: '24px',
        padding: '0 8px',
        fontSize: '12px',
        fontWeight: 600,
        color,
        backgroundColor: `${color}1a`,
        border: `1px solid ${color}40`,
        borderRadius: '6px',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        letterSpacing: '0.02em',
      }}
    >
      {type.replace(/_/g, ' ')}
    </span>
  );
}

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
    } catch {
      // clipboard not available
    }
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

  const toggleReveal = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRevealed((v) => !v);
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 0',
        borderBottom: '1px solid #2a2a3a',
        backgroundColor: hovered ? 'rgba(255,255,255,0.025)' : 'transparent',
        transition: 'background-color 150ms ease',
        cursor: 'default',
      }}
    >
      {/* Key + notes */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: '#e4e4ed',
              letterSpacing: '0.02em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {secret.key}
          </span>
          <TypeBadge type={secret.type || 'generic'} />
        </div>
        {secret.notes && (
          <p
            style={{
              fontSize: '12px',
              fontWeight: 400,
              color: '#6b6b80',
              margin: '2px 0 0',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {secret.notes}
          </p>
        )}
      </div>

      {/* Value */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          flexShrink: 0,
          maxWidth: '280px',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: '13px',
            color: revealed ? '#a1a1b5' : '#6b6b80',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '200px',
            userSelect: revealed ? 'text' : 'none',
          }}
        >
          {revealed ? (secret.value ?? '(empty)') : '••••••••••••'}
        </span>
        <button
          type="button"
          onClick={toggleReveal}
          title={revealed ? 'Hide value' : 'Reveal value'}
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            border: 'none',
            backgroundColor: 'transparent',
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
          {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
      </div>

      {/* Actions */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          flexShrink: 0,
          opacity: hovered ? 1 : 0.4,
          transition: 'opacity 150ms ease',
        }}
      >
        {/* Copy */}
        <button
          type="button"
          onClick={handleCopy}
          title="Copy value"
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
            transition: 'background-color 150ms ease, color 150ms ease',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            const btn = e.currentTarget as HTMLButtonElement;
            btn.style.backgroundColor = '#222230';
            if (!copied) btn.style.color = '#e4e4ed';
          }}
          onMouseLeave={(e) => {
            const btn = e.currentTarget as HTMLButtonElement;
            btn.style.backgroundColor = 'transparent';
            btn.style.color = copied ? '#22c55e' : '#6b6b80';
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>

        {/* Edit */}
        <button
          type="button"
          onClick={handleEdit}
          title="Edit secret"
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
          <Pencil size={14} />
        </button>

        {/* Delete */}
        <button
          type="button"
          onClick={handleDelete}
          title="Delete secret"
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
            transition: 'background-color 150ms ease, color 150ms ease',
            flexShrink: 0,
            opacity: deleting ? 0.5 : 1,
          }}
          onMouseEnter={(e) => {
            if (deleting) return;
            const btn = e.currentTarget as HTMLButtonElement;
            btn.style.backgroundColor = 'rgba(239,68,68,0.1)';
            btn.style.color = '#ef4444';
          }}
          onMouseLeave={(e) => {
            const btn = e.currentTarget as HTMLButtonElement;
            btn.style.backgroundColor = 'transparent';
            btn.style.color = '#6b6b80';
          }}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
