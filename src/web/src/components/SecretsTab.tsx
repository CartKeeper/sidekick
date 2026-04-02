import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Upload, Download, KeyRound, Database, RefreshCw, Unlink, Loader2, X as XIcon } from 'lucide-react';
import { useAppStore } from '../stores/app';
import { api, type SupabaseStatus } from '../api/client';
import { SecretRow } from './SecretRow';
import { AddSecretModal } from './AddSecretModal';
import { ImportModal } from './ImportModal';

function SkeletonRow() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 0',
        borderBottom: '1px solid #2a2a3a',
      }}
    >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div
          style={{
            height: '14px',
            width: '160px',
            borderRadius: '4px',
            backgroundColor: '#222230',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
        <div
          style={{
            height: '12px',
            width: '100px',
            borderRadius: '4px',
            backgroundColor: '#1e1e2e',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
      </div>
      <div
        style={{
          height: '24px',
          width: '64px',
          borderRadius: '6px',
          backgroundColor: '#222230',
          animation: 'pulse 1.5s ease-in-out infinite',
        }}
      />
      <div
        style={{
          height: '20px',
          width: '120px',
          borderRadius: '4px',
          backgroundColor: '#1e1e2e',
          animation: 'pulse 1.5s ease-in-out infinite',
        }}
      />
      <div style={{ display: 'flex', gap: '4px' }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: '#1e1e2e',
              animation: 'pulse 1.5s ease-in-out infinite',
            }}
          />
        ))}
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
  const [sbShowToken, setSbShowToken] = useState(false);
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

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
      >
        {/* Toolbar: env selector + secret count + actions */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          {/* Environment pills + count */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {environments.map((env) => {
              const isActive = env.id === currentEnvId;
              return (
                <button
                  key={env.id}
                  type="button"
                  onClick={() => selectEnvironment(env.id)}
                  style={{
                    height: '32px',
                    padding: '0 14px',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: isActive ? '#6366f1' : '#6b6b80',
                    backgroundColor: isActive ? 'rgba(99,102,241,0.12)' : 'transparent',
                    border: isActive ? '1px solid rgba(99,102,241,0.4)' : '1px solid #2a2a3a',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 150ms ease',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      const btn = e.currentTarget as HTMLButtonElement;
                      btn.style.backgroundColor = '#222230';
                      btn.style.color = '#e4e4ed';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      const btn = e.currentTarget as HTMLButtonElement;
                      btn.style.backgroundColor = 'transparent';
                      btn.style.color = '#6b6b80';
                    }
                  }}
                >
                  {env.name}
                </button>
              );
            })}
            {!loading && (
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#6b6b80',
                  whiteSpace: 'nowrap',
                  marginLeft: '4px',
                }}
              >
                {secrets.length} secret{secrets.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Export + Import + Add buttons */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
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
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                height: '40px',
                padding: '0 16px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#a1a1b5',
                backgroundColor: 'transparent',
                border: '1px solid #2a2a3a',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'background-color 150ms ease, color 150ms ease',
                whiteSpace: 'nowrap',
                minWidth: 0,
              }}
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
              <Download size={14} />
              Export
            </button>

            <button
              type="button"
              onClick={() => setImportOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                height: '40px',
                padding: '0 16px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#a1a1b5',
                backgroundColor: 'transparent',
                border: '1px solid #2a2a3a',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'background-color 150ms ease, color 150ms ease',
                whiteSpace: 'nowrap',
                minWidth: 0,
              }}
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
              <Upload size={14} />
              Import
            </button>

            <button
              type="button"
              onClick={() => setAddSecretOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                height: '40px',
                padding: '0 16px',
                fontSize: '14px',
                fontWeight: 600,
                color: '#ffffff',
                backgroundColor: '#6366f1',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'background-color 150ms ease',
                whiteSpace: 'nowrap',
                minWidth: 0,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#5558e6';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#6366f1';
              }}
            >
              <Plus size={14} />
              Add Secret
            </button>
          </div>
        </div>

        {/* Secrets list */}
        <div
          style={{
            backgroundColor: '#1a1a25',
            border: '1px solid #2a2a3a',
            borderRadius: '12px',
            padding: '0 16px',
            minHeight: '120px',
          }}
        >
          {loading ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : secrets.length === 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '48px 24px',
                gap: '16px',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  backgroundColor: 'rgba(99,102,241,0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <KeyRound size={22} color="#6366f1" style={{ opacity: 0.6 }} />
              </div>
              <div>
                <p
                  style={{
                    fontSize: '16px',
                    fontWeight: 600,
                    color: '#a1a1b5',
                    margin: '0 0 4px',
                  }}
                >
                  No secrets yet
                </p>
                <p style={{ fontSize: '14px', color: '#6b6b80', margin: '0 0 16px' }}>
                  {activeEnv
                    ? `Add your first secret to ${activeEnv.name}`
                    : 'Add your first secret to this environment'}
                </p>
                <button
                  type="button"
                  onClick={() => setAddSecretOpen(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    height: '40px',
                    padding: '0 16px',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#ffffff',
                    backgroundColor: '#6366f1',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'background-color 150ms ease',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#5558e6';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#6366f1';
                  }}
                >
                  <Plus size={14} />
                  Add your first secret
                </button>
              </div>
            </div>
          ) : (
            secrets.map((secret) => (
              <SecretRow key={secret.id} secret={secret} />
            ))
          )}
        </div>
        {/* Supabase connection */}
        <div
          style={{
            border: '1px solid rgba(62,207,142,0.2)',
            borderRadius: '12px',
            padding: '16px',
            backgroundColor: 'rgba(62,207,142,0.03)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Database size={14} color="#3ecf8e" />
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#3ecf8e', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Supabase
            </span>
          </div>

          {sbStatus?.connected ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#e4e4ed' }}>
                  {sbStatus.projectName || 'Connected'}
                </span>
                {sbStatus.region && (
                  <span style={{ fontSize: '10px', fontWeight: 600, color: '#3ecf8e', backgroundColor: 'rgba(62,207,142,0.12)', border: '1px solid rgba(62,207,142,0.25)', borderRadius: '6px', padding: '2px 6px' }}>
                    {sbStatus.region}
                  </span>
                )}
              </div>
              <p style={{ fontSize: '12px', color: '#6b6b80', margin: 0 }}>
                {sbStatus.lastSync
                  ? `Last synced ${new Date(sbStatus.lastSync + (sbStatus.lastSync.endsWith('Z') ? '' : 'Z')).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true, month: 'short', day: 'numeric' })}`
                  : 'Never synced'}
              </p>
              {sbSyncResult && <p style={{ fontSize: '12px', color: '#a1a1b5', margin: 0 }}>{sbSyncResult}</p>}
              {sbError && <p style={{ fontSize: '12px', color: '#f38ba8', margin: 0 }}>{sbError}</p>}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  disabled={sbSyncing}
                  onClick={handleSbSync}
                  style={{ height: '32px', padding: '0 12px', fontSize: '12px', fontWeight: 600, color: '#3ecf8e', backgroundColor: 'transparent', border: '1px solid rgba(62,207,142,0.3)', borderRadius: '8px', cursor: sbSyncing ? 'not-allowed' : 'pointer', opacity: sbSyncing ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', transition: 'background-color 150ms ease' }}
                  onMouseEnter={(e) => { if (!sbSyncing) e.currentTarget.style.backgroundColor = 'rgba(62,207,142,0.08)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <RefreshCw size={12} style={sbSyncing ? { animation: 'spin 1s linear infinite' } : undefined} />
                  {sbSyncing ? 'Syncing...' : 'Sync Now'}
                </button>
                <button
                  type="button"
                  onClick={handleSbDisconnect}
                  style={{ height: '32px', padding: '0 12px', fontSize: '12px', fontWeight: 600, color: '#6b6b80', backgroundColor: 'transparent', border: '1px solid #2a2a3a', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', transition: 'background-color 150ms ease, color 150ms ease' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.08)'; e.currentTarget.style.color = '#f38ba8'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#6b6b80'; }}
                >
                  <Unlink size={12} />
                  Disconnect
                </button>
              </div>
            </div>
          ) : sbStep === 'idle' ? (
            <div>
              <p style={{ fontSize: '13px', color: '#a1a1b5', margin: '0 0 12px', lineHeight: 1.5 }}>
                Connect to auto-sync API keys, database credentials, and Edge Function secrets.
              </p>
              <button
                type="button"
                onClick={() => setSbStep('token')}
                style={{ height: '32px', padding: '0 12px', fontSize: '12px', fontWeight: 600, color: '#3ecf8e', backgroundColor: 'transparent', border: '1px solid rgba(62,207,142,0.3)', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'background-color 150ms ease' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(62,207,142,0.08)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <Database size={12} />
                Connect to Supabase
              </button>
            </div>
          ) : sbStep === 'token' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#a1a1b5', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '6px' }}>Access Token</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={sbShowToken ? 'text' : 'password'}
                    value={sbToken}
                    onChange={(e) => setSbToken(e.target.value)}
                    placeholder="sbp_1a2b3c4d5e..."
                    autoFocus
                    style={{ ...inputStyle, paddingRight: '40px', fontFamily: sbShowToken ? 'var(--font-mono, monospace)' : undefined, fontSize: sbShowToken ? '13px' : '14px' }}
                    onKeyDown={(e) => { if (e.key === 'Enter' && sbToken.trim()) handleSbFetchProjects(); }}
                  />
                  <button
                    type="button"
                    onClick={() => setSbShowToken((v) => !v)}
                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: '#6b6b80', cursor: 'pointer', padding: '4px', display: 'flex' }}
                  >
                    {sbShowToken ? <XIcon size={14} /> : <span style={{ fontSize: '12px' }}>Show</span>}
                  </button>
                </div>
                <p style={{ fontSize: '11px', color: '#585b70', margin: '6px 0 0' }}>
                  Dashboard → Account (top right avatar) → Access Tokens → Generate New Token
                </p>
              </div>
              {sbError && <p style={{ fontSize: '12px', color: '#f38ba8', margin: 0 }}>{sbError}</p>}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={() => { setSbStep('idle'); setSbError(null); setSbToken(''); }} style={{ height: '32px', padding: '0 12px', fontSize: '12px', fontWeight: 600, color: '#6b6b80', backgroundColor: 'transparent', border: '1px solid #2a2a3a', borderRadius: '8px', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={sbLoading || !sbToken.trim()}
                  onClick={handleSbFetchProjects}
                  style={{ height: '32px', padding: '0 12px', fontSize: '12px', fontWeight: 600, color: '#ffffff', backgroundColor: '#3ecf8e', border: 'none', borderRadius: '8px', cursor: sbLoading || !sbToken.trim() ? 'not-allowed' : 'pointer', opacity: sbLoading || !sbToken.trim() ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  {sbLoading ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                  {sbLoading ? 'Connecting...' : 'Connect'}
                </button>
              </div>
            </div>
          ) : sbStep === 'pick' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#a1a1b5', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Select Supabase Project</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
                {sbProjects.map((sp) => (
                  <button
                    key={sp.id}
                    type="button"
                    onClick={() => setSbSelectedRef(sp.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                      backgroundColor: sbSelectedRef === sp.id ? 'rgba(62,207,142,0.08)' : '#12121a',
                      border: sbSelectedRef === sp.id ? '1px solid rgba(62,207,142,0.4)' : '1px solid #2a2a3a',
                      borderRadius: '8px', cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'all 150ms ease',
                    }}
                  >
                    <Database size={14} color={sbSelectedRef === sp.id ? '#3ecf8e' : '#6b6b80'} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: sbSelectedRef === sp.id ? '#e4e4ed' : '#a1a1b5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sp.name}</div>
                      <div style={{ fontSize: '11px', color: '#585b70', fontFamily: 'var(--font-mono, monospace)' }}>{sp.id} · {sp.region}</div>
                    </div>
                  </button>
                ))}
              </div>
              {sbError && <p style={{ fontSize: '12px', color: '#f38ba8', margin: 0 }}>{sbError}</p>}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={() => { setSbStep('token'); setSbError(null); }} style={{ height: '32px', padding: '0 12px', fontSize: '12px', fontWeight: 600, color: '#6b6b80', backgroundColor: 'transparent', border: '1px solid #2a2a3a', borderRadius: '8px', cursor: 'pointer' }}>
                  Back
                </button>
                <button
                  type="button"
                  disabled={sbLoading || !sbSelectedRef}
                  onClick={handleSbConnect}
                  style={{ height: '32px', padding: '0 12px', fontSize: '12px', fontWeight: 600, color: '#ffffff', backgroundColor: '#3ecf8e', border: 'none', borderRadius: '8px', cursor: sbLoading || !sbSelectedRef ? 'not-allowed' : 'pointer', opacity: sbLoading || !sbSelectedRef ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  {sbLoading ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                  {sbLoading ? 'Connecting...' : 'Connect & Sync'}
                </button>
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
