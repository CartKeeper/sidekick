import { cn } from './cn';

export function Card({ className, interactive, ...rest }: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        'bg-surface border border-border-default rounded-lg p-4 shadow-sm',
        interactive && 'transition-colors duration-150 hover:border-border-strong hover:bg-surface-hover cursor-pointer',
        className,
      )}
      {...rest}
    />
  );
}
