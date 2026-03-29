import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, CheckCircle, Eye, EyeOff, ChevronRight, Database } from 'lucide-react';
import { api } from '../api/client';
import type { Environment } from '../api/client';

interface SupabaseProject {
  id: string;
  name: string;
  region: string;
  organization_id: string;
}

interface KeyEntry {
  name: string;
  value: string;
  selected: boolean;
}

interface Props {
  projectId: string;
  environments: Environment[];
  currentEnvSlug: string;
  onClose: () => void;
}

type Step = 'token' | 'select-project' | 'preview-keys' | 'success';

const slideVariants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 40 : -40,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (dir: number) => ({
    x: dir > 0 ? -40 : 40,
    opacity: 0,
  }),
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: '40px',
  padding: '0 12px',
  fontSize: '14px',
  color: '#e4e4ed',
  backgroundColor: '#12121a',
  border: '1px solid #2a2a3a',
  borderRadius: '8px',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 150ms ease',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 600,
  color: '#a1a1b5',
  marginBottom: '6px',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
};

const btnSecondary: React.CSSProperties = {
  height: '40px',
  padding: '0 16px',
  fontSize: '14px',
  fontWeight: 500,
  color: '#a1a1b5',
  backgroundColor: 'transparent',
  border: '1px solid #2a2a3a',
  borderRadius: '8px',
  cursor: 'pointer',
  minWidth: '80px',
  transition: 'background-color 150ms ease, color 150ms ease',
  whiteSpace: 'nowrap',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
};

const btnPrimary = (disabled = false): React.CSSProperties => ({
  height: '40px',
  padding: '0 16px',
  fontSize: '14px',
  fontWeight: 600,
  color: '#ffffff',
  backgroundColor: disabled ? '#5558e6' : '#6366f1',
  border: 'none',
  borderRadius: '8px',
  cursor: disabled ? 'not-allowed' : 'pointer',
  minWidth: '100px',
  opacity: disabled ? 0.7 : 1,
  transition: 'background-color 150ms ease, opacity 150ms ease',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  whiteSpace: 'nowrap',
});

