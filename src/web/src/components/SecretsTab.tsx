import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Upload, Download, KeyRound, Database, RefreshCw, Unlink } from 'lucide-react';
import { useAppStore } from '../stores/app';
import { api, type SupabaseStatus } from '../api/client';
import { SecretRow } from './SecretRow';
import { AddSecretModal } from './AddSecretModal';
import { ImportModal } from './ImportModal';
import { Button, Input, Skeleton, EmptyState, cn } from './ui';

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-border-default">
      <div className="flex-1 flex flex-col gap-1.5">
        <Skeleton className="h-3.5 w-40 rounded-sm" />
        <Skeleton className="h-3 w-24 rounded-sm" />
      </div>
      <Skeleton className="h-6 w-16 rounded-md" />
      <Skeleton className="h-5 w-28 rounded-sm" />
      <div className="flex gap-1">
        <Skeleton className="w-8 h-8 rounded-lg" />
        <Skeleton className="w-8 h-8 rounded-lg" />
        <Skeleton className="w-8 h-8 rounded-lg" />
      </div>
    </div>
  );
}

export function SecretsTab() {
  const {
    currentProject,
    currentEnvId,
    secrets,
    loading,
    selectEnvironment,
    setAddSecretOpen,
    setImportOpen,
    addSecretOpen,
    importOpen,
    fetchSecrets,
  } = useAppStore();

  // Supabase connection state
  const [sbStatus, setSbStatus] = useState<SupabaseStatus | null>(null);
  const [sbToken, setSbToken] = useState('');
  const [sbProjects, setSbProjects] = useState<any[]>([]);
  const [sbSelectedRef, setSbSelectedRef] = useState('');
  const [sbStep, setSbStep] = useState<'idle' | 'token' | 'pick'>('idle');
  const [sbLoading, setSbLoading] = useState(false);
  const [sbError, setSbError] = useState<string | null>(null);
  const [sbSyncResult, setSbSyncResult] = useState<string | null>(null);
  const [sbSyncing, setSbSyncing] = useState(false);

  useEffect(() => {
    if (currentProject) {
      api.supabase.status(currentProject.id).then(setSbStatus).catch(() => {});
    }
  }, [currentProject?.id]);

  const handleSbFetchProjects = async () => {
    if (!sbToken.trim()) return;
    setSbLoading(true);
    setSbError(null);
    try {
      const projects = await api.supabase.listProjects(sbToken.trim());
      setSbProjects(projects);
      setSbStep('pick');
    } catch (err: unknown) {
      setSbError(err instanceof Error ? err.message : 'Invalid token');
    } finally {
      setSbLoading(false);
    }
  };

  const handleSbConnect = async () => {
    if (!currentProject || !sbSelectedRef) return;
    setSbLoading(true);
    setSbError(null);
    try {
      const result = await api.supabase.connect(currentProject.id, sbToken.trim(), sbSelectedRef);
      setSbStatus({
        connected: true,
        projectRef: sbSelectedRef,
        projectName: result.supabaseProject.name,
        region: result.supabaseProject.region,
        lastSync: new Date().toISOString(),
      });
      setSbSyncResult(`Imported ${result.sync.updated} secrets`);
      setSbStep('idle');
      setSbToken('');
      fetchSecrets();
    } catch (err: unknown) {
      setSbError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setSbLoading(false);
    }
  };

  const handleSbSync = async () => {
    if (!currentProject) return;
    setSbSyncing(true);
    setSbError(null);
    setSbSyncResult(null);
    try {
      const result = await api.supabase.sync(currentProject.id);
      setSbSyncResult(`Updated ${result.updated}, ${result.unchanged} unchanged${result.conflicts.length ? `, ${result.conflicts.length} conflicts` : ''}`);
      setSbStatus((prev) => prev ? { ...prev, lastSync: new Date().toISOString() } : prev);
      fetchSecrets();
    } catch (err: unknown) {
      setSbError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSbSyncing(false);
    }
  };

  const handleSbDisconnect = async () => {
    if (!currentProject) return;
    setSbError(null);
    try {
      await api.supabase.disconnect(currentProject.id);
      setSbStatus({ connected: false, projectRef: '', projectName: '', region: '', lastSync: null });
      setSbStep('idle');
      fetchSecrets();
    } catch (err: unknown) {
      setSbError(err instanceof Error ? err.message : 'Disconnect failed');
    }
  };

  const environments = currentProject?.environments ?? [];
  const activeEnv = environments.find((e) => e.id === currentEnvId);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="flex flex-col gap-4"
      >
        {/* Toolbar: env selector + secret count + actions */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Environment pills + count */}
          <div className="flex items-center gap-2 flex-wrap">
            {environments.map((env) => {
              const isActive = env.id === currentEnvId;
              return (
                <button
                  key={env.id}
                  type="button"
                  onClick={() => selectEnvironment(env.id)}
                  className={cn(
                    'h-8 px-3.5 text-[13px] font-semibold rounded-lg border cursor-pointer whitespace-nowrap',
                    'transition-colors duration-150',
                    'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
                    isActive
                      ? 'text-accent bg-accent-muted border-accent/40'
                      : 'text-text-muted bg-transparent border-border-default hover:bg-surface-hover hover:text-text-primary',
                  )}
                >
                  {env.name}
                </button>
              );
            })}
            {!loading && (
              <span className="text-[12px] font-semibold text-text-muted whitespace-nowrap ml-1">
                {secrets.length} secret{secrets.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Export + Import + Add buttons */}
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="ghost"
              size="md"
              onClick={async () => {
                if (!currentProject || !activeEnv) return;
                try {
                  const content = await api.export.env(currentProject.id, activeEnv.slug, 'dotenv');
                  const blob = new Blob([content as string], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${currentProject.name}-${activeEnv.slug}.env`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                } catch (err) {
                  console.error('Export failed:', err);
                }
              }}
            >
              <Download size={14} />
              Export
            </Button>

            <Button
              variant="ghost"
              size="md"
              onClick={() => setImportOpen(true)}
            >
              <Upload size={14} />
              Import
            </Button>

            <Button
              variant="primary"
              size="md"
              onClick={() => setAddSecretOpen(true)}
            >
              <Plus size={14} />
              Add Secret
            </Button>
          </div>
        </div>

        {/* Secrets list */}
        <div className="bg-surface border border-border-default rounded-xl px-4 min-h-30">
          {loading ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : secrets.length === 0 ? (
            <EmptyState
              icon={KeyRound}
              title="No secrets yet"
              description={
                activeEnv
                  ? `Add your first secret to ${activeEnv.name}`
                  : 'Add your first secret to this environment'
              }
              actionLabel="Add your first secret"
              onAction={() => setAddSecretOpen(true)}
            />
          ) : (
            secrets.map((secret) => (
              <SecretRow key={secret.id} secret={secret} />
            ))
          )}
        </div>

        {/* Supabase connection */}
        <div className="border border-brand-supabase/20 rounded-xl p-4 bg-brand-supabase/3">
          <div className="flex items-center gap-2 mb-3">
            <Database size={14} className="text-brand-supabase" />
            <span className="text-[12px] font-semibold text-brand-supabase tracking-[0.05em] uppercase">
              Supabase
            </span>
          </div>

          {sbStatus?.connected ? (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[14px] font-semibold text-text-primary min-w-0 truncate">
                  {sbStatus.projectName || 'Connected'}
                </span>
                {sbStatus.region && (
                  <span className="text-[10px] font-semibold text-brand-supabase bg-brand-supabase/10 border border-brand-supabase/25 rounded-md px-1.5 py-0.5 whitespace-nowrap">
                    {sbStatus.region}
                  </span>
                )}
              </div>
              <p className="text-[12px] text-text-muted m-0">
                {sbStatus.lastSync
                  ? `Last synced ${new Date(sbStatus.lastSync + (sbStatus.lastSync.endsWith('Z') ? '' : 'Z')).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true, month: 'short', day: 'numeric' })}`
                  : 'Never synced'}
              </p>
              {sbSyncResult && <p className="text-[12px] text-text-secondary m-0">{sbSyncResult}</p>}
              {sbError && <p className="text-[12px] text-danger m-0">{sbError}</p>}
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  disabled={sbSyncing}
                  onClick={handleSbSync}
                  className={cn(
                    'h-8 px-3 text-[12px] font-semibold text-brand-supabase bg-transparent',
                    'border border-brand-supabase/30 rounded-lg cursor-pointer',
                    'flex items-center gap-1.5 whitespace-nowrap transition-colors duration-150',
                    'hover:bg-brand-supabase/8',
                    'disabled:opacity-60 disabled:pointer-events-none',
                    'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
                  )}
                >
                  <RefreshCw size={12} className={sbSyncing ? 'spin' : undefined} />
                  {sbSyncing ? 'Syncing…' : 'Sync Now'}
                </button>
                <button
                  type="button"
                  onClick={handleSbDisconnect}
                  className={cn(
                    'h-8 px-3 text-[12px] font-semibold text-text-muted bg-transparent',
                    'border border-border-default rounded-lg cursor-pointer',
                    'flex items-center gap-1.5 whitespace-nowrap transition-colors duration-150',
                    'hover:bg-danger/8 hover:text-danger',
                    'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
                  )}
                >
                  <Unlink size={12} />
                  Disconnect
                </button>
              </div>
            </div>
          ) : sbStep === 'idle' ? (
            <div>
              <p className="text-[13px] text-text-secondary m-0 mb-3 leading-relaxed">
                Connect to auto-sync API keys, database credentials, and Edge Function secrets.
              </p>
              <button
                type="button"
                onClick={() => setSbStep('token')}
                className={cn(
                  'h-8 px-3 text-[12px] font-semibold text-brand-supabase bg-transparent',
                  'border border-brand-supabase/30 rounded-lg cursor-pointer',
                  'flex items-center gap-1.5 transition-colors duration-150',
                  'hover:bg-brand-supabase/8',
                  'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
                )}
              >
                <Database size={12} />
                Connect to Supabase
              </button>
            </div>
          ) : sbStep === 'token' ? (
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-[12px] font-semibold text-text-secondary tracking-[0.05em] uppercase mb-1.5">
                  Access Token
                </label>
                <Input
                  type="password"
                  revealable
                  value={sbToken}
                  onChange={(e) => setSbToken(e.target.value)}
                  placeholder="sbp_1a2b3c4d5e…"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter' && sbToken.trim()) handleSbFetchProjects(); }}
                />
                <p className="text-[11px] text-text-muted mt-1.5 mb-0">
                  Dashboard → Account (top right avatar) → Access Tokens → Generate New Token
                </p>
              </div>
              {sbError && <p className="text-[12px] text-danger m-0">{sbError}</p>}
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { setSbStep('idle'); setSbError(null); setSbToken(''); }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={sbLoading || !sbToken.trim()}
                  loading={sbLoading}
                  onClick={handleSbFetchProjects}
                  className="bg-brand-supabase hover:bg-brand-supabase/90 border-transparent"
                >
                  {sbLoading ? 'Connecting…' : 'Connect'}
                </Button>
              </div>
            </div>
          ) : sbStep === 'pick' ? (
            <div className="flex flex-col gap-3">
              <label className="block text-[12px] font-semibold text-text-secondary tracking-[0.05em] uppercase">
                Select Supabase Project
              </label>
              <div className="flex flex-col gap-1.5 max-h-50 overflow-y-auto">
                {sbProjects.map((sp) => (
                  <button
                    key={sp.id}
                    type="button"
                    onClick={() => setSbSelectedRef(sp.id)}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer text-left w-full',
                      'transition-colors duration-150',
                      'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
                      sbSelectedRef === sp.id
                        ? 'bg-brand-supabase/8 border border-brand-supabase/40'
                        : 'bg-abyss border border-border-default hover:bg-surface-hover',
                    )}
                  >
                    <Database
                      size={14}
                      className={sbSelectedRef === sp.id ? 'text-brand-supabase' : 'text-text-muted'}
                    />
                    <div className="flex-1 min-w-0">
                      <div className={cn(
                        'text-[13px] font-semibold truncate',
                        sbSelectedRef === sp.id ? 'text-text-primary' : 'text-text-secondary',
                      )}>
                        {sp.name}
                      </div>
                      <div className="text-[11px] text-text-muted font-mono truncate">
                        {sp.id} · {sp.region}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              {sbError && <p className="text-[12px] text-danger m-0">{sbError}</p>}
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { setSbStep('token'); setSbError(null); }}
                >
                  Back
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={sbLoading || !sbSelectedRef}
                  loading={sbLoading}
                  onClick={handleSbConnect}
                  className="bg-brand-supabase hover:bg-brand-supabase/90 border-transparent"
                >
                  {sbLoading ? 'Connecting…' : 'Connect & Sync'}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </motion.div>

      {/* Modals rendered at tab level so they're accessible */}
      {addSecretOpen && <AddSecretModal />}
      {importOpen && <ImportModal />}
    </>
  );
}
