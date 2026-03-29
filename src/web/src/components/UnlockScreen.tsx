import { useState, useEffect, useRef, useId } from 'react';
import { motion } from 'framer-motion';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { useAppStore } from '../stores/app';

export function UnlockScreen() {
  const unlock = useAppStore((s) => s.unlock);

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const passwordId = useId();

  // Auto-focus the password input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!password) {
      setError('Please enter your master password.');
      return;
    }

    setLoading(true);
    try {
      await unlock(password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Incorrect password.');
      setLoading(false);
      // Clear and refocus after failed attempt
      setPassword('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  return (
    <div className="min-h-screen bg-void flex flex-col">
      {/* Electron drag region */}
      <div className="drag-region h-10 w-full shrink-0" />

      <div className="flex-1 flex items-center justify-center px-4 pb-10">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="w-full max-w-[400px]"
        >
          {/* Card */}
          <div
            className="bg-surface border border-border-default rounded-[12px] p-4"
          >
            {/* App title with lock icon */}
            <div className="flex flex-col items-center gap-3 mb-6">
              <div className="flex items-center justify-center w-10 h-10 rounded-[8px] bg-accent-muted">
                <Lock className="w-5 h-5 text-accent" />
              </div>
              <div className="text-center">
                <h1 className="text-[28px] font-bold text-text-primary leading-[1.2]">
                  Sidekick
                </h1>
                <p className="text-[14px] text-text-muted mt-1">
                  Vault is locked
                </p>
              </div>
            </div>

            {/* Heading */}
            <h2 className="text-[20px] font-semibold text-text-primary leading-[1.3] mb-4">
              Unlock Vault
            </h2>

            <form onSubmit={handleSubmit} noValidate>
              {/* Password field */}
              <div className="mb-4">
                <label
                  htmlFor={passwordId}
                  className="block text-[12px] font-semibold text-text-secondary mb-[6px]"
                >
                  Master Password
                </label>
                <div className="relative">
                  <input
                    ref={inputRef}
                    id={passwordId}
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter master password"
                    autoComplete="current-password"
                    className={[
                      'w-full h-10 bg-abyss border rounded-[8px] px-3 pr-10',
                      'text-[14px] text-text-primary placeholder:text-text-muted',
                      'transition-colors duration-[150ms]',
                      'focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent',
                      error ? 'border-danger' : 'border-border-default',
                    ].join(' ')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="no-drag absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors duration-[150ms] focus-ring rounded-[4px]"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {/* Error message */}
                {error && (
                  <p className="text-[12px] font-semibold text-danger mt-1">
                    {error}
                  </p>
                )}
              </div>

              {/* Submit button */}
              <button
                type="submit"
                disabled={loading}
                className={[
                  'no-drag w-full h-10 rounded-[8px] px-4',
                  'text-[14px] font-semibold text-white',
                  'bg-accent hover:bg-accent-hover',
                  'transition-colors duration-[150ms]',
                  'focus-ring',
                  'active:scale-[0.97]',
                  'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
                ].join(' ')}
              >
                {loading ? 'Unlocking…' : 'Unlock'}
              </button>
            </form>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
