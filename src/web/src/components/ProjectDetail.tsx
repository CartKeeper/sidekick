import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAppStore } from '../stores/app';
import { SecretsTab } from './SecretsTab';
import { LaunchTab } from './LaunchTab';
import { SettingsTab } from './SettingsTab';

type Tab = 'secrets' | 'launch' | 'settings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'secrets', label: 'Secrets' },
  { id: 'launch', label: 'Launch' },
  { id: 'settings', label: 'Settings' },
];

export function ProjectDetail() {
  const { currentProject, currentProjectId, selectProject } = useAppStore();
  const [activeTab, setActiveTab] = useState<Tab>('secrets');

  if (!currentProject) return null;

  const handleUpdate = async () => {
    if (currentProjectId) {
      await selectProject(currentProjectId);
    }
  };

  return (
    <motion.div
      key={currentProject.id}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, minWidth: 0, maxWidth: '100%' }}
    >
      {/* Project header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          paddingBottom: '16px',
          borderBottom: '1px solid #2a2a3a',
          flexShrink: 0,
        }}
      >
        {currentProject.icon && /\p{Emoji}/u.test(currentProject.icon) ? (
          <span style={{ fontSize: '24px', lineHeight: 1 }}>{currentProject.icon}</span>
        ) : (
          <div
            style={{
              width: '14px',
              height: '14px',
              borderRadius: '50%',
              backgroundColor: currentProject.color || '#6366f1',
              flexShrink: 0,
            }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1
            style={{
              fontSize: '20px',
              fontWeight: 600,
              color: '#e4e4ed',
              margin: '0 0 2px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {currentProject.name}
          </h1>
          {currentProject.description && (
            <p
              style={{
                fontSize: '14px',
                color: '#a1a1b5',
                margin: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {currentProject.description}
            </p>
          )}
        </div>
        {/* Stack tags */}
        {currentProject.stack && currentProject.stack.length > 0 && (
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap', maxWidth: '200px' }}>
            {currentProject.stack.slice(0, 4).map((tag) => (
              <span
                key={tag}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  height: '22px',
                  padding: '0 8px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#a1a1b5',
                  backgroundColor: '#2a2a3a',
                  borderRadius: '6px',
                  whiteSpace: 'nowrap',
                  letterSpacing: '0.03em',
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          gap: '4px',
          padding: '12px 0',
          borderBottom: '1px solid #2a2a3a',
          flexShrink: 0,
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              height: '32px',
              padding: '0 14px',
              fontSize: '13px',
              fontWeight: activeTab === tab.id ? 600 : 400,
              color: activeTab === tab.id ? '#e4e4ed' : '#6b6b80',
              backgroundColor: activeTab === tab.id ? '#2a2a3a' : 'transparent',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'background-color 150ms ease, color 150ms ease',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => {
              if (activeTab !== tab.id) {
                (e.currentTarget as HTMLButtonElement).style.color = '#a1a1b5';
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(42,42,58,0.5)';
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== tab.id) {
                (e.currentTarget as HTMLButtonElement).style.color = '#6b6b80';
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
              }
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          paddingTop: '16px',
        }}
      >
        {activeTab === 'secrets' && (
          <SecretsTab />
        )}
        {activeTab === 'launch' && (
          <LaunchTab project={currentProject} onUpdate={handleUpdate} />
        )}
        {activeTab === 'settings' && (
          <SettingsTab project={currentProject} onUpdate={handleUpdate} />
        )}
      </div>
    </motion.div>
  );
}
