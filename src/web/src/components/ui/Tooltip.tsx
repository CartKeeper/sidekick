import { cn } from './cn';

// Lightweight CSS tooltip: wrap a single focusable/hoverable child.
export function Tooltip({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('relative inline-flex group', className)}>
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-7 z-50 whitespace-nowrap
                   rounded-md bg-surface-active border border-border-default px-2 py-1 text-[11px] text-text-primary
                   opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}
