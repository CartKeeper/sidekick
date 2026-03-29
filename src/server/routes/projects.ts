// src/server/routes/projects.ts
import type { FastifyInstance } from 'fastify';
import { newId, getConfig, logAudit } from '../../core/db.js';

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
