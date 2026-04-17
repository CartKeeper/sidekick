// src/mcp/index.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { getDb, newId, getConfig, logAudit } from '../core/db.js';
import { encrypt, decrypt, deriveKey, verifyPassword } from '../core/crypto.js';
import { readFromKeychain } from '../core/keychain.js';
import { ProcessManager } from '../process/manager.js';

// --- State ---
let vaultKey: Buffer | null = null;
const processManager = new ProcessManager();

// --- Database ---
function db() {
  return getDb();
}

// --- Auto-unlock via Keychain ---
async function tryAutoUnlock() {
  const passwordHash = getConfig(db(), 'password_hash');
  if (!passwordHash) return false;

  const password = readFromKeychain();
  if (!password) return false;

  const valid = await verifyPassword(password, passwordHash);
  if (!valid) return false;

  const salt = getConfig(db(), 'encryption_salt')!;
  vaultKey = deriveKey(password, salt);
  console.error('[mcp] Auto-unlocked via Keychain');
  return true;
}

function requireKey(): Buffer {
  if (!vaultKey) throw new Error('Vault is locked. Please unlock Sidekick first.');
  return vaultKey;
}

// --- Helpers ---
function text(content: string) {
  return { content: [{ type: 'text' as const, text: content }] };
}

function findProject(identifier: string) {
  const d = db();
  // Try by ID first, then by name (case-insensitive)
  let project = d.prepare('SELECT * FROM projects WHERE id = ? AND archived = 0').get(identifier) as any;
  if (!project) {
    project = d.prepare('SELECT * FROM projects WHERE LOWER(name) = LOWER(?) AND archived = 0').get(identifier) as any;
  }
  return project;
}

function findEnvironment(projectId: string, envSlug: string) {
  return db().prepare('SELECT * FROM environments WHERE project_id = ? AND slug = ?').get(projectId, envSlug) as any;
}

function getDecryptedSecrets(envId: string): Record<string, string> {
  const key = requireKey();
  const rows = db().prepare('SELECT key, value_encrypted, iv, auth_tag FROM secrets WHERE environment_id = ?').all(envId) as any[];
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = decrypt({ ciphertext: row.value_encrypted, iv: row.iv, authTag: row.auth_tag }, key);
  }
  return result;
}

// --- Helper ---
function detectType(key: string): string {
  const k = key.toUpperCase();
  if (k.includes('API_KEY') || k.includes('APIKEY')) return 'api_key';
  if (k.includes('SECRET') || k.includes('PRIVATE')) return 'secret';
  if (k.includes('TOKEN') || k.includes('JWT')) return 'token';
  if (k.includes('PASSWORD') || k.includes('PASSWD') || k.includes('PWD')) return 'password';
  if (k.includes('DATABASE') || k.includes('DB_') || k.includes('_URL') || k.includes('_URI')) return 'connection';
  return 'generic';
}

// --- MCP Server ---
const server = new McpServer({
  name: 'sidekick',
  version: '0.1.0',
});

// ==================== PROJECT TOOLS ====================