export function SupabaseImportModal({ projectId, environments, currentEnvSlug, onClose }: Props) {
  const [step, setStep] = useState<Step>('token');
  const [stepDir, setStepDir] = useState(1);

  // Step 1: token
  const [accessToken, setAccessToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [saveToken, setSaveToken] = useState(true);

  // Step 2: project selection
  const [projects, setProjects] = useState<SupabaseProject[]>([]);
  const [selectedProjectRef, setSelectedProjectRef] = useState<string>('');

  // Step 3: key preview
  const [keys, setKeys] = useState<KeyEntry[]>([]);
  const [targetEnvSlug, setTargetEnvSlug] = useState(currentEnvSlug);

  // Step 4: success
  const [importedCount, setImportedCount] = useState(0);

  // Shared
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const goTo = (next: Step, dir: number) => {
    setStepDir(dir);
    setError(null);
    setStep(next);
  };

  // Step 1 → 2: fetch projects
  const handleConnect = async () => {
    if (!accessToken.trim()) {
      setError('Please enter your Supabase access token.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await api.supabase.listProjects(accessToken.trim());
      setProjects(result);
      goTo('select-project', 1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // Step 2 → 3: fetch keys for selected project
  const handleFetchKeys = async () => {
    if (!selectedProjectRef) {
      setError('Please select a Supabase project.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await api.supabase.getKeys(accessToken.trim(), selectedProjectRef);
      const entries: KeyEntry[] = Object.entries(result).map(([name, value]) => ({
        name,
        value,
        selected: true,
      }));
      setKeys(entries);
      goTo('preview-keys', 1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // Step 3 → 4: import selected keys
  const handleImport = async () => {
    const selected = keys.filter((k) => k.selected);
    if (selected.length === 0) {
      setError('Select at least one key to import.');
      return;
    }
    const targetEnv = environments.find((e) => e.slug === targetEnvSlug);
    if (!targetEnv) {
      setError('Target environment not found.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // Build dotenv content from selected keys
      const content = selected.map((k) => `${k.name}=${k.value}`).join('\n');

      // If saveToken is checked, include the access token as a secret too
      const finalContent = saveToken
        ? `SUPABASE_ACCESS_TOKEN=${accessToken.trim()}\n${content}`
        : content;

      await api.export.import(projectId, {
        env: targetEnvSlug,
        format: 'dotenv',
        content: finalContent,
        overwrite: false,
      });

      setImportedCount(selected.length + (saveToken ? 1 : 0));
      goTo('success', 1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const toggleKey = (index: number) => {
    setKeys((prev) =>
      prev.map((k, i) => (i === index ? { ...k, selected: !k.selected } : k))
    );
  };

  const selectedProject = projects.find((p) => p.id === selectedProjectRef);

  const stepTitle: Record<Step, string> = {
    token: 'Import from Supabase',
    'select-project': 'Select Project',
    'preview-keys': 'Preview Keys',
    success: 'Import Complete',
  };

  const stepSubtitle: Record<Step, string> = {
    token: 'Connect your Supabase account',
    'select-project': `${projects.length} project${projects.length !== 1 ? 's' : ''} found`,
    'preview-keys': selectedProject ? selectedProject.name : '',
    success: '',
  };

  return (
    <AnimatePresence>
      <>
        {/* Backdrop */}
        <motion.div
          key="supabase-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            zIndex: 50,
          }}
        />

        {/* Modal */}
        <motion.div
          key="supabase-modal"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 51,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            pointerEvents: 'none',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              pointerEvents: 'all',
              width: '100%',
              maxWidth: '520px',
              height: '75vh',
              maxHeight: '600px',
              backgroundColor: '#1a1a25',
              border: '1px solid #2a2a3a',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderBottom: '1px solid #2a2a3a',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(62,207,142,0.12)',
                    border: '1px solid rgba(62,207,142,0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Database size={16} color="#3ecf8e" />
                </div>
                <div>
                  <h2
                    style={{
                      fontSize: '16px',
                      fontWeight: 600,
                      color: '#e4e4ed',
                      margin: '0 0 2px',
                    }}
                  >
                    {stepTitle[step]}
                  </h2>
                  {stepSubtitle[step] && (
                    <p style={{ fontSize: '12px', color: '#6b6b80', margin: 0 }}>
                      {stepSubtitle[step]}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'transparent',
                  border: 'none',
                  color: '#6b6b80',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background-color 150ms ease, color 150ms ease',
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => {
                  const btn = e.currentTarget as HTMLButtonElement;
                  btn.style.backgroundColor = '#222230';
                  btn.style.color = '#e4e4ed';
                }}
                onMouseLeave={(e) => {
                  const btn = e.currentTarget as HTMLButtonElement;
                  btn.style.backgroundColor = 'transparent';
                  btn.style.color = '#6b6b80';
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Step progress dots */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '10px 20px 0',
                flexShrink: 0,
              }}
            >
              {(['token', 'select-project', 'preview-keys', 'success'] as Step[]).map((s) => {
                const stepOrder: Record<Step, number> = {
                  token: 0,
                  'select-project': 1,
                  'preview-keys': 2,
                  success: 3,
                };
                const current = stepOrder[step];
                const idx = stepOrder[s];
                const active = idx === current;
                const done = idx < current;
                return (
                  <div
                    key={s}
                    style={{
                      width: active ? '20px' : '6px',
                      height: '6px',
                      borderRadius: '9999px',
                      backgroundColor: done || active ? '#3ecf8e' : '#2a2a3a',
                      transition: 'all 200ms ease',
                    }}
                  />
                );
              })}
            </div>

            {/* Body — scrollable step content */}
            <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
              <AnimatePresence custom={stepDir} mode="wait">
                <motion.div
                  key={step}
                  custom={stepDir}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    overflowY: 'auto',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px',
                  }}
                >
                  {/* ─── Step 1: Token ─── */}
                  {step === 'token' && (
                    <>
                      <div>
                        <label style={labelStyle}>Supabase Access Token</label>
                        <div style={{ position: 'relative' }}>
                          <input
                            type={showToken ? 'text' : 'password'}
                            value={accessToken}
                            onChange={(e) => setAccessToken(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleConnect(); }}
                            placeholder="sbp_••••••••••••••••••••••••••••••••"
                            autoFocus
                            style={{
                              ...inputStyle,
                              paddingRight: '44px',
                              fontFamily: showToken ? 'var(--font-mono, monospace)' : undefined,
                              fontSize: showToken ? '13px' : '14px',
                            }}
                            onFocus={(e) => {
                              (e.currentTarget as HTMLInputElement).style.borderColor = '#3ecf8e';
                            }}
                            onBlur={(e) => {
                              (e.currentTarget as HTMLInputElement).style.borderColor = '#2a2a3a';
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setShowToken((v) => !v)}
                            style={{
                              position: 'absolute',
                              right: '10px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              background: 'transparent',
                              border: 'none',
                              color: '#6b6b80',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              padding: '4px',
                            }}
                          >
                            {showToken ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                        </div>
                      </div>

                      <p style={{ fontSize: '13px', color: '#6b6b80', margin: 0, lineHeight: 1.5 }}>
                        Get your token from{' '}
                        <span style={{ color: '#a1a1b5', fontWeight: 500 }}>
                          Supabase Dashboard → Account → Access Tokens
                        </span>
                      </p>

                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          color: '#a1a1b5',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={saveToken}
                          onChange={(e) => setSaveToken(e.target.checked)}
                          style={{
                            width: '16px',
                            height: '16px',
                            accentColor: '#3ecf8e',
                            cursor: 'pointer',
                            flexShrink: 0,
                          }}
                        />
                        Save token to vault as{' '}
                        <code
                          style={{
                            fontFamily: 'var(--font-mono, monospace)',
                            fontSize: '12px',
                            backgroundColor: '#12121a',
                            border: '1px solid #2a2a3a',
                            borderRadius: '4px',
                            padding: '1px 5px',
                            color: '#3ecf8e',
                          }}
                        >
                          SUPABASE_ACCESS_TOKEN
                        </code>
                      </label>

                      {error && (
                        <p style={{ fontSize: '12px', fontWeight: 600, color: '#ef4444', margin: 0 }}>
                          {error}
                        </p>
                      )}
                    </>
                  )}

                  {/* ─── Step 2: Select Project ─── */}
                  {step === 'select-project' && (
                    <>
                      {projects.length === 0 ? (
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '40px 24px',
                            gap: '12px',
                            textAlign: 'center',
                          }}
                        >
                          <Database size={36} color="#3b3b4f" />
                          <p style={{ fontSize: '14px', color: '#6b6b80', margin: 0 }}>
                            No Supabase projects found on this account.
                          </p>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {projects.map((proj) => {
                            const isSelected = proj.id === selectedProjectRef;
                            return (
                              <button
                                key={proj.id}
                                type="button"
                                onClick={() => setSelectedProjectRef(proj.id)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '12px',
                                  padding: '12px 14px',
                                  backgroundColor: isSelected ? 'rgba(62,207,142,0.08)' : '#12121a',
                                  border: isSelected
                                    ? '1px solid rgba(62,207,142,0.4)'
                                    : '1px solid #2a2a3a',
                                  borderRadius: '10px',
                                  cursor: 'pointer',
                                  textAlign: 'left',
                                  transition: 'all 150ms ease',
                                  width: '100%',
                                }}
                                onMouseEnter={(e) => {
                                  if (!isSelected) {
                                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#1e1e2e';
                                    (e.currentTarget as HTMLButtonElement).style.borderColor = '#3b3b4f';
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!isSelected) {
                                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#12121a';
                                    (e.currentTarget as HTMLButtonElement).style.borderColor = '#2a2a3a';
                                  }
                                }}
                              >
                                <div
                                  style={{
                                    width: '36px',
                                    height: '36px',
                                    borderRadius: '8px',
                                    backgroundColor: isSelected
                                      ? 'rgba(62,207,142,0.15)'
                                      : 'rgba(255,255,255,0.04)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                  }}
                                >
                                  <Database size={16} color={isSelected ? '#3ecf8e' : '#6b6b80'} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div
                                    style={{
                                      fontSize: '14px',
                                      fontWeight: 600,
                                      color: isSelected ? '#e4e4ed' : '#a1a1b5',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {proj.name}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: '12px',
                                      color: '#6b6b80',
                                      fontFamily: 'var(--font-mono, monospace)',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {proj.id} · {proj.region}
                                  </div>
                                </div>
                                {isSelected && (
                                  <div
                                    style={{
                                      width: '20px',
                                      height: '20px',
                                      borderRadius: '9999px',
                                      backgroundColor: '#3ecf8e',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      flexShrink: 0,
                                    }}
                                  >
                                    <CheckCircle size={12} color="#0a0a12" />
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {error && (
                        <p style={{ fontSize: '12px', fontWeight: 600, color: '#ef4444', margin: 0 }}>
                          {error}
                        </p>
                      )}
                    </>
                  )}

                  {/* ─── Step 3: Preview Keys ─── */}
                  {step === 'preview-keys' && (
                    <>
                      <div>
                        <label style={labelStyle}>Import into environment</label>
                        <select
                          value={targetEnvSlug}
                          onChange={(e) => setTargetEnvSlug(e.target.value)}
                          style={{
                            ...inputStyle,
                            appearance: 'none',
                            WebkitAppearance: 'none',
                            cursor: 'pointer',
                            paddingRight: '32px',
                            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b6b80' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                            backgroundRepeat: 'no-repeat',
                            backgroundPosition: 'right 10px center',
                          }}
                          onFocus={(e) => {
                            (e.currentTarget as HTMLSelectElement).style.borderColor = '#3ecf8e';
                          }}
                          onBlur={(e) => {
                            (e.currentTarget as HTMLSelectElement).style.borderColor = '#2a2a3a';
                          }}
                        >
                          {environments.map((env) => (
                            <option key={env.id} value={env.slug} style={{ backgroundColor: '#12121a' }}>
                              {env.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: '8px',
                          }}
                        >
                          <label style={{ ...labelStyle, marginBottom: 0 }}>
                            Keys to import
                          </label>
                          <span style={{ fontSize: '12px', color: '#6b6b80' }}>
                            {keys.filter((k) => k.selected).length} of {keys.length} selected
                          </span>
                        </div>

                        <div
                          style={{
                            backgroundColor: '#12121a',
                            border: '1px solid #2a2a3a',
                            borderRadius: '10px',
                            overflow: 'hidden',
                          }}
                        >
                          {keys.map((k, i) => (
                            <label
                              key={k.name}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                padding: '11px 14px',
                                borderBottom: i < keys.length - 1 ? '1px solid #2a2a3a' : 'none',
                                cursor: 'pointer',
                                transition: 'background-color 150ms ease',
                              }}
                              onMouseEnter={(e) => {
                                (e.currentTarget as HTMLLabelElement).style.backgroundColor = '#1a1a25';
                              }}
                              onMouseLeave={(e) => {
                                (e.currentTarget as HTMLLabelElement).style.backgroundColor = 'transparent';
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={k.selected}
                                onChange={() => toggleKey(i)}
                                style={{
                                  width: '15px',
                                  height: '15px',
                                  accentColor: '#3ecf8e',
                                  cursor: 'pointer',
                                  flexShrink: 0,
                                }}
                              />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div
                                  style={{
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    color: '#e4e4ed',
                                    fontFamily: 'var(--font-mono, monospace)',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {k.name}
                                </div>
                                <div
                                  style={{
                                    fontSize: '11px',
                                    color: '#6b6b80',
                                    fontFamily: 'var(--font-mono, monospace)',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    marginTop: '2px',
                                  }}
                                >
                                  {k.value.length > 48
                                    ? `${k.value.slice(0, 24)}…${k.value.slice(-12)}`
                                    : k.value}
                                </div>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>

                      {error && (
                        <p style={{ fontSize: '12px', fontWeight: 600, color: '#ef4444', margin: 0 }}>
                          {error}
                        </p>
                      )}
                    </>
                  )}

                  {/* ─── Step 4: Success ─── */}
                  {step === 'success' && (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flex: 1,
                        gap: '16px',
                        textAlign: 'center',
                        padding: '40px 24px',
                      }}
                    >
                      <div
                        style={{
                          width: '56px',
                          height: '56px',
                          borderRadius: '9999px',
                          backgroundColor: 'rgba(62,207,142,0.12)',
                          border: '1px solid rgba(62,207,142,0.3)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <CheckCircle size={28} color="#3ecf8e" />
                      </div>
                      <div>
                        <p
                          style={{
                            fontSize: '16px',
                            fontWeight: 600,
                            color: '#e4e4ed',
                            margin: '0 0 6px',
                          }}
                        >
                          Import complete
                        </p>
                        <p style={{ fontSize: '14px', color: '#6b6b80', margin: 0 }}>
                          Imported{' '}
                          <strong style={{ color: '#a1a1b5' }}>
                            {importedCount} secret{importedCount !== 1 ? 's' : ''}
                          </strong>{' '}
                          into{' '}
                          <strong style={{ color: '#a1a1b5' }}>
                            {environments.find((e) => e.slug === targetEnvSlug)?.name ?? targetEnvSlug}
                          </strong>
                        </p>
                      </div>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: step === 'token' ? 'flex-end' : 'space-between',
                gap: '8px',
                padding: '16px 20px',
                borderTop: '1px solid #2a2a3a',
                flexShrink: 0,
              }}
            >
              {/* Back button (steps 2 & 3) */}
              {(step === 'select-project' || step === 'preview-keys') && (
                <button
                  type="button"
                  onClick={() => goTo(step === 'preview-keys' ? 'select-project' : 'token', -1)}
                  style={btnSecondary}
                  onMouseEnter={(e) => {
                    const btn = e.currentTarget as HTMLButtonElement;
                    btn.style.backgroundColor = '#222230';
                    btn.style.color = '#e4e4ed';
                  }}
                  onMouseLeave={(e) => {
                    const btn = e.currentTarget as HTMLButtonElement;
                    btn.style.backgroundColor = 'transparent';
                    btn.style.color = '#a1a1b5';
                  }}
                >
                  Back
                </button>
              )}

              {/* Right side actions */}
              <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                {step !== 'success' && (
                  <button
                    type="button"
                    onClick={onClose}
                    style={btnSecondary}
                    onMouseEnter={(e) => {
                      const btn = e.currentTarget as HTMLButtonElement;
                      btn.style.backgroundColor = '#222230';
                      btn.style.color = '#e4e4ed';
                    }}
                    onMouseLeave={(e) => {
                      const btn = e.currentTarget as HTMLButtonElement;
                      btn.style.backgroundColor = 'transparent';
                      btn.style.color = '#a1a1b5';
                    }}
                  >
                    Cancel
                  </button>
                )}

                {step === 'token' && (
                  <button
                    type="button"
                    onClick={handleConnect}
                    disabled={loading}
                    style={btnPrimary(loading)}
                    onMouseEnter={(e) => {
                      if (!loading) {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#36c07e';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!loading) {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#3ecf8e';
                      }
                    }}
                  >
                    {loading ? (
                      <>
                        <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                        Connecting…
                      </>
                    ) : (
                      <>
                        Connect
                        <ChevronRight size={14} />
                      </>
                    )}
                  </button>
                )}

                {step === 'select-project' && (
                  <button
                    type="button"
                    onClick={handleFetchKeys}
                    disabled={loading || !selectedProjectRef}
                    style={btnPrimary(loading || !selectedProjectRef)}
                    onMouseEnter={(e) => {
                      if (!loading && selectedProjectRef) {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#36c07e';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!loading && selectedProjectRef) {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#3ecf8e';
                      }
                    }}
                  >
                    {loading ? (
                      <>
                        <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                        Loading…
                      </>
                    ) : (
                      <>
                        Next
                        <ChevronRight size={14} />
                      </>
                    )}
                  </button>
                )}

                {step === 'preview-keys' && (
                  <button
                    type="button"
                    onClick={handleImport}
                    disabled={loading || keys.filter((k) => k.selected).length === 0}
                    style={btnPrimary(loading || keys.filter((k) => k.selected).length === 0)}
                    onMouseEnter={(e) => {
                      if (!loading && keys.filter((k) => k.selected).length > 0) {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#36c07e';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!loading && keys.filter((k) => k.selected).length > 0) {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#3ecf8e';
                      }
                    }}
                  >
                    {loading ? (
                      <>
                        <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                        Importing…
                      </>
                    ) : (
                      `Import ${keys.filter((k) => k.selected).length} Secret${keys.filter((k) => k.selected).length !== 1 ? 's' : ''}`
                    )}
                  </button>
                )}

                {step === 'success' && (
                  <button
                    type="button"
                    onClick={onClose}
                    style={btnPrimary(false)}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#36c07e';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#3ecf8e';
                    }}
                  >
                    Done
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </>
    </AnimatePresence>
  );
}
