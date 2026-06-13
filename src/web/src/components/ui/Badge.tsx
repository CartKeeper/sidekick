import { cn } from './cn';

// Maps to --color-type-* tokens; certificate is the token value (#14b8a6), not the old #22c55e.
const TYPE_CLASS: Record<string, string> = {
  api_key: 'text-type-api-key bg-type-api-key/10',
  secret: 'text-type-secret bg-type-secret/10',
  token: 'text-type-token bg-type-token/10',
  password: 'text-type-password bg-type-password/10',
  connection: 'text-type-connection bg-type-connection/10',
  url: 'text-type-url bg-type-url/10',
  certificate: 'text-type-certificate bg-type-certificate/10',
  generic: 'text-type-generic bg-type-generic/10',
  supabase: 'text-brand-supabase bg-brand-supabase/10',
};

export function TypeBadge({ type, label }: { type: string; label?: string }) {
  const cls = TYPE_CLASS[type] ?? TYPE_CLASS.generic;
  return (
    <span
      className={cn(
        'inline-flex items-center h-5 px-1.5 rounded-sm text-[10px] font-semibold',
        'whitespace-nowrap shrink-0',
        cls,
      )}
    >
      {(label ?? type ?? 'generic').replace(/_/g, ' ')}
    </span>
  );
}

type Status = 'success' | 'warning' | 'danger' | 'muted';
const STATUS_CLASS: Record<Status, string> = {
  success: 'text-success bg-success-muted',
  warning: 'text-warning bg-warning-muted',
  danger: 'text-danger bg-danger-muted',
  muted: 'text-text-muted bg-surface-active',
};

export function StatusBadge({ status, children }: { status: Status; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center h-5 px-2 rounded-sm text-[11px] font-semibold whitespace-nowrap shrink-0',
        STATUS_CLASS[status],
      )}
    >
      {children}
    </span>
  );
}