server.tool(
  'list_projects',
  'List all projects with their status, environment count, and secret count',
  {},
  async () => {
    const projects = db().prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM environments WHERE project_id = p.id) as envCount,
        (SELECT COUNT(*) FROM secrets s JOIN environments e ON s.environment_id = e.id WHERE e.project_id = p.id) as secretCount
      FROM projects p WHERE p.archived = 0 ORDER BY p.name
    `).all() as any[];

    const lines = projects.map((p: any) => {
      const running = processManager.isRunning(p.id) ? ' [RUNNING]' : '';
      const stack = JSON.parse(p.stack || '[]').join(', ');
      return `${p.name}${running} — ${p.envCount} envs, ${p.secretCount} secrets${stack ? ` (${stack})` : ''}`;
    });

    return text(lines.length ? lines.join('\n') : 'No projects found.');
  }
);

server.tool(
  'get_project',
  'Get full project details by name or ID, including environments and running status',
  { identifier: z.string().describe('Project name or ID') },
  async ({ identifier }) => {
    const project = findProject(identifier);
    if (!project) return text(`Project "${identifier}" not found.`);

    const environments = db().prepare(
      'SELECT e.*, (SELECT COUNT(*) FROM secrets WHERE environment_id = e.id) as secretCount FROM environments e WHERE e.project_id = ? ORDER BY e.sort_order'
    ).all(project.id) as any[];

    const running = processManager.isRunning(project.id);
    const processes = processManager.getByProject(project.id);

    const info = {
      ...project,
      stack: JSON.parse(project.stack || '[]'),
      start_commands: JSON.parse(project.start_commands || '[]'),
      environments: environments.map((e: any) => ({ name: e.name, slug: e.slug, secrets: e.secretCount })),
      running,
      processes: processes.map((p) => ({ name: p.commandName, status: p.status, command: p.command })),
    };

    return text(JSON.stringify(info, null, 2));
  }
);

server.tool(
  'add_project',
  'Create a new project',
  {
    name: z.string().describe('Project name'),
    description: z.string().optional().describe('Project description'),
    path: z.string().optional().describe('Filesystem path to the project'),
    start_commands: z.array(z.object({
      name: z.string(),
      command: z.string(),
      path: z.string().optional(),
    })).optional().describe('Start commands for the project'),
    dev_url: z.string().optional().describe('Dev server URL'),
    stack: z.array(z.string()).optional().describe('Tech stack tags'),
  },
  async ({ name, description, path, start_commands, dev_url, stack }) => {
    const d = db();
    const id = newId();

    try {
      d.prepare(
        `INSERT INTO projects (id, name, description, path, start_commands, dev_url, stack) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(id, name, description || '', path || '', JSON.stringify(start_commands || []), dev_url || '', JSON.stringify(stack || []));
    } catch (err: any) {
      if (err.message?.includes('UNIQUE')) return text(`Project "${name}" already exists.`);
      throw err;
    }

    // Create default environments
    const defaultEnvs = JSON.parse(getConfig(d, 'default_environments') || '["Dev","Staging","Prod"]');
    for (let i = 0; i < defaultEnvs.length; i++) {
      d.prepare('INSERT INTO environments (id, project_id, name, slug, sort_order) VALUES (?, ?, ?, ?, ?)')
        .run(newId(), id, defaultEnvs[i], defaultEnvs[i].toLowerCase(), i);
    }

    logAudit(d, 'created', 'project', id, name, { via: 'mcp' });
    return text(`Created project "${name}" with ID ${id}`);
  }
);

server.tool(
  'update_project',
  'Update a project\'s fields',
  {
    identifier: z.string().describe('Project name or ID'),
    name: z.string().optional(),
    description: z.string().optional(),
    path: z.string().optional(),
    start_commands: z.array(z.object({
      name: z.string(),
      command: z.string(),
      path: z.string().optional(),
    })).optional(),
    dev_url: z.string().optional(),
    stack: z.array(z.string()).optional(),
    default_environment: z.string().optional(),
  },
  async ({ identifier, ...fields }) => {
    const project = findProject(identifier);
    if (!project) return text(`Project "${identifier}" not found.`);

    const sets: string[] = [];
    const values: any[] = [];

    for (const [key, val] of Object.entries(fields)) {
      if (val === undefined) continue;
      const dbVal = (key === 'stack' || key === 'start_commands') ? JSON.stringify(val) : val;
      sets.push(`${key} = ?`);
      values.push(dbVal);
    }

    if (sets.length === 0) return text('No fields to update.');

    sets.push("updated_at = datetime('now')");
    values.push(project.id);

    db().prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    logAudit(db(), 'updated', 'project', project.id, project.name, { via: 'mcp', fields: Object.keys(fields) });
    return text(`Updated project "${project.name}".`);
  }
);

server.tool(
  'remove_project',
  'Archive (soft-delete) a project',
  { identifier: z.string().describe('Project name or ID') },
  async ({ identifier }) => {
    const project = findProject(identifier);
    if (!project) return text(`Project "${identifier}" not found.`);

    db().prepare("UPDATE projects SET archived = 1, updated_at = datetime('now') WHERE id = ?").run(project.id);
    logAudit(db(), 'archived', 'project', project.id, project.name, { via: 'mcp' });
    return text(`Archived project "${project.name}".`);
  }
);

