import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Upload, KeyRound, Database } from 'lucide-react';
import { useAppStore } from '../stores/app';
import { SecretRow } from './SecretRow';
import { AddSecretModal } from './AddSecretModal';
import { ImportModal } from './ImportModal';
import { SupabaseImportModal } from './SupabaseImportModal';

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

  const [supabaseOpen, setSupabaseOpen] = useState(false);

  const environments = currentProject?.environments ?? [];

  const activeEnv = environments.find((e) => e.id === currentEnvId);

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

          {/* Add + Import buttons */}
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
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
                minWidth: '80px',
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
              onClick={() => setSupabaseOpen(true)}
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
                minWidth: '80px',
              }}
              onMouseEnter={(e) => {
                const btn = e.currentTarget as HTMLButtonElement;
                btn.style.backgroundColor = 'rgba(62,207,142,0.08)';
                btn.style.color = '#3ecf8e';
                btn.style.borderColor = 'rgba(62,207,142,0.3)';
              }}
              onMouseLeave={(e) => {
                const btn = e.currentTarget as HTMLButtonElement;
                btn.style.backgroundColor = 'transparent';
                btn.style.color = '#a1a1b5';
                btn.style.borderColor = '#2a2a3a';
              }}
            >
              <Database size={14} />
              Supabase
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
                minWidth: '80px',
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
      </motion.div>

      {/* Modals rendered at tab level so they're accessible */}
      {addSecretOpen && <AddSecretModal />}
      {importOpen && <ImportModal />}
      {supabaseOpen && currentProject && (
        <SupabaseImportModal
          projectId={currentProject.id}
          environments={environments}
          currentEnvSlug={activeEnv?.slug ?? 'dev'}
          onClose={() => { setSupabaseOpen(false); fetchSecrets(); }}
        />
      )}
    </>
  );
}
