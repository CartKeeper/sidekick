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

  // UI
  loading: boolean;
  error: string | null;
  addProjectOpen: boolean;
  addSecretOpen: boolean;
  importOpen: boolean;
  editingSecret: Secret | null;

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

  setAddProjectOpen: (open: boolean) => void;
  setAddSecretOpen: (open: boolean) => void;
  setImportOpen: (open: boolean) => void;
  setEditingSecret: (secret: Secret | null) => void;
  clearError: () => void;
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

  // UI defaults
  loading: false,
  error: null,
  addProjectOpen: false,
  addSecretOpen: false,
  importOpen: false,
  editingSecret: null,

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

  // UI actions
  setAddProjectOpen: (open) => set({ addProjectOpen: open }),
  setAddSecretOpen: (open) => set({ addSecretOpen: open, editingSecret: open ? null : get().editingSecret }),
  setImportOpen: (open) => set({ importOpen: open }),
  setEditingSecret: (secret) => set({ editingSecret: secret, addSecretOpen: !!secret }),
  clearError: () => set({ error: null }),
}));
