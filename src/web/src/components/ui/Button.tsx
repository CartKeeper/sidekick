import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from './cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'ui-btn-primary border border-transparent',
  secondary:
    'bg-surface text-text-primary border border-border-default hover:bg-surface-hover hover:border-border-strong',
  ghost: 'bg-transparent text-text-secondary border border-transparent hover:bg-surface-hover hover:text-text-primary',
  danger: 'bg-danger text-white hover:bg-danger-hover border border-transparent',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[12px] min-w-16',
  md: 'h-10 px-4 text-[14px] min-w-20',
  lg: 'h-12 px-6 text-[14px] min-w-[100px]',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading = false, disabled, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-sans font-medium whitespace-nowrap',
        'transition-[transform,background-color,border-color] duration-150 active:scale-[0.97]',
        'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
        'disabled:opacity-50 disabled:pointer-events-none',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 size={size === 'sm' ? 13 : 14} className="spin shrink-0" />}
      {children}
    </button>
  );
});