server.tool(
  'duplicate_project',
  'Duplicate a project including all environments and secrets',
  { identifier: z.string().describe('Project name or ID') },
  async ({ identifier }) => {
    const vk = requireKey();
    const project = findProject(identifier);
    if (!project) return text(`Project "${identifier}" not found.`);

    const d = db();

    // Generate unique name
    let copyName = `${project.name} (Copy)`;
    let suffix = 2;
    while (d.prepare('SELECT id FROM projects WHERE name = ?').get(copyName)) {
      copyName = `${project.name} (Copy ${suffix++})`;
    }

    const newProjectId = newId();

    d.transaction(() => {
      d.prepare(
        `INSERT INTO projects (id, name, description, icon, color, path, start_commands, dev_url,
          default_environment, enable_terminal, enable_vscode, enable_browser, stack, sort_order, icon_path)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        newProjectId, copyName, project.description, project.icon, project.color,
        project.path, project.start_commands, project.dev_url, project.default_environment,
        project.enable_terminal, project.enable_vscode, project.enable_browser,
        project.stack, project.sort_order, project.icon_path
      );

      const envs = d.prepare('SELECT * FROM environments WHERE project_id = ? ORDER BY sort_order')
        .all(project.id) as any[];

      for (const env of envs) {
        const newEnvId = newId();
        d.prepare('INSERT INTO environments (id, project_id, name, slug, sort_order) VALUES (?, ?, ?, ?, ?)')
          .run(newEnvId, newProjectId, env.name, env.slug, env.sort_order);

        const secrets = d.prepare('SELECT * FROM secrets WHERE environment_id = ?').all(env.id) as any[];
        for (const secret of secrets) {
          const plaintext = decrypt(
            { ciphertext: secret.value_encrypted, iv: secret.iv, authTag: secret.auth_tag },
            vk
          );
          const encrypted = encrypt(plaintext, vk);
          d.prepare(
            `INSERT INTO secrets (id, environment_id, key, value_encrypted, iv, auth_tag, type, notes, source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            newId(), newEnvId, secret.key, encrypted.ciphertext, encrypted.iv,
            encrypted.authTag, secret.type, secret.notes, secret.source
          );
        }
      }

      logAudit(d, 'duplicated_via_mcp', 'project', newProjectId, copyName, {
        sourceId: project.id, sourceName: project.name,
      });
    })();

    const envCount = d.prepare('SELECT COUNT(*) as c FROM environments WHERE project_id = ?').get(newProjectId) as any;
    const secretCount = d.prepare(
      'SELECT COUNT(*) as c FROM secrets s JOIN environments e ON s.environment_id = e.id WHERE e.project_id = ?'
    ).get(newProjectId) as any;

    return text(`Duplicated "${project.name}" → "${copyName}" (${envCount.c} environments, ${secretCount.c} secrets).`);
  }
);

// ==================== SECRET TOOLS ====================

server.tool(
  'get_secrets',
  'Get all decrypted secrets for a project and environment',
  {
    project: z.string().describe('Project name or ID'),
    environment: z.string().default('dev').describe('Environment slug (default: dev)'),
  },
  async ({ project: identifier, environment }) => {
    requireKey();
    const project = findProject(identifier);
    if (!project) return text(`Project "${identifier}" not found.`);

    const env = findEnvironment(project.id, environment);
    if (!env) return text(`Environment "${environment}" not found in project "${project.name}".`);

    const secrets = getDecryptedSecrets(env.id);
    logAudit(db(), 'accessed_via_mcp', 'project', project.id, project.name, { environment, secretCount: Object.keys(secrets).length });

    if (Object.keys(secrets).length === 0) return text(`No secrets in ${project.name}/${environment}.`);
    return text(JSON.stringify(secrets, null, 2));
  }
);

server.tool(
  'get_secret',
  'Get a single decrypted secret by key',
  {
    project: z.string().describe('Project name or ID'),
    key: z.string().describe('Secret key name'),
    environment: z.string().default('dev').describe('Environment slug'),
  },
  async ({ project: identifier, key, environment }) => {
    requireKey();
    const project = findProject(identifier);
    if (!project) return text(`Project "${identifier}" not found.`);

    const env = findEnvironment(project.id, environment);
    if (!env) return text(`Environment "${environment}" not found.`);

    const secret = db().prepare('SELECT * FROM secrets WHERE environment_id = ? AND key = ?').get(env.id, key) as any;
    if (!secret) return text(`Secret "${key}" not found in ${project.name}/${environment}.`);

    const value = decrypt({ ciphertext: secret.value_encrypted, iv: secret.iv, authTag: secret.auth_tag }, requireKey());
    logAudit(db(), 'accessed_via_mcp', 'secret', secret.id, key, { project: project.name, environment });
    return text(value);
  }
);

