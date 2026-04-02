import { create } from 'zustand';
import { api, type Project, type Environment, type Secret, type Stats } from '../api/client';

interface AppState {
  // Auth
  needsSetup: boolean;
  isLocked: boolean;
  keychainEnabled: boolean;
  authLoading: boolean;

  // Data
  projects: Project[];
  currentProjectId: string | null;
  currentProject: (Project & { environments: Environment[] }) | null;
  currentEnvId: string | null;
  secrets: Secret[];
  stats: Stats | null;

  // Process
  runningProcesses: any[];
  processOutput: Map<string, string[]>;

  // UI
  loading: boolean;
  error: string | null;
  addProjectOpen: boolean;
  addSecretOpen: boolean;
  importOpen: boolean;
  editingSecret: Secret | null;

  // Dock
  dockMode: boolean;
  panelOpen: boolean;
  activeTab: string; // 'main' or a processId

  // Actions
  checkAuth: () => Promise<void>;
  setup: (password: string, enableKeychain: boolean) => Promise<void>;
  unlock: (password: string) => Promise<void>;
  lock: () => Promise<void>;

  fetchProjects: () => Promise<void>;
  selectProject: (id: string | null) => Promise<void>;
  selectEnvironment: (envId: string) => void;
  fetchSecrets: () => Promise<void>;
  fetchStats: () => Promise<void>;
  duplicateProject: (id: string) => Promise<void>;

  setAddProjectOpen: (open: boolean) => void;
  setAddSecretOpen: (open: boolean) => void;
  setImportOpen: (open: boolean) => void;
  setEditingSecret: (secret: Secret | null) => void;
  clearError: () => void;

  // Dock actions
  setDockMode: (mode: boolean) => void;
  setPanelOpen: (open: boolean) => void;
  setActiveTab: (tab: string) => void;

  // Process actions
  launchProject: (projectId: string) => Promise<void>;
  stopProject: (projectId: string) => Promise<void>;
  restartProject: (projectId: string) => Promise<void>;
  killProcess: (processId: string) => Promise<void>;
  appendOutput: (processId: string, data: string) => void;
  handleProcessExit: (processId: string) => void;
  fetchProcessStatus: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Auth defaults
  needsSetup: true,
  isLocked: true,
  keychainEnabled: false,
  authLoading: true,

  // Data defaults
  projects: [],
  currentProjectId: null,
  currentProject: null,
  currentEnvId: null,
  secrets: [],
  stats: null,

  // Process defaults
  runningProcesses: [],
  processOutput: new Map(),

  // UI defaults
  loading: false,
  error: null,
  addProjectOpen: false,
  addSecretOpen: false,
  importOpen: false,
  editingSecret: null,

  // Dock defaults
  dockMode: true,
  panelOpen: false,
  activeTab: 'main',

  // Auth actions
  checkAuth: async () => {
    set({ authLoading: true });
    try {
      const status = await api.auth.status();
      set({
        needsSetup: status.needsSetup,
        isLocked: status.isLocked,
        keychainEnabled: status.keychainEnabled,
        authLoading: false,
      });
    } catch {
      set({ authLoading: false });
    }
  },

  setup: async (password, enableKeychain) => {
    await api.auth.setup(password, enableKeychain);
    set({ needsSetup: false, isLocked: false });
  },

  unlock: async (password) => {
    await api.auth.unlock(password);
    set({ isLocked: false });
    // Load data after unlock
    get().fetchProjects();
    get().fetchStats();
  },

  lock: async () => {
    await api.auth.lock();
    set({
      isLocked: true,
      projects: [],
      currentProjectId: null,
      currentProject: null,
      currentEnvId: null,
      secrets: [],
      stats: null,
    });
  },

  // Data actions
  fetchProjects: async () => {
    try {
      const projects = await api.projects.list();
      set({ projects });
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  selectProject: async (id) => {
    if (!id) {
      set({ currentProjectId: null, currentProject: null, currentEnvId: null, secrets: [] });
      return;
    }
    set({ currentProjectId: id, loading: true });
    try {
      const project = await api.projects.get(id);
      const defaultEnv = project.environments?.find(
        (e) => e.slug === project.default_environment
      ) || project.environments?.[0];
      set({
        currentProject: project,
        currentEnvId: defaultEnv?.id ?? null,
        loading: false,
      });
      if (defaultEnv) {
        get().fetchSecrets();
      }
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err), loading: false });
    }
  },

  selectEnvironment: (envId) => {
    set({ currentEnvId: envId });
    get().fetchSecrets();
  },

  fetchSecrets: async () => {
    const envId = get().currentEnvId;
    if (!envId) return;
    try {
      const secrets = await api.secrets.list(envId, true);
      set({ secrets });
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  fetchStats: async () => {
    try {
      const stats = await api.stats();
      set({ stats });
    } catch {
      // non-critical
    }
  },

  duplicateProject: async (id) => {
    try {
      const newProject = await api.projects.duplicate(id);
      await get().fetchProjects();
      await get().selectProject(newProject.id);
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : 'Duplicate failed' });
    }
  },

  // UI actions
  setAddProjectOpen: (open) => set({ addProjectOpen: open }),
  setAddSecretOpen: (open) => set({ addSecretOpen: open, editingSecret: open ? null : get().editingSecret }),
  setImportOpen: (open) => set({ importOpen: open }),
  setEditingSecret: (secret) => set({ editingSecret: secret, addSecretOpen: !!secret }),
  clearError: () => set({ error: null }),

  // Dock actions
  setDockMode: (mode) => set({ dockMode: mode }),
  setPanelOpen: (open) => set({ panelOpen: open }),
  setActiveTab: (tab) => set({ activeTab: tab }),

  // Process actions
  launchProject: async (projectId) => {
    try {
      const result = await api.process.launch(projectId);
      if (result.processes) {
        set((state) => ({
          runningProcesses: [...state.runningProcesses, ...result.processes],
        }));
      }
      get().fetchProjects(); // refresh to update running status
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : 'Launch failed' });
    }
  },

  stopProject: async (projectId) => {
    try {
      await api.process.stop(projectId);
      set((state) => ({
        runningProcesses: state.runningProcesses.filter((p) => p.projectId !== projectId),
      }));
      get().fetchProjects();
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : 'Stop failed' });
    }
  },

  restartProject: async (projectId) => {
    try {
      const result = await api.process.restart(projectId);
      set((state) => ({
        runningProcesses: [
          ...state.runningProcesses.filter((p) => p.projectId !== projectId),
          ...(result.processes || []),
        ],
      }));
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : 'Restart failed' });
    }
  },

  killProcess: async (processId) => {
    try {
      await api.process.kill(processId);
      set((state) => ({
        runningProcesses: state.runningProcesses.filter((p) => p.id !== processId),
      }));
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : 'Kill failed' });
    }
  },

  appendOutput: (processId, data) => {
    set((state) => {
      const output = new Map(state.processOutput);
      const existing = output.get(processId) || [];
      output.set(processId, [...existing, data]);
      return { processOutput: output };
    });
  },

  handleProcessExit: (processId) => {
    set((state) => ({
      runningProcesses: state.runningProcesses.map((p) =>
        p.id === processId ? { ...p, status: 'stopped' } : p
      ),
    }));
    get().fetchProjects();
  },

  fetchProcessStatus: async () => {
    try {
      const processes = await api.process.status();
      set({ runningProcesses: processes });
    } catch {}
  },
}));
