import { forwardRef } from 'react';
import { cn } from './cn';

type Variant = 'ghost' | 'danger';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  ghost: 'text-text-muted hover:text-text-primary hover:bg-surface-hover',
  danger: 'text-text-muted hover:text-danger hover:bg-danger-muted',
};
const SIZES: Record<Size, string> = { sm: 'w-6 h-6', md: 'w-8 h-8' };

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  'aria-label': string;
  variant?: Variant;
  size?: Size;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = 'ghost', size = 'md', className, disabled, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center rounded-md shrink-0 cursor-pointer',
        'transition-colors duration-150 active:scale-[0.97]',
        'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
        'disabled:opacity-40 disabled:pointer-events-none',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
