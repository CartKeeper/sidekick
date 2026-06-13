const BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...options?.headers as Record<string, string> };
  // Only set Content-Type when there's a body to send
  if (options?.body) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${BASE}${url}`, {
    ...options,
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  const contentType = res.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    return res.json();
  }
  return res.text() as unknown as T;
}

function get<T>(url: string) { return request<T>(url); }
function post<T>(url: string, body?: unknown) {
  return request<T>(url, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
}
function put<T>(url: string, body: unknown) {
  return request<T>(url, { method: 'PUT', body: JSON.stringify(body) });
}
function del<T>(url: string) {
  return request<T>(url, { method: 'DELETE' });
}

// --- Types ---

export interface Project {
  id: string;
  name: string;
  description: string;
  icon: string;
  icon_path: string;
  color: string;
  path: string;
  start_commands: { name: string; command: string; path?: string }[];
  dev_url: string;
  default_environment: string;
  enable_terminal: boolean;
  enable_vscode: boolean;
  enable_browser: boolean;
  include_in_toolbar: boolean;
  stack: string[];
  sort_order: number;
  archived: boolean;
  created_at: string;
  updated_at: string;
  environmentCount?: number;
  secretCount?: number;
  environments?: Environment[];
}

export interface Environment {
  id: string;
  project_id: string;
  name: string;
  slug: string;
  sort_order: number;
  created_at: string;
  secretCount?: number;
}

export interface Secret {
  id: string;
  environment_id: string;
  key: string;
  value?: string;
  type: string;
  source: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface SupabaseStatus {
  connected: boolean;
  projectRef: string;
  projectName: string;
  region: string;
  lastSync: string | null;
}

export interface SupabaseSyncResult {
  updated: number;
  unchanged: number;
  conflicts: string[];
  errors: string[];
}

export interface SearchResult {
  id: string;
  key: string;
  type: string;
  projectId: string;
  projectName: string;
  environmentName: string;
  environmentSlug: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  entity_name: string;
  details: string;
  created_at: string;
}

export interface PortListener {
  pid: number;
  command: string;
  fullCommand: string;
  user: string;
  ports: { address: string; port: number; protocol: 'TCP' }[];
}

export interface Stats {
  projectCount: number;
  secretCount: number;
  environmentCount: number;
  recentActivity: AuditEntry[];
}

// --- API Methods ---

export const api = {
  auth: {
    status: () => get<{ needsSetup: boolean; isLocked: boolean; keychainEnabled: boolean }>('/auth/status'),
    setup: (password: string, enableKeychain: boolean) =>
      post<{ success: boolean }>('/auth/setup', { password, enableKeychain }),
    unlock: (password: string) => post<{ success: boolean }>('/auth/unlock', { password }),
    lock: () => post<{ success: boolean }>('/auth/lock'),
    changePassword: (currentPassword: string, newPassword: string) =>
      post<{ success: boolean }>('/auth/change-password', { currentPassword, newPassword }),
  },
  projects: {
    list: () => get<Project[]>('/projects'),
    get: (id: string) => get<Project & { environments: Environment[] }>(`/projects/${id}`),
    create: (data: Partial<Project>) => post<Project>('/projects', data),
    update: (id: string, data: Partial<Project>) => put<Project>(`/projects/${id}`, data),
    archive: (id: string) => del<{ success: boolean }>(`/projects/${id}`),
    duplicate: (id: string) =>
      post<Project & { environments: Environment[] }>(`/projects/${id}/duplicate`),
    uploadIcon: async (id: string, file: File): Promise<{ success: boolean; icon_path: string }> => {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${BASE}/projects/${id}/icon`, { method: 'POST', body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || res.statusText);
      }
      return res.json();
    },
  },
  environments: {
    list: (projectId: string) => get<Environment[]>(`/projects/${projectId}/environments`),
    create: (projectId: string, data: { name: string; slug: string }) =>
      post<Environment>(`/projects/${projectId}/environments`, data),
    remove: (id: string) => del<{ success: boolean }>(`/environments/${id}`),
  },
  secrets: {
    list: (envId: string, reveal = false) =>
      get<Secret[]>(`/environments/${envId}/secrets${reveal ? '?reveal=true' : ''}`),
    get: (id: string) => get<Secret>(`/secrets/${id}`),
    create: (envId: string, data: { key: string; value: string; type?: string; notes?: string }) =>
      post<Secret>(`/environments/${envId}/secrets`, data),
    update: (id: string, data: { value?: string; type?: string; notes?: string }) =>
      put<{ success: boolean }>(`/secrets/${id}`, data),
    remove: (id: string) => del<{ success: boolean }>(`/secrets/${id}`),
  },
  search: (q: string) => get<SearchResult[]>(`/search?q=${encodeURIComponent(q)}`),
  stats: () => get<Stats>('/stats'),
  activity: () => get<AuditEntry[]>('/activity'),
  export: {
    env: (projectId: string, envSlug: string, format = 'dotenv', keys?: string[]) => {
      let url = `/projects/${projectId}/export?env=${envSlug}&format=${format}`;
      if (keys?.length) url += `&keys=${keys.join(',')}`;
      return get<string | Record<string, string>>(url);
    },
    import: (projectId: string, data: { env: string; format: string; content: string; overwrite?: boolean }) =>
      post<{ success: boolean; imported: number }>(`/projects/${projectId}/import`, data),
  },
  process: {
    launch: (projectId: string, environment?: string) =>
      post<{ success: boolean; processes: any[] }>(`/process/launch/${projectId}`, { environment }),
    stop: (projectId: string) =>
      post<{ success: boolean }>(`/process/stop/${projectId}`),
    restart: (projectId: string, environment?: string) =>
      post<{ success: boolean; processes: any[] }>(`/process/restart/${projectId}`, { environment }),
    kill: (processId: string) =>
      post<{ success: boolean }>(`/process/kill/${processId}`),
    status: () => get<any[]>('/process/status'),
    projectStatus: (projectId: string) =>
      get<{ running: boolean; processes: any[] }>(`/process/status/${projectId}`),
  },
  migration: {
    detect: () => get<{ sources: any[]; preview: any }>('/migration/detect'),
    run: (infiscalPassword?: string) =>
      post<{ imported: any; errors: string[] }>('/migration/run', { infiscalPassword }),
  },
  ports: {
    list: () => get<{ listeners: PortListener[] }>('/ports'),
    kill: (pid: number, force = false) =>
      del<{ success: boolean; signal: string }>(`/ports/${pid}${force ? '?force=true' : ''}`),
  },
  supabase: {
    listProjects: (accessToken: string) =>
      post<any[]>('/supabase/projects', { accessToken }),
    connect: (projectId: string, accessToken: string, supabaseProjectRef: string) =>
      post<{ success: boolean; supabaseProject: any; sync: SupabaseSyncResult }>('/supabase/connect', { projectId, accessToken, supabaseProjectRef }),
    disconnect: (projectId: string) =>
      post<{ success: boolean }>(`/supabase/disconnect/${projectId}`),
    sync: (projectId: string) =>
      post<SupabaseSyncResult>(`/supabase/sync/${projectId}`),
    status: (projectId: string) =>
      get<SupabaseStatus>(`/supabase/status/${projectId}`),
  },
};

// --- Process Streaming Types & Helper ---

export interface ProcessEvent {
  processId: string;
  data: string;
  stream: 'stdout' | 'stderr';
}

export interface ProcessExitEvent {
  processId: string;
  code: number | null;
  signal: string | null;
}

export function connectProcessStream(
  onOutput: (event: ProcessEvent) => void,
  onExit: (event: ProcessExitEvent) => void,
  onInit?: (processes: any[]) => void
): () => void {
  const es = new EventSource('/api/process/output');

  es.onmessage = (e) => {
    try {
      onOutput(JSON.parse(e.data));
    } catch {}
  };

  es.addEventListener('exit', (e: any) => {
    try {
      onExit(JSON.parse(e.data));
    } catch {}
  });

  es.addEventListener('init', (e: any) => {
    try {
      onInit?.(JSON.parse(e.data));
    } catch {}
  });

  // Return cleanup function
  return () => es.close();
}
