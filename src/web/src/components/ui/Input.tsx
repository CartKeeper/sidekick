import { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from './cn';

const BASE =
  'w-full bg-void text-text-primary placeholder:text-text-muted border rounded-md ' +
  'transition-colors duration-150 ' +
  'focus-visible:outline-none focus:border-accent focus:ring-1 focus:ring-accent ' +
  'disabled:opacity-50 disabled:pointer-events-none';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  revealable?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { error, revealable, type, className, ...rest },
  ref,
) {
  const [reveal, setReveal] = useState(false);
  const isPassword = type === 'password' && revealable;
  return (
    <div className="relative w-full">
      <input
        ref={ref}
        type={isPassword ? (reveal ? 'text' : 'password') : type}
        className={cn(
          BASE,
          'h-10 px-3 text-[14px]',
          isPassword && 'pr-10',
          error ? 'border-danger' : 'border-border-default',
          className,
        )}
        {...rest}
      />
      {isPassword && (
        <button
          type="button"
          aria-label={reveal ? 'Hide value' : 'Reveal value'}
          onClick={() => setReveal((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary
                     focus-visible:outline-2 focus-visible:outline-accent rounded"
        >
          {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      )}
    </div>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean }>(
  function Textarea({ error, className, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(BASE, 'min-h-[80px] py-2 px-3 text-[14px] resize-y', error ? 'border-danger' : 'border-border-default', className)}
        {...rest}
      />
    );
  },
);

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { error?: boolean }>(
  function Select({ error, className, children, ...rest }, ref) {
    return (
      <select
        ref={ref}
        className={cn(BASE, 'h-10 px-3 text-[14px]', error ? 'border-danger' : 'border-border-default', className)}
        {...rest}
      >
        {children}
      </select>
    );
  },
);
