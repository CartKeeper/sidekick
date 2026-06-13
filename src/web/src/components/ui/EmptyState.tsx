import type { LucideIcon } from 'lucide-react';
import { Button } from './Button';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-3 py-12 px-4">
      <Icon size={48} className="text-text-muted" aria-hidden />
      <div className="space-y-1">
        <h3 className="text-[16px] font-semibold text-text-primary text-balance">{title}</h3>
        {description && <p className="text-[13px] text-text-secondary max-w-xs text-balance">{description}</p>}
      </div>
      {actionLabel && onAction && <Button variant="primary" onClick={onAction}>{actionLabel}</Button>}
    </div>
  );
}
