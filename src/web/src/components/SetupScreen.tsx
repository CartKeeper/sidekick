import { useState, useId } from 'react';
import { motion } from 'framer-motion';
import { Shield, Eye, EyeOff } from 'lucide-react';
import { useAppStore } from '../stores/app';

export function SetupScreen() {
  const setup = useAppStore((s) => s.setup);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [enableKeychain, setEnableKeychain] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const passwordId = useId();
  const confirmId = useId();
  const keychainId = useId();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await setup(password, enableKeychain);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create vault.');
      setLoading(false);
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
            {/* App title */}
            <div className="flex flex-col items-center gap-3 mb-6">
              <div className="flex items-center justify-center w-10 h-10 rounded-[8px] bg-accent-muted">
                <Shield className="w-5 h-5 text-accent" />
              </div>
              <div className="text-center">
                <h1 className="text-[28px] font-bold text-text-primary leading-[1.2]">
                  Sidekick
                </h1>
                <p className="text-[14px] text-text-muted mt-1">
                  Your local secrets vault
                </p>
              </div>
            </div>

            {/* Heading */}
            <h2 className="text-[20px] font-semibold text-text-primary leading-[1.3] mb-4">
              Create Master Password
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
                    id={passwordId}
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter master password"
                    autoComplete="new-password"
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
              </div>

              {/* Confirm password field */}
              <div className="mb-4">
                <label
                  htmlFor={confirmId}
                  className="block text-[12px] font-semibold text-text-secondary mb-[6px]"
                >
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    id={confirmId}
                    type={showConfirm ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Confirm master password"
                    autoComplete="new-password"
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
                    onClick={() => setShowConfirm((v) => !v)}
                    className="no-drag absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors duration-[150ms] focus-ring rounded-[4px]"
                    tabIndex={-1}
                    aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  >
                    {showConfirm ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Error message */}
              {error && (
                <p className="text-[12px] font-semibold text-danger mt-[-8px] mb-4">
                  {error}
                </p>
              )}

              {/* Keychain checkbox */}
              <div className="flex items-center gap-2 mb-6">
                <input
                  id={keychainId}
                  type="checkbox"
                  checked={enableKeychain}
                  onChange={(e) => setEnableKeychain(e.target.checked)}
                  className="no-drag w-4 h-4 rounded-[4px] border border-border-default bg-abyss accent-accent cursor-pointer"
                />
                <label
                  htmlFor={keychainId}
                  className="text-[14px] text-text-secondary cursor-pointer select-none"
                >
                  Enable macOS Keychain auto-unlock
                </label>
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
                {loading ? 'Creating vault…' : 'Create Vault'}
              </button>
            </form>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
