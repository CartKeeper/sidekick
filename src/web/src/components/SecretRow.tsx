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

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete secret "${secret.key}"?`)) return;
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
        padding: '10px 0',
        borderBottom: '1px solid #2a2a3a',
        backgroundColor: hovered ? 'rgba(255,255,255,0.025)' : 'transparent',
        transition: 'background-color 150ms ease',
      }}
    >
      {/* Row 1: key name + type badge + actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: '#e4e4ed',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            minWidth: 0,
          }}
        >
          {secret.key}
        </span>

        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            height: '20px',
            padding: '0 6px',
            fontSize: '10px',
            fontWeight: 600,
            color: typeColor,
            backgroundColor: `${typeColor}1a`,
            borderRadius: '4px',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {(secret.type || 'generic').replace(/_/g, ' ')}
        </span>

        {/* Actions — visible on hover */}
        <div
          style={{
            display: 'flex',
            gap: '2px',
            flexShrink: 0,
            opacity: hovered ? 1 : 0,
            transition: 'opacity 150ms ease',
          }}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setRevealed(v => !v); }}
            title={revealed ? 'Hide' : 'Reveal'}
            style={iconBtn}
          >
            {revealed ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
          <button type="button" onClick={handleCopy} title="Copy" style={iconBtn}>
            {copied ? <Check size={12} color="#22c55e" /> : <Copy size={12} />}
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setEditingSecret(secret); }}
            title="Edit"
            style={iconBtn}
          >
            <Pencil size={12} />
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            title="Delete"
            style={{ ...iconBtn, opacity: deleting ? 0.4 : 1 }}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Row 2: value (dots or revealed) */}
      <div
        style={{
          marginTop: '4px',
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: '12px',
          color: revealed ? '#a1a1b5' : '#4a4a5a',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          userSelect: revealed ? 'text' : 'none',
        }}
      >
        {revealed ? (secret.value ?? '(empty)') : '••••••••••••••••'}
      </div>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
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
  padding: 0,
};