server.tool(
  'set_secret',
  'Create or update a secret',
  {
    project: z.string().describe('Project name or ID'),
    key: z.string().describe('Secret key name'),
    value: z.string().describe('Secret value'),
    environment: z.string().default('dev').describe('Environment slug'),
    type: z.string().optional().describe('Secret type (api_key, secret, token, password, connection, generic)'),
  },
  async ({ project: identifier, key, value, environment, type }) => {
    const vk = requireKey();
    const project = findProject(identifier);
    if (!project) return text(`Project "${identifier}" not found.`);

    const env = findEnvironment(project.id, environment);
    if (!env) return text(`Environment "${environment}" not found.`);

    const encrypted = encrypt(value, vk);
    const existing = db().prepare('SELECT id FROM secrets WHERE environment_id = ? AND key = ?').get(env.id, key) as any;

    if (existing) {
      db().prepare("UPDATE secrets SET value_encrypted = ?, iv = ?, auth_tag = ?, updated_at = datetime('now') WHERE id = ?")
        .run(encrypted.ciphertext, encrypted.iv, encrypted.authTag, existing.id);
      logAudit(db(), 'updated_via_mcp', 'secret', existing.id, key, { project: project.name, environment });
      return text(`Updated secret "${key}" in ${project.name}/${environment}.`);
    } else {
      const id = newId();
      const detectedType = type || detectType(key);
      db().prepare('INSERT INTO secrets (id, environment_id, key, value_encrypted, iv, auth_tag, type) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, env.id, key, encrypted.ciphertext, encrypted.iv, encrypted.authTag, detectedType);
      logAudit(db(), 'created_via_mcp', 'secret', id, key, { project: project.name, environment });
      return text(`Created secret "${key}" in ${project.name}/${environment}.`);
    }
  }
);

server.tool(
  'search_secrets',
  'Search for secrets by key pattern across all projects',
  { query: z.string().describe('Search query (matches key names)') },
  async ({ query }) => {
    const results = db().prepare(`
      SELECT s.key, s.type, p.name as project, e.name as environment, e.slug
      FROM secrets s
      JOIN environments e ON s.environment_id = e.id
      JOIN projects p ON e.project_id = p.id
      WHERE s.key LIKE ? AND p.archived = 0
      ORDER BY s.key LIMIT 50
    `).all(`%${query}%`) as any[];

    if (results.length === 0) return text(`No secrets matching "${query}".`);

    const lines = results.map((r: any) => `${r.key} (${r.type}) — ${r.project}/${r.slug}`);
    return text(lines.join('\n'));
  }
);

server.tool(
  'export_env',
  'Export secrets as .env format',
  {
    project: z.string().describe('Project name or ID'),
    environment: z.string().default('dev').describe('Environment slug'),
    keys: z.array(z.string()).optional().describe('Specific keys to export (omit for all)'),
  },
  async ({ project: identifier, environment, keys }) => {
    requireKey();
    const project = findProject(identifier);
    if (!project) return text(`Project "${identifier}" not found.`);

    const env = findEnvironment(project.id, environment);
    if (!env) return text(`Environment "${environment}" not found.`);

    let secrets = getDecryptedSecrets(env.id);
    if (keys?.length) {
      const allowed = new Set(keys);
      secrets = Object.fromEntries(Object.entries(secrets).filter(([k]) => allowed.has(k)));
    }

    logAudit(db(), 'exported_via_mcp', 'project', project.id, project.name, { environment, secretCount: Object.keys(secrets).length });

    const lines = Object.entries(secrets).map(([k, v]) => `${k}="${v}"`);
    return text(lines.join('\n'));
  }
);

server.tool(
  'import_env',
  'Import secrets from .env-formatted text',
  {
    project: z.string().describe('Project name or ID'),
    environment: z.string().default('dev').describe('Environment slug'),
    content: z.string().describe('.env formatted content (KEY=value, one per line)'),
    overwrite: z.boolean().default(false).describe('Overwrite existing secrets'),
  },
  async ({ project: identifier, environment, content, overwrite }) => {
    const vk = requireKey();
    const project = findProject(identifier);
    if (!project) return text(`Project "${identifier}" not found.`);

    const env = findEnvironment(project.id, environment);
    if (!env) return text(`Environment "${environment}" not found.`);

    // Parse .env content
    const entries: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key) entries[key] = value;
    }

    let imported = 0;
    const d = db();
    const txn = d.transaction(() => {
      for (const [key, value] of Object.entries(entries)) {
        const encrypted = encrypt(value, vk);
        const existing = d.prepare('SELECT id FROM secrets WHERE environment_id = ? AND key = ?').get(env.id, key);
        if (existing) {
          if (overwrite) {
            d.prepare("UPDATE secrets SET value_encrypted = ?, iv = ?, auth_tag = ?, updated_at = datetime('now') WHERE environment_id = ? AND key = ?")
              .run(encrypted.ciphertext, encrypted.iv, encrypted.authTag, env.id, key);
            imported++;
          }
        } else {
          d.prepare('INSERT INTO secrets (id, environment_id, key, value_encrypted, iv, auth_tag, type) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(newId(), env.id, key, encrypted.ciphertext, encrypted.iv, encrypted.authTag, detectType(key));
          imported++;
        }
      }
    });
    txn();

    logAudit(d, 'imported_via_mcp', 'project', project.id, project.name, { environment, imported, total: Object.keys(entries).length });
    return text(`Imported ${imported} secrets into ${project.name}/${environment}.`);
  }
);

