// src/server/routes/projects.ts
import type { FastifyInstance } from 'fastify';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { newId, getConfig, logAudit } from '../../core/db.js';
import { decrypt, encrypt } from '../../core/crypto.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sidekickRoot = join(__dirname, '..', '..', '..');

/** Write .mcp.json into a project directory so Claude Code auto-discovers Sidekick */
function writeMcpConfig(projectPath: string): void {
  if (!projectPath || !existsSync(projectPath)) return;
  const config = {
    mcpServers: {
      sidekick: {
        type: 'stdio',
        command: 'node',
        args: [
          join(sidekickRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
          join(sidekickRoot, 'src', 'mcp', 'index.ts'),
        ],
        cwd: sidekickRoot,
        env: {},
      },
    },
  };
  writeFileSync(join(projectPath, '.mcp.json'), JSON.stringify(config, null, 2) + '\n');
}

export async function projectRoutes(app: FastifyInstance) {
  // Vault lock guard
  app.addHook('preHandler', async (_req, reply) => {
    try {
      app.vault.requireKey();
    } catch {
      return reply.status(403).send({ error: 'Vault is locked' });
    }
  });

  // GET /projects
  app.get('/projects', async () => {
    const projects = app.db
      .prepare(
        `SELECT p.*,
          (SELECT COUNT(*) FROM environments WHERE project_id = p.id) as environmentCount,
          (SELECT COUNT(*) FROM secrets s JOIN environments e ON s.environment_id = e.id WHERE e.project_id = p.id) as secretCount
        FROM projects p
        WHERE p.archived = 0
        ORDER BY p.sort_order, p.name`
      )
      .all() as any[];

    return projects.map((p) => ({
      ...p,
      stack: JSON.parse(p.stack),
      start_commands: JSON.parse(p.start_commands),
      archived: Boolean(p.archived),
      enable_terminal: Boolean(p.enable_terminal),
      enable_vscode: Boolean(p.enable_vscode),
      enable_browser: Boolean(p.enable_browser),
    }));
  });

  // GET /projects/:id
  app.get<{ Params: { id: string } }>('/projects/:id', async (req, reply) => {
    const project = app.db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) as any;
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    const environments = app.db
      .prepare(
        `SELECT e.*,
          (SELECT COUNT(*) FROM secrets WHERE environment_id = e.id) as secretCount
        FROM environments e
        WHERE e.project_id = ?
        ORDER BY e.sort_order`
      )
      .all(project.id);

    return {
      ...project,
      stack: JSON.parse(project.stack),
      start_commands: JSON.parse(project.start_commands),
      archived: Boolean(project.archived),
      enable_terminal: Boolean(project.enable_terminal),
      enable_vscode: Boolean(project.enable_vscode),
      enable_browser: Boolean(project.enable_browser),
      environments,
    };
  });

  // POST /projects
  app.post<{
    Body: {
      name: string;
      description?: string;
      icon?: string;
      color?: string;
      path?: string;
      start_commands?: { name: string; command: string; path?: string }[];
      dev_url?: string;
      default_environment?: string;
      enable_terminal?: boolean;
      enable_vscode?: boolean;
      enable_browser?: boolean;
      stack?: string[];
    };
  }>('/projects', async (req, reply) => {
    const {
      name,
      description,
      icon,
      color,
      path,
      start_commands,
      dev_url,
      default_environment,
      enable_terminal,
      enable_vscode,
      enable_browser,
      stack,
    } = req.body;

    const id = newId();
    try {
      app.db
        .prepare(
          `INSERT INTO projects (id, name, description, icon, color, path, start_commands, dev_url, default_environment, enable_terminal, enable_vscode, enable_browser, stack)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          name,
          description ?? '',
          icon ?? '',
          color ?? '#6366f1',
          path ?? '',
          JSON.stringify(start_commands ?? []),
          dev_url ?? '',
          default_environment ?? 'dev',
          enable_terminal !== false ? 1 : 0,
          enable_vscode !== false ? 1 : 0,
          enable_browser === true ? 1 : 0,
          JSON.stringify(stack ?? [])
        );
    } catch (err: any) {
      if (err.message?.includes('UNIQUE')) {
        return reply.status(409).send({ error: 'Project name already exists' });
      }
      throw err;
    }

    // Create default environments
    const defaultEnvs = JSON.parse(
      getConfig(app.db, 'default_environments') ?? '["Dev","Staging","Prod"]'
    );
    for (let i = 0; i < defaultEnvs.length; i++) {
      const envName = defaultEnvs[i];
      app.db
        .prepare(
          'INSERT INTO environments (id, project_id, name, slug, sort_order) VALUES (?, ?, ?, ?, ?)'
        )
        .run(newId(), id, envName, envName.toLowerCase(), i);
    }

    logAudit(app.db, 'created', 'project', id, name, { path, stack });

    // Auto-write .mcp.json so Claude Code discovers Sidekick in this project
    if (path) writeMcpConfig(path);

    const project = app.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    return {
      ...project,
      stack: JSON.parse(project.stack),
      start_commands: JSON.parse(project.start_commands),
    };
  });

  // PUT /projects/:id
  app.put<{ Params: { id: string }; Body: Record<string, any> }>(
    '/projects/:id',
    async (req, reply) => {
      const project = app.db
        .prepare('SELECT * FROM projects WHERE id = ?')
        .get(req.params.id) as any;
      if (!project) return reply.status(404).send({ error: 'Project not found' });

      const allowedFields = [
        'name',
        'description',
        'icon',
        'icon_path',
        'color',
        'path',
        'start_commands',
        'dev_url',
        'default_environment',
        'enable_terminal',
        'enable_vscode',
        'enable_browser',
        'stack',
        'sort_order',
      ];

      const sets: string[] = [];
      const values: any[] = [];

      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          let value = req.body[field];
          if (field === 'stack' || field === 'start_commands') value = JSON.stringify(value);
          if (
            field === 'enable_terminal' ||
            field === 'enable_vscode' ||
            field === 'enable_browser'
          )
            value = value ? 1 : 0;
          sets.push(`${field} = ?`);
          values.push(value);
        }
      }

      if (sets.length === 0) return reply.status(400).send({ error: 'No fields to update' });

      sets.push("updated_at = datetime('now')");
      values.push(req.params.id);

      app.db.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).run(...values);

      logAudit(app.db, 'updated', 'project', project.id, req.body.name ?? project.name, {
        fields: Object.keys(req.body),
      });

      // If path was set/changed, write .mcp.json
      if (req.body.path) writeMcpConfig(req.body.path);

      const updated = app.db
        .prepare('SELECT * FROM projects WHERE id = ?')
        .get(req.params.id) as any;
      return {
        ...updated,
        stack: JSON.parse(updated.stack),
        start_commands: JSON.parse(updated.start_commands),
      };
    }
  );

  // DELETE /projects/:id (soft delete)
  app.delete<{ Params: { id: string } }>('/projects/:id', async (req, reply) => {
    const project = app.db
      .prepare('SELECT * FROM projects WHERE id = ?')
      .get(req.params.id) as any;
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    app.db
      .prepare("UPDATE projects SET archived = 1, updated_at = datetime('now') WHERE id = ?")
      .run(req.params.id);
    logAudit(app.db, 'archived', 'project', project.id, project.name, {});
    return { success: true };
  });

  // POST /projects/:id/duplicate
  app.post<{ Params: { id: string } }>('/projects/:id/duplicate', async (req, reply) => {
    const source = app.db
      .prepare('SELECT * FROM projects WHERE id = ? AND archived = 0')
      .get(req.params.id) as any;
    if (!source) return reply.status(404).send({ error: 'Project not found' });

    // Generate a unique copy name: "Name (Copy)", "Name (Copy 2)", etc.
    let copyName = `${source.name} (Copy)`;
    let suffix = 2;
    while (app.db.prepare('SELECT id FROM projects WHERE name = ?').get(copyName)) {
      copyName = `${source.name} (Copy ${suffix})`;
      suffix++;
    }

    const vaultKey = app.vault.requireKey();
    const newProjectId = newId();

    // Fetch source environments
    const sourceEnvs = app.db
      .prepare('SELECT * FROM environments WHERE project_id = ? ORDER BY sort_order')
      .all(source.id) as any[];

    app.db.transaction(() => {
      // Insert the new project row, clearing supabase token fields
      app.db
        .prepare(
          `INSERT INTO projects
            (id, name, description, icon, color, path, start_commands, dev_url,
             default_environment, enable_terminal, enable_vscode, enable_browser,
             stack, sort_order, icon_path,
             supabase_project_ref, supabase_last_sync,
             supabase_token_encrypted, supabase_token_iv, supabase_token_auth_tag)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', NULL, NULL, NULL, NULL)`
        )
        .run(
          newProjectId,
          copyName,
          source.description ?? '',
          source.icon ?? '',
          source.color ?? '#6366f1',
          source.path ?? '',
          source.start_commands ?? '[]',
          source.dev_url ?? '',
          source.default_environment ?? 'dev',
          source.enable_terminal,
          source.enable_vscode,
          source.enable_browser,
          source.stack ?? '[]',
          source.sort_order,
          source.icon_path ?? ''
        );

      // Copy environments and their secrets
      for (const env of sourceEnvs) {
        const newEnvId = newId();
        app.db
          .prepare(
            'INSERT INTO environments (id, project_id, name, slug, sort_order) VALUES (?, ?, ?, ?, ?)'
          )
          .run(newEnvId, newProjectId, env.name, env.slug, env.sort_order);

        // Copy secrets: decrypt then re-encrypt with fresh IV
        const secrets = app.db
          .prepare('SELECT * FROM secrets WHERE environment_id = ?')
          .all(env.id) as any[];

        for (const secret of secrets) {
          const plaintext = decrypt(
            { ciphertext: secret.value_encrypted, iv: secret.iv, authTag: secret.auth_tag },
            vaultKey
          );
          const { ciphertext, iv, authTag } = encrypt(plaintext, vaultKey);
          app.db
            .prepare(
              `INSERT INTO secrets
                (id, environment_id, key, value_encrypted, iv, auth_tag, type, notes, source)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .run(
              newId(),
              newEnvId,
              secret.key,
              ciphertext,
              iv,
              authTag,
              secret.type ?? 'generic',
              secret.notes ?? '',
              secret.source ?? 'manual'
            );
        }
      }
    })();

    logAudit(app.db, 'duplicated', 'project', newProjectId, copyName, {
      sourceId: source.id,
      sourceName: source.name,
    });

    // Return the new project in the same shape as GET /projects/:id
    const newProject = app.db.prepare('SELECT * FROM projects WHERE id = ?').get(newProjectId) as any;
    const environments = app.db
      .prepare(
        `SELECT e.*,
          (SELECT COUNT(*) FROM secrets WHERE environment_id = e.id) as secretCount
        FROM environments e
        WHERE e.project_id = ?
        ORDER BY e.sort_order`
      )
      .all(newProjectId);

    return reply.status(201).send({
      ...newProject,
      stack: JSON.parse(newProject.stack),
      start_commands: JSON.parse(newProject.start_commands),
      archived: Boolean(newProject.archived),
      enable_terminal: Boolean(newProject.enable_terminal),
      enable_vscode: Boolean(newProject.enable_vscode),
      enable_browser: Boolean(newProject.enable_browser),
      environments,
    });
  });

  // POST /projects/:id/icon — upload project icon image
  app.post<{ Params: { id: string } }>(
    '/projects/:id/icon',
    async (req, reply) => {
      const project = app.db
        .prepare('SELECT * FROM projects WHERE id = ?')
        .get(req.params.id) as any;
      if (!project) return reply.status(404).send({ error: 'Project not found' });

      const data = await (req as any).file();
      if (!data) return reply.status(400).send({ error: 'No file uploaded' });

      const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
      if (!allowed.includes(data.mimetype)) {
        return reply.status(400).send({ error: 'Only PNG, JPEG, WebP, and SVG images are allowed' });
      }

      // Save to app data directory
      const iconsDir = join(homedir(), 'Library', 'Application Support', 'Sidekick', 'icons');
      if (!existsSync(iconsDir)) mkdirSync(iconsDir, { recursive: true });

      const ext = data.mimetype.split('/')[1].replace('svg+xml', 'svg').replace('jpeg', 'jpg');
      const filename = `${req.params.id}.${ext}`;
      const filepath = join(iconsDir, filename);

      const chunks: Buffer[] = [];
      for await (const chunk of data.file) {
        chunks.push(chunk);
      }
      writeFileSync(filepath, Buffer.concat(chunks));

      // Update database
      app.db
        .prepare("UPDATE projects SET icon_path = ?, updated_at = datetime('now') WHERE id = ?")
        .run(filepath, req.params.id);

      logAudit(app.db, 'icon_uploaded', 'project', project.id, project.name, { filename });

      return { success: true, icon_path: filepath };
    }
  );

  // GET /projects/icon/:filename — serve project icon images
  app.get<{ Params: { filename: string } }>(
    '/projects/icon/:filename',
    { preHandler: [] }, // skip vault lock check for static assets
    async (req, reply) => {
      const iconsDir = join(homedir(), 'Library', 'Application Support', 'Sidekick', 'icons');
      const filepath = join(iconsDir, req.params.filename);

      if (!existsSync(filepath)) {
        return reply.status(404).send({ error: 'Icon not found' });
      }

      const ext = req.params.filename.split('.').pop()?.toLowerCase();
      const mimeMap: Record<string, string> = {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        webp: 'image/webp',
        svg: 'image/svg+xml',
      };

      const { readFileSync } = await import('node:fs');
      const content = readFileSync(filepath);
      return reply
        .type(mimeMap[ext ?? ''] ?? 'application/octet-stream')
        .send(content);
    }
  );

  // POST /projects/connect-all — write .mcp.json to all project directories
  app.post('/projects/connect-all', async () => {
    const projects = app.db
      .prepare("SELECT name, path FROM projects WHERE archived = 0 AND path != ''")
      .all() as { name: string; path: string }[];

    const results: { name: string; path: string; status: string }[] = [];
    for (const p of projects) {
      if (!existsSync(p.path)) {
        results.push({ name: p.name, path: p.path, status: 'skipped (directory not found)' });
        continue;
      }
      writeMcpConfig(p.path);
      results.push({ name: p.name, path: p.path, status: 'connected' });
    }
    return { connected: results.filter((r) => r.status === 'connected').length, results };
  });

  // --- Environment routes ---

  // GET /projects/:projectId/environments
  app.get<{ Params: { projectId: string } }>(
    '/projects/:projectId/environments',
    async (req) => {
      return app.db
        .prepare(
          `SELECT e.*,
            (SELECT COUNT(*) FROM secrets WHERE environment_id = e.id) as secretCount
          FROM environments e
          WHERE e.project_id = ?
          ORDER BY e.sort_order`
        )
        .all(req.params.projectId);
    }
  );

  // POST /projects/:projectId/environments
  app.post<{ Params: { projectId: string }; Body: { name: string; slug: string } }>(
    '/projects/:projectId/environments',
    async (req, reply) => {
      const project = app.db
        .prepare('SELECT id FROM projects WHERE id = ?')
        .get(req.params.projectId);
      if (!project) return reply.status(404).send({ error: 'Project not found' });

      const { name, slug } = req.body;
      const id = newId();
      const maxOrder = app.db
        .prepare(
          'SELECT MAX(sort_order) as max FROM environments WHERE project_id = ?'
        )
        .get(req.params.projectId) as { max: number | null };

      try {
        app.db
          .prepare(
            'INSERT INTO environments (id, project_id, name, slug, sort_order) VALUES (?, ?, ?, ?, ?)'
          )
          .run(id, req.params.projectId, name, slug, (maxOrder.max ?? -1) + 1);
      } catch (err: any) {
        if (err.message?.includes('UNIQUE')) {
          return reply
            .status(409)
            .send({ error: `Environment slug "${slug}" already exists` });
        }
        throw err;
      }

      logAudit(app.db, 'created', 'environment', id, name, {
        projectId: req.params.projectId,
      });
      return app.db.prepare('SELECT * FROM environments WHERE id = ?').get(id);
    }
  );

  // PUT /environments/:id
  app.put<{ Params: { id: string }; Body: { name?: string; slug?: string } }>(
    '/environments/:id',
    async (req, reply) => {
      const env = app.db
        .prepare('SELECT * FROM environments WHERE id = ?')
        .get(req.params.id) as any;
      if (!env) return reply.status(404).send({ error: 'Environment not found' });

      const { name, slug } = req.body;
      if (name)
        app.db
          .prepare('UPDATE environments SET name = ? WHERE id = ?')
          .run(name, req.params.id);
      if (slug)
        app.db
          .prepare('UPDATE environments SET slug = ? WHERE id = ?')
          .run(slug, req.params.id);

      logAudit(app.db, 'updated', 'environment', env.id, name ?? env.name, {});
      return app.db.prepare('SELECT * FROM environments WHERE id = ?').get(req.params.id);
    }
  );

  // DELETE /environments/:id
  app.delete<{ Params: { id: string } }>('/environments/:id', async (req, reply) => {
    const env = app.db
      .prepare('SELECT * FROM environments WHERE id = ?')
      .get(req.params.id) as any;
    if (!env) return reply.status(404).send({ error: 'Environment not found' });

    const count = app.db
      .prepare('SELECT COUNT(*) as count FROM environments WHERE project_id = ?')
      .get(env.project_id) as { count: number };
    if (count.count <= 1) {
      return reply.status(400).send({ error: 'Cannot delete the last environment' });
    }

    app.db.prepare('DELETE FROM environments WHERE id = ?').run(req.params.id);
    logAudit(app.db, 'deleted', 'environment', env.id, env.name, {
      projectId: env.project_id,
    });
    return { success: true };
  });

  // GET /activity
  app.get('/activity', async () => {
    return app.db
      .prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 50')
      .all();
  });
}
