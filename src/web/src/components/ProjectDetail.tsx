import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAppStore } from '../stores/app';
import { SecretsTab } from './SecretsTab';
import { LaunchTab } from './LaunchTab';
import { SettingsTab } from './SettingsTab';
import { ProjectIcon } from './ProjectIcon';
import { cn } from './ui';

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
      className="flex flex-col h-full min-h-0 min-w-0 max-w-full"
    >
      {/* Project header */}
      <div className="flex items-center gap-3 pb-4 border-b border-border-default shrink-0">
        <ProjectIcon
          icon={currentProject.icon}
          iconPath={currentProject.icon_path}
          color={currentProject.color}
          name={currentProject.name}
          size={32}
          borderRadius={8}
        />
        <div className="flex-1 min-w-0">
          <h1 className="text-[20px] font-semibold text-text-primary m-0 mb-0.5 truncate">
            {currentProject.name}
          </h1>
          {currentProject.description && (
            <p className="text-[14px] text-text-secondary m-0 truncate">
              {currentProject.description}
            </p>
          )}
        </div>
        {/* Stack tags */}
        {currentProject.stack && currentProject.stack.length > 0 && (
          <div className="flex gap-1.5 shrink-0 flex-wrap max-w-50">
            {currentProject.stack.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center h-5.5 px-2 text-[11px] font-semibold text-text-secondary bg-border-default rounded-md whitespace-nowrap tracking-wide"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 py-3 border-b border-border-default shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'h-8 px-3.5 text-[13px] border-none rounded-lg cursor-pointer whitespace-nowrap',
              'transition-[background-color,color] duration-150',
              'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
              activeTab === tab.id
                ? 'font-semibold text-text-primary bg-border-default'
                : 'font-normal text-text-muted bg-transparent hover:text-text-secondary hover:bg-border-default/50',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto pt-4">
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