// ==================== PROCESS TOOLS ====================

server.tool(
  'launch_project',
  'Launch a project (starts dev server with secrets injected as environment variables)',
  {
    identifier: z.string().describe('Project name or ID'),
    environment: z.string().optional().describe('Environment to inject secrets from (default: project default)'),
  },
  async ({ identifier, environment }) => {
    requireKey();
    const project = findProject(identifier);
    if (!project) return text(`Project "${identifier}" not found.`);

    const commands = JSON.parse(project.start_commands || '[]');
    if (commands.length === 0) return text(`No start commands configured for "${project.name}".`);

    if (processManager.isRunning(project.id)) return text(`"${project.name}" is already running.`);

    const envSlug = environment || project.default_environment || 'dev';
    const env = findEnvironment(project.id, envSlug);
    const secrets = env ? getDecryptedSecrets(env.id) : {};

    const processes = processManager.launch({
      projectId: project.id,
      projectName: project.name,
      commands,
      cwd: project.path || process.cwd(),
      secrets,
    });

    logAudit(db(), 'launched_via_mcp', 'project', project.id, project.name, { environment: envSlug, processCount: processes.length });
    return text(`Launched "${project.name}" with ${processes.length} process(es). Secrets injected from ${envSlug} environment.`);
  }
);

server.tool(
  'stop_project',
  'Stop all running processes for a project',
  { identifier: z.string().describe('Project name or ID') },
  async ({ identifier }) => {
    const project = findProject(identifier);
    if (!project) return text(`Project "${identifier}" not found.`);

    if (!processManager.isRunning(project.id)) return text(`"${project.name}" is not running.`);

    await processManager.stop(project.id);
    logAudit(db(), 'stopped_via_mcp', 'project', project.id, project.name, {});
    return text(`Stopped "${project.name}".`);
  }
);

server.tool(
  'restart_project',
  'Restart all processes for a project (stop + relaunch)',
  {
    identifier: z.string().describe('Project name or ID'),
    environment: z.string().optional().describe('Environment to inject secrets from'),
  },
  async ({ identifier, environment }) => {
    requireKey();
    const project = findProject(identifier);
    if (!project) return text(`Project "${identifier}" not found.`);

    const commands = JSON.parse(project.start_commands || '[]');
    if (commands.length === 0) return text(`No start commands configured for "${project.name}".`);

    const envSlug = environment || project.default_environment || 'dev';
    const env = findEnvironment(project.id, envSlug);
    const secrets = env ? getDecryptedSecrets(env.id) : {};

    const processes = await processManager.restart(project.id, {
      projectName: project.name,
      commands,
      cwd: project.path || process.cwd(),
      secrets,
    });

    logAudit(db(), 'restarted_via_mcp', 'project', project.id, project.name, { environment: envSlug });
    return text(`Restarted "${project.name}" with ${processes.length} process(es).`);
  }
);

// --- Start ---
async function main() {
  await tryAutoUnlock();

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[mcp] Sidekick MCP server running');
}

main().catch((err) => {
  console.error('[mcp] Fatal:', err);
  process.exit(1);
});
