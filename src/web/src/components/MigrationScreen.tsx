import { useState, useId } from 'react';
import { motion } from 'framer-motion';
import {
  Database,
  Terminal,
  GitMerge,
  Check,
  AlertCircle,
  ArrowRight,
  Lock,
  Eye,
  EyeOff,
} from 'lucide-react';
import { api } from '../api/client';

interface MigrationPreview {
  infiscal?: {
    projectCount: number;
    secretCount: number;
  };
  devrun?: {
    projectCount: number;
  };
  mergeableCount?: number;
}

interface MigrationScreenProps {
  preview: MigrationPreview;
  onComplete: () => void;
  onSkip: () => void;
}

export function MigrationScreen({ preview, onComplete, onSkip }: MigrationScreenProps) {
  const [infiscalPassword, setInfiscalPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [success, setSuccess] = useState<{ imported: any } | null>(null);

  const passwordId = useId();

  const hasInfiscal = Boolean(preview.infiscal);
  const hasDevrun = Boolean(preview.devrun);
  const mergeableCount = preview.mergeableCount ?? 0;

  async function handleMigrate() {
    setErrors([]);
    setLoading(true);
    try {
      const result = await api.migration.run(
        hasInfiscal && infiscalPassword ? infiscalPassword : undefined
      );
      if (result.errors && result.errors.length > 0) {
        setErrors(result.errors);
      }
      setSuccess({ imported: result.imported });
    } catch (err: unknown) {
      setErrors([err instanceof Error ? err.message : 'Migration failed.']);
    } finally {
      setLoading(false);
    }
  }

  // Success state
  if (success) {
    const projectCount: number =
      (success.imported?.projects ?? 0);
    const secretCount: number =
      (success.imported?.secrets ?? 0);

    return (
      <div className="min-h-screen bg-void flex flex-col">
        <div className="drag-region h-10 w-full shrink-0" />
        <div className="flex-1 flex items-center justify-center px-4 pb-10">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="w-full max-w-xl"
          >
            <div className="bg-surface border border-border-default rounded-[12px] p-4">
              {/* Success icon */}
              <div className="flex flex-col items-center gap-3 mb-6">
                <div className="flex items-center justify-center w-10 h-10 rounded-[8px] bg-success/10">
                  <Check className="w-5 h-5 text-success" />
                </div>
                <div className="text-center">
                  <h1 className="text-[20px] font-semibold text-text-primary leading-[1.3]">
                    Migration Complete
                  </h1>
                  <p className="text-[14px] text-text-muted mt-1">
                    {projectCount > 0 || secretCount > 0
                      ? `Imported ${projectCount} project${projectCount !== 1 ? 's' : ''}${secretCount > 0 ? `, ${secretCount} secret${secretCount !== 1 ? 's' : ''}` : ''}`
                      : 'Your data has been imported successfully.'}
                  </p>
                </div>
              </div>

              {/* Partial errors (migration ran but some items failed) */}
              {errors.length > 0 && (
                <div className="mb-4 bg-danger/10 border border-danger/20 rounded-[8px] p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-4 h-4 text-danger shrink-0" />
                    <span className="text-[12px] font-semibold text-danger">
                      Some items could not be imported
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {errors.map((e, i) => (
                      <li key={i} className="text-[12px] text-text-secondary">
                        {e}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                type="button"
                onClick={onComplete}
                className={[
                  'no-drag w-full h-12 rounded-[8px] px-6',
                  'text-[14px] font-semibold text-white',
                  'bg-accent hover:bg-accent-hover',
                  'transition-colors duration-[150ms]',
                  'focus-ring',
                  'active:scale-[0.97]',
                  'flex items-center justify-center gap-2',
                ].join(' ')}
              >
                Continue to Sidekick
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-void flex flex-col">
      <div className="drag-region h-10 w-full shrink-0" />

      <div className="flex-1 flex items-center justify-center px-4 pb-10">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="w-full max-w-xl"
        >
          <div className="bg-surface border border-border-default rounded-[12px] p-4">
            {/* Header */}
            <div className="mb-6">
              <h1 className="text-[20px] font-semibold text-text-primary leading-[1.3]">
                Migrate Existing Data
              </h1>
              <p className="text-[14px] text-text-muted mt-1">
                We found data from your previous apps
              </p>
            </div>

            {/* Infiscal section */}
            {hasInfiscal && (
              <div className="mb-4 bg-abyss border border-border-default rounded-[12px] p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-[8px] bg-accent-muted shrink-0">
                    <Database className="w-4 h-4 text-accent" />
                  </div>
                  <div>
                    <p className="text-[16px] font-semibold text-text-primary leading-[1.4]">
                      Infiscal
                    </p>
                    <p className="text-[12px] font-semibold text-text-muted">
                      {preview.infiscal!.projectCount} project{preview.infiscal!.projectCount !== 1 ? 's' : ''},&nbsp;
                      {preview.infiscal!.secretCount} secret{preview.infiscal!.secretCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                {/* Infiscal password field */}
                <div>
                  <label
                    htmlFor={passwordId}
                    className="block text-[12px] font-semibold text-text-secondary mb-[6px]"
                  >
                    <span className="flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      Infiscal Master Password
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      id={passwordId}
                      type={showPassword ? 'text' : 'password'}
                      value={infiscalPassword}
                      onChange={(e) => setInfiscalPassword(e.target.value)}
                      placeholder="Enter your Infiscal master password"
                      autoComplete="current-password"
                      className={[
                        'w-full h-10 bg-void border border-border-default rounded-[8px] px-3 pr-10',
                        'text-[14px] text-text-primary placeholder:text-text-muted',
                        'transition-colors duration-[150ms]',
                        'focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent',
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
              </div>
            )}

            {/* Devrun section */}
            {hasDevrun && (
              <div className="mb-4 bg-abyss border border-border-default rounded-[12px] p-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-[8px] bg-accent-muted shrink-0">
                    <Terminal className="w-4 h-4 text-accent" />
                  </div>
                  <div>
                    <p className="text-[16px] font-semibold text-text-primary leading-[1.4]">
                      Devrun
                    </p>
                    <p className="text-[12px] font-semibold text-text-muted">
                      {preview.devrun!.projectCount} project{preview.devrun!.projectCount !== 1 ? 's' : ''} with launch configs
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Merge note */}
            {mergeableCount > 0 && (
              <div className="mb-4 flex items-start gap-2 bg-accent/5 border border-accent/20 rounded-[8px] px-3 py-2">
                <GitMerge className="w-4 h-4 text-accent mt-[1px] shrink-0" />
                <p className="text-[12px] font-semibold text-text-secondary">
                  {mergeableCount} project{mergeableCount !== 1 ? 's' : ''} will be merged (found in both apps)
                </p>
              </div>
            )}

            {/* Errors */}
            {errors.length > 0 && (
              <div className="mb-4 bg-danger/10 border border-danger/20 rounded-[8px] p-3">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-4 h-4 text-danger shrink-0" />
                  <span className="text-[12px] font-semibold text-danger">
                    Migration failed
                  </span>
                </div>
                <ul className="space-y-1">
                  {errors.map((e, i) => (
                    <li key={i} className="text-[12px] text-text-secondary">
                      {e}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={handleMigrate}
                disabled={loading}
                className={[
                  'no-drag w-full h-12 rounded-[8px] px-6',
                  'text-[14px] font-semibold text-white',
                  'bg-accent hover:bg-accent-hover',
                  'transition-colors duration-[150ms]',
                  'focus-ring',
                  'active:scale-[0.97]',
                  'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
                ].join(' ')}
              >
                {loading ? 'Migrating…' : 'Migrate'}
              </button>

              <button
                type="button"
                onClick={onSkip}
                disabled={loading}
                className={[
                  'no-drag w-full h-10 rounded-[8px] px-4',
                  'text-[14px] font-semibold text-text-muted',
                  'hover:text-text-secondary',
                  'transition-colors duration-[150ms]',
                  'focus-ring',
                  'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
                ].join(' ')}
              >
                Skip
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
