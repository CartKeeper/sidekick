import { cn } from './cn';

export function TypeBadge({ type, label }: { type: string; label?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center h-5 px-1.5 rounded-sm text-[10px] font-semibold whitespace-nowrap shrink-0 ui-badge',
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
