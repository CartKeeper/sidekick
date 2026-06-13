import { cn } from './cn';

export function Card({ className, interactive, ...rest }: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        'ui-card rounded-lg p-4 shadow-sm',
        interactive && 'ui-card-interactive cursor-pointer',
        className,
      )}
      {...rest}
    />
  );
}
