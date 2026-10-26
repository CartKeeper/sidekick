import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Upload, Download, KeyRound, Database, RefreshCw, Unlink, Check, Server, HelpCircle } from 'lucide-react';
import { useAppStore } from '../stores/app';
import { api, type SupabaseStatus, type CoolifyStatus, type CoolifyResource } from '../api/client';
import { SecretRow } from './SecretRow';
import { AddSecretModal } from './AddSecretModal';
import { ImportModal } from './ImportModal';
import { Button, Input, Select, Skeleton, EmptyState, cn } from './ui';

// Env-var prefix conventions the connect flow can emit for public Supabase creds.
const ENV_STYLE_OPTIONS = [
  { id: 'vite', label: 'Vite', hint: 'VITE_' },
  { id: 'next', label: 'Next.js', hint: 'NEXT_PUBLIC_' },
  { id: 'plain', label: 'Plain', hint: 'SUPABASE_' },
];

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border-default bg-abyss px-3 py-2.5">
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
  const [sbOrgs, setSbOrgs] = useState<any[]>([]);
  const [sbSelectedOrg, setSbSelectedOrg] = useState('');
  const [sbProjects, setSbProjects] = useState<any[]>([]);
  const [sbSelectedRef, setSbSelectedRef] = useState('');
  const [sbEnvStyles, setSbEnvStyles] = useState<string[]>(['plain']);
  const [sbStep, setSbStep] = useState<'idle' | 'token' | 'pick'>('idle');
  const [sbLoading, setSbLoading] = useState(false);
  const [sbError, setSbError] = useState<string | null>(null);
  const [sbSyncResult, setSbSyncResult] = useState<string | null>(null);
  const [sbSyncing, setSbSyncing] = useState(false);

  // Coolify connection state
  const [cfStatus, setCfStatus] = useState<CoolifyStatus | null>(null);
  const [cfStep, setCfStep] = useState<'idle' | 'creds' | 'pick'>('idle');
  const [cfInstanceUrl, setCfInstanceUrl] = useState('');
  const [cfToken, setCfToken] = useState('');
  const [cfAccessId, setCfAccessId] = useState('');
  const [cfAccessSecret, setCfAccessSecret] = useState('');
  const [cfShowAccess, setCfShowAccess] = useState(false);
  const [cfResources, setCfResources] = useState<CoolifyResource[]>([]);
  const [cfSelectedUuid, setCfSelectedUuid] = useState('');
  const [cfPreferredUuid, setCfPreferredUuid] = useState('');
  const [cfTargetEnv, setCfTargetEnv] = useState('prod');
  const [cfSyncMode, setCfSyncMode] = useState<'merge' | 'overwrite'>('merge');
  const [cfLoading, setCfLoading] = useState(false);
  const [cfError, setCfError] = useState<string | null>(null);
  const [cfSyncResult, setCfSyncResult] = useState<string | null>(null);
  const [cfSyncing, setCfSyncing] = useState(false);
  const [cfHelpOpen, setCfHelpOpen] = useState(false);

  useEffect(() => {
    if (currentProject) {
      api.supabase.status(currentProject.id).then(setSbStatus).catch(() => {});
      api.coolify.status(currentProject.id).then(setCfStatus).catch(() => {});
      // Default the target-env picker to the project's default environment.
      setCfTargetEnv(currentProject.default_environment || 'prod');
    }
  }, [currentProject?.id]);

  const handleSbFetchProjects = async () => {
    if (!sbToken.trim()) return;
    setSbLoading(true);
    setSbError(null);
    try {
      const [orgs, projects] = await Promise.all([
        api.supabase.listOrganizations(sbToken.trim()),
        api.supabase.listProjects(sbToken.trim()),
      ]);
      setSbOrgs(orgs);
      setSbProjects(projects);
      // Auto-select the org only when there's exactly one — otherwise force a
      // deliberate choice so a same-named project from the wrong org can't slip in.
      setSbSelectedOrg(orgs.length === 1 ? orgs[0].id : '');
      setSbSelectedRef('');
      // Pre-select env-var styles by sniffing the project folder (best-effort).
      if (currentProject) {
        api.supabase
          .detectEnvStyles(currentProject.id)
          .then((r) => { if (r.styles?.length) setSbEnvStyles(r.styles); })
          .catch(() => {});
      }
      setSbStep('pick');
    } catch (err: unknown) {
      setSbError(err instanceof Error ? err.message : 'Invalid token');
    } finally {
      setSbLoading(false);
    }
  };

  const resetSbFlow = () => {
    setSbStep('idle');
    setSbError(null);
    setSbToken('');
    setSbOrgs([]);
    setSbSelectedOrg('');
    setSbProjects([]);
    setSbSelectedRef('');
    setSbEnvStyles(['plain']);
  };

  const handleSbConnect = async () => {
    if (!currentProject || !sbSelectedRef) return;
    setSbLoading(true);
    setSbError(null);
    try {
      const result = await api.supabase.connect(currentProject.id, sbToken.trim(), sbSelectedRef, sbEnvStyles);
      setSbStatus({
        connected: true,
        projectRef: sbSelectedRef,
        projectName: result.supabaseProject.name,
        region: result.supabaseProject.region,
        lastSync: new Date().toISOString(),
      });
      setSbSyncResult(`Imported ${result.sync.updated} secrets`);
      resetSbFlow();
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

  const cfCreds = () => ({
    instanceUrl: cfInstanceUrl.trim(),
    token: cfToken.trim(),
    cfAccessId: cfAccessId.trim() || undefined,
    cfAccessSecret: cfAccessSecret.trim() || undefined,
  });

  const resetCfFlow = () => {
    setCfStep('idle');
    setCfError(null);
    setCfToken('');
    setCfAccessId('');
    setCfAccessSecret('');
    setCfShowAccess(false);
    setCfResources([]);
    setCfSelectedUuid('');
    setCfPreferredUuid('');
    setCfSyncMode('merge');
  };

  // Open the connect form pre-filled from the project's own OVH_COOLIFY_* secrets.
  const handleCfStart = async () => {
    setCfStep('creds');
    if (!currentProject) return;
    try {
      const d = await api.coolify.defaults(currentProject.id);
      if (!d.token) return;
      setCfInstanceUrl((prev) => prev || d.instanceUrl);
      setCfToken((prev) => prev || d.token);
      setCfPreferredUuid(d.resourceUuid);
      setCfTargetEnv(d.environment);
    } catch {
      // No defaults — the form stays blank for manual entry.
    }
  };

  const handleCfFetchResources = async () => {
    if (!cfInstanceUrl.trim() || !cfToken.trim()) return;
    setCfLoading(true);
    setCfError(null);
    try {
      const resources = await api.coolify.resources(cfCreds());
      setCfResources(resources);
      setCfSelectedUuid(resources.some((r) => r.uuid === cfPreferredUuid) ? cfPreferredUuid : '');
      setCfStep('pick');
    } catch (err: unknown) {
      setCfError(err instanceof Error ? err.message : 'Could not reach Coolify');
    } finally {
      setCfLoading(false);
    }
  };

  const handleCfConnect = async () => {
    if (!currentProject || !cfSelectedUuid) return;
    const picked = cfResources.find((r) => r.uuid === cfSelectedUuid);
    if (!picked) return;
    setCfLoading(true);
    setCfError(null);
    try {
      const result = await api.coolify.connect(currentProject.id, {
        ...cfCreds(),
        resourceType: picked.type,
        resourceUuid: picked.uuid,
        resourceName: picked.name,
        targetEnvironment: cfTargetEnv,
        syncMode: cfSyncMode,
      });
      setCfStatus({
        connected: true,
        instanceUrl: cfInstanceUrl.trim(),
        resourceType: picked.type,
        resourceName: picked.name,
        targetEnvironment: cfTargetEnv,
        syncMode: cfSyncMode,
        lastSync: new Date().toISOString(),
      });
      setCfSyncResult(`Imported ${result.sync.updated} secrets`);
      resetCfFlow();
      fetchSecrets();
    } catch (err: unknown) {
      setCfError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setCfLoading(false);
    }
  };

  const handleCfSync = async () => {
    if (!currentProject) return;
    setCfSyncing(true);
    setCfError(null);
    setCfSyncResult(null);
    try {
      const result = await api.coolify.sync(currentProject.id);
      setCfSyncResult(
        `Updated ${result.updated}, ${result.unchanged} unchanged` +
          (result.conflicts.length ? `, ${result.conflicts.length} conflicts` : '') +
          (result.errors.length ? ` — ${result.errors[0]}` : '')
      );
      setCfStatus((prev) => (prev ? { ...prev, lastSync: new Date().toISOString() } : prev));
      fetchSecrets();
    } catch (err: unknown) {
      setCfError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setCfSyncing(false);
    }
  };

  const handleCfDisconnect = async () => {
    if (!currentProject) return;
    setCfError(null);
    try {
      await api.coolify.disconnect(currentProject.id);
      setCfStatus({ connected: false, instanceUrl: '', resourceType: '', resourceName: '', targetEnvironment: '', syncMode: '', lastSync: null });
      setCfStep('idle');
      fetchSecrets();
    } catch (err: unknown) {
      setCfError(err instanceof Error ? err.message : 'Disconnect failed');
    }
  };

  const environments = currentProject?.environments ?? [];
  const activeEnv = environments.find((e) => e.id === currentEnvId);

  // Supabase connect drill-down: only show projects belonging to the chosen org.
  const sbVisibleProjects = sbSelectedOrg
    ? sbProjects.filter((sp) => sp.organization_id === sbSelectedOrg)
    : [];
  const sbSelectedProject = sbProjects.find((sp) => sp.id === sbSelectedRef);
  const sbSelectedOrgName = sbOrgs.find((o) => o.id === sbSelectedOrg)?.name;

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
        <div className="bg-surface border border-border-default rounded-xl px-4 py-4 min-h-30">
          {loading ? (
            <div className="flex flex-col gap-2">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
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
            <div className="flex flex-col gap-2">
              {secrets.map((secret) => (
                <SecretRow key={secret.id} secret={secret} />
              ))}
            </div>
          )}
        </div>

        {/* Integrations — compact connectors that sit at the bottom */}
        <div className="flex flex-col gap-2">
          <label className="block text-[11px] font-semibold text-text-muted uppercase tracking-[0.08em]">
            Integrations
          </label>
          <div className="max-w-sm border border-brand-supabase/20 rounded-xl p-4 bg-brand-supabase/3">
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
              <p className="text-[12px] text-text-muted m-0 mb-3 leading-relaxed">
                Auto-sync API keys & database credentials.
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
                  onClick={resetSbFlow}
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
              {/* Step 1: organization */}
              <div>
                <label className="block text-[12px] font-semibold text-text-secondary tracking-[0.05em] uppercase mb-1.5">
                  Organization
                </label>
                <Select
                  value={sbSelectedOrg}
                  onChange={(e) => { setSbSelectedOrg(e.target.value); setSbSelectedRef(''); }}
                >
                  <option value="">Choose an organization…</option>
                  {sbOrgs.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </Select>
              </div>

              {/* Step 2: project (only the chosen org's projects) */}
              {sbSelectedOrg && (
                <div>
                  <label className="block text-[12px] font-semibold text-text-secondary tracking-[0.05em] uppercase mb-1.5">
                    Project
                  </label>
                  {sbVisibleProjects.length === 0 ? (
                    <p className="text-[12px] text-text-muted m-0">No projects in this organization.</p>
                  ) : (
                    <div className="flex flex-col gap-1.5 max-h-50 overflow-y-auto">
                      {sbVisibleProjects.map((sp) => (
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
                  )}
                </div>
              )}

              {/* Env var format — auto-detected from the project folder, adjustable */}
              {sbSelectedRef && (
                <div>
                  <label className="block text-[12px] font-semibold text-text-secondary tracking-[0.05em] uppercase mb-1.5">
                    Env var format
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {ENV_STYLE_OPTIONS.map((opt) => {
                      const on = sbEnvStyles.includes(opt.id);
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            setSbEnvStyles((prev) =>
                              on ? prev.filter((s) => s !== opt.id) : [...prev, opt.id],
                            )
                          }
                          className={cn(
                            'flex items-center gap-1.5 h-8 px-2.5 rounded-lg border text-[12px] font-semibold cursor-pointer transition-colors duration-150',
                            'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
                            on
                              ? 'border-brand-supabase/50 bg-brand-supabase/10 text-brand-supabase'
                              : 'border-border-default bg-abyss text-text-muted hover:bg-surface-hover hover:text-text-secondary',
                          )}
                        >
                          {on && <Check size={12} />}
                          {opt.label}
                          <span className="font-mono text-[10px] opacity-70">{opt.hint}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-text-muted mt-1.5 mb-0">
                    Auto-detected from your project. Public keys get these prefixes; server secrets stay unprefixed.
                  </p>
                </div>
              )}

              {/* Confirmation — eyeball exactly what gets linked before it writes */}
              {sbSelectedProject && (
                <div className="rounded-lg border border-brand-supabase/25 bg-brand-supabase/5 px-3 py-2.5">
                  <p className="text-[12px] text-text-secondary m-0 leading-relaxed">
                    Connect <span className="font-semibold text-text-primary">{currentProject?.name}</span>
                    {' → '}
                    <span className="font-semibold text-text-primary">{sbSelectedOrgName}</span>
                    {' / '}
                    <span className="font-semibold text-text-primary">{sbSelectedProject.name}</span>
                  </p>
                  <p className="text-[11px] text-text-muted font-mono m-0 mt-0.5">{sbSelectedProject.id}</p>
                </div>
              )}

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
                  disabled={sbLoading || !sbSelectedRef || sbEnvStyles.length === 0}
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

          {/* Coolify connector — self-hosted stacks */}
          <div className="max-w-sm border border-brand-coolify/20 rounded-xl p-4 bg-brand-coolify/3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Server size={14} className="text-brand-coolify" />
                <span className="text-[12px] font-semibold text-brand-coolify tracking-[0.05em] uppercase">
                  Coolify
                </span>
              </div>
              <button
                type="button"
                aria-label="Coolify sync help"
                onClick={() => setCfHelpOpen((v) => !v)}
                className="text-text-muted hover:text-text-secondary transition-colors focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 rounded-sm"
              >
                <HelpCircle size={14} strokeWidth={1.5} />
              </button>
            </div>

            {cfHelpOpen && (
              <p className="text-[11px] text-text-muted leading-relaxed m-0 mb-3">
                Pull env vars from a self-hosted Coolify service or application into this
                project. Create a read API token in Coolify → Keys &amp; Tokens → API
                tokens. If your instance is behind Cloudflare Access, add a service-token
                Client Id / Secret, or an Access bypass for <span className="font-mono">/api/*</span>.
                Values sync into the chosen environment; merge never deletes your own secrets.
              </p>
            )}

            {cfStatus?.connected ? (
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[14px] font-semibold text-text-primary min-w-0 truncate">
                    {cfStatus.resourceName || 'Connected'}
                  </span>
                  <span className="text-[10px] font-semibold text-brand-coolify bg-brand-coolify/10 border border-brand-coolify/25 rounded-md px-1.5 py-0.5 whitespace-nowrap">
                    {cfStatus.resourceType}
                  </span>
                  <span className="text-[10px] font-semibold text-text-muted bg-surface border border-border-default rounded-md px-1.5 py-0.5 whitespace-nowrap">
                    → {cfStatus.targetEnvironment} · {cfStatus.syncMode}
                  </span>
                </div>
                <p className="text-[12px] text-text-muted m-0">
                  {cfStatus.lastSync
                    ? `Last synced ${new Date(cfStatus.lastSync + (cfStatus.lastSync.endsWith('Z') ? '' : 'Z')).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true, month: 'short', day: 'numeric' })}`
                    : 'Never synced'}
                </p>
                {cfSyncResult && <p className="text-[12px] text-text-secondary m-0">{cfSyncResult}</p>}
                {cfError && <p className="text-[12px] text-danger m-0">{cfError}</p>}
                <div className="flex gap-2 flex-wrap">
                  <button
                    type="button"
                    disabled={cfSyncing}
                    onClick={handleCfSync}
                    className={cn(
                      'h-8 px-3 text-[12px] font-semibold text-brand-coolify bg-transparent',
                      'border border-brand-coolify/30 rounded-lg cursor-pointer',
                      'flex items-center gap-1.5 whitespace-nowrap transition-colors duration-150',
                      'hover:bg-brand-coolify/8 disabled:opacity-60 disabled:pointer-events-none',
                      'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
                    )}
                  >
                    <RefreshCw size={12} className={cfSyncing ? 'spin' : undefined} />
                    {cfSyncing ? 'Syncing…' : 'Sync Now'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCfDisconnect}
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
            ) : cfStep === 'idle' ? (
              <div>
                <p className="text-[12px] text-text-muted m-0 mb-3 leading-relaxed">
                  Sync env vars from a self-hosted Coolify stack.
                </p>
                <button
                  type="button"
                  onClick={handleCfStart}
                  className={cn(
                    'h-8 px-3 text-[12px] font-semibold text-brand-coolify bg-transparent',
                    'border border-brand-coolify/30 rounded-lg cursor-pointer',
                    'flex items-center gap-1.5 transition-colors duration-150 hover:bg-brand-coolify/8',
                    'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
                  )}
                >
                  <Server size={12} />
                  Connect to Coolify
                </button>
              </div>
            ) : cfStep === 'creds' ? (
              <div className="flex flex-col gap-3">
                <div>
                  <label className="block text-[12px] font-semibold text-text-secondary tracking-[0.05em] uppercase mb-1.5">
                    Instance URL
                  </label>
                  <Input
                    type="text"
                    value={cfInstanceUrl}
                    onChange={(e) => setCfInstanceUrl(e.target.value)}
                    placeholder="https://coolify.example.com"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-text-secondary tracking-[0.05em] uppercase mb-1.5">
                    API Token
                  </label>
                  <Input
                    type="password"
                    revealable
                    value={cfToken}
                    onChange={(e) => setCfToken(e.target.value)}
                    placeholder="Coolify API token"
                    onKeyDown={(e) => { if (e.key === 'Enter' && cfInstanceUrl.trim() && cfToken.trim()) handleCfFetchResources(); }}
                  />
                  <p className="text-[11px] text-text-muted mt-1.5 mb-0">
                    Coolify → Keys &amp; Tokens → API tokens (read scope is enough).
                  </p>
                </div>

                {!cfShowAccess ? (
                  <button
                    type="button"
                    onClick={() => setCfShowAccess(true)}
                    className="text-[11px] font-semibold text-brand-coolify hover:underline self-start bg-transparent border-0 cursor-pointer p-0"
                  >
                    + Add Cloudflare Access service token
                  </button>
                ) : (
                  <div className="flex flex-col gap-2 rounded-lg border border-border-default bg-abyss p-3">
                    <label className="block text-[11px] font-semibold text-text-muted tracking-[0.05em] uppercase">
                      Cloudflare Access (optional)
                    </label>
                    <Input type="text" value={cfAccessId} onChange={(e) => setCfAccessId(e.target.value)} placeholder="CF-Access-Client-Id" />
                    <Input type="password" revealable value={cfAccessSecret} onChange={(e) => setCfAccessSecret(e.target.value)} placeholder="CF-Access-Client-Secret" />
                  </div>
                )}

                {cfError && <p className="text-[12px] text-danger m-0">{cfError}</p>}
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={resetCfFlow}>Cancel</Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={cfLoading || !cfInstanceUrl.trim() || !cfToken.trim()}
                    loading={cfLoading}
                    onClick={handleCfFetchResources}
                    className="bg-brand-coolify hover:bg-brand-coolify/90 border-transparent"
                  >
                    {cfLoading ? 'Connecting…' : 'Connect'}
                  </Button>
                </div>
              </div>
            ) : cfStep === 'pick' ? (
              <div className="flex flex-col gap-3">
                <div>
                  <label className="block text-[12px] font-semibold text-text-secondary tracking-[0.05em] uppercase mb-1.5">
                    Resource
                  </label>
                  {cfResources.length === 0 ? (
                    <p className="text-[12px] text-text-muted m-0">No services or applications found.</p>
                  ) : (
                    <div className="flex flex-col gap-1.5 max-h-50 overflow-y-auto">
                      {cfResources.map((r) => (
                        <button
                          key={r.uuid}
                          type="button"
                          onClick={() => setCfSelectedUuid(r.uuid)}
                          className={cn(
                            'flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer text-left w-full transition-colors duration-150',
                            'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
                            cfSelectedUuid === r.uuid
                              ? 'bg-brand-coolify/8 border border-brand-coolify/40'
                              : 'bg-abyss border border-border-default hover:bg-surface-hover',
                          )}
                        >
                          <Server size={14} className={cfSelectedUuid === r.uuid ? 'text-brand-coolify' : 'text-text-muted'} />
                          <div className="flex-1 min-w-0">
                            <div className={cn('text-[13px] font-semibold truncate', cfSelectedUuid === r.uuid ? 'text-text-primary' : 'text-text-secondary')}>
                              {r.name}
                            </div>
                            <div className="text-[11px] text-text-muted font-mono truncate">{r.type} · {r.uuid}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {cfSelectedUuid && (
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-[12px] font-semibold text-text-secondary tracking-[0.05em] uppercase mb-1.5">
                        Target env
                      </label>
                      <Select value={cfTargetEnv} onChange={(e) => setCfTargetEnv(e.target.value)}>
                        {(currentProject?.environments ?? []).map((env) => (
                          <option key={env.id} value={env.slug}>{env.name}</option>
                        ))}
                      </Select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-[12px] font-semibold text-text-secondary tracking-[0.05em] uppercase mb-1.5">
                        Sync mode
                      </label>
                      <Select value={cfSyncMode} onChange={(e) => setCfSyncMode(e.target.value as 'merge' | 'overwrite')}>
                        <option value="merge">Merge</option>
                        <option value="overwrite">Overwrite</option>
                      </Select>
                    </div>
                  </div>
                )}

                {cfError && <p className="text-[12px] text-danger m-0">{cfError}</p>}
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => { setCfStep('creds'); setCfError(null); }}>Back</Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={cfLoading || !cfSelectedUuid}
                    loading={cfLoading}
                    onClick={handleCfConnect}
                    className="bg-brand-coolify hover:bg-brand-coolify/90 border-transparent"
                  >
                    {cfLoading ? 'Connecting…' : 'Connect & Sync'}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </motion.div>

      {/* Modals rendered at tab level so they're accessible */}
      {addSecretOpen && <AddSecretModal />}
      {importOpen && <ImportModal />}
    </>
  );
}
