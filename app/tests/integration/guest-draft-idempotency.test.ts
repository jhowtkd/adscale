/**
 * Draft-key idempotency against the real migrated schema.
 *
 * Scope note: server modules (`server-only`) cannot be imported in vitest, so
 * this file cannot execute the repository function itself. Instead it proves
 * the database contract the repository relies on, using the exact same SQL
 * pattern (insert … on conflict do nothing returning + select back by
 * workspace/user/key): the unique index exists, retries return the same row,
 * and other scopes stay isolated. The repository + API path is proven by the
 * S8 E2E double-import scenario against the running app.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

type DraftRow = { id: string; request: string; tool_kind: string; client_profile_id: string };

/** Mirrors createCreativeWorkDraft: insert-or-nothing plus select-back. */
async function insertDraft(pool: Pool, input: {
  workspaceId: string; userId: string; clientProfileId: string; draftKey: string;
}): Promise<{ row: DraftRow; created: boolean }> {
  const { rows: [created] } = await pool.query<DraftRow>(
    `insert into adscale_app.creative_work_items
       (workspace_id, client_profile_id, created_by_user_id, draft_key, tool_kind, title, request, format, settings, status)
     values ($1, $2, $3, $4, 'single', 'title', 'request', '4:5', $5, 'draft')
     on conflict do nothing
     returning id, request, tool_kind, client_profile_id`,
    [input.workspaceId, input.clientProfileId, input.userId, input.draftKey,
      JSON.stringify({ targetFormats: ['1:1', '9:16'] })],
  );
  if (created) return { row: created, created: true };
  const { rows: [existing] } = await pool.query<DraftRow>(
    `select id, request, tool_kind, client_profile_id from adscale_app.creative_work_items
     where workspace_id = $1 and created_by_user_id = $2 and draft_key = $3 limit 1`,
    [input.workspaceId, input.userId, input.draftKey],
  );
  if (!existing) throw new Error('creative_work_draft_conflict_without_row');
  return { row: existing, created: false };
}

const describeWithDb = DATABASE_URL ? describe : describe.skip;

describeWithDb('guest draft key idempotency (real database)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const workspaces: string[] = [];
  const users: string[] = [];

  async function ensureScope(input: { workspaceId: string; userId: string; clientProfileId: string }) {
    await pool.query(
      'insert into adscale_app."user" (id, name, email) values ($1, $2, $3) on conflict (id) do nothing',
      [input.userId, 'Guest Test', `${input.userId}@example.com`],
    );
    await pool.query(
      'insert into adscale_app.workspaces (id, name, slug) values ($1, $2, $3) on conflict (id) do nothing',
      [input.workspaceId, 'Guest Test', `guest-${input.workspaceId}`],
    );
    await pool.query(
      'insert into adscale_app.client_profiles (id, workspace_id, name) values ($1, $2, $3) on conflict (id) do nothing',
      [input.clientProfileId, input.workspaceId, 'Guest Brand'],
    );
    workspaces.push(input.workspaceId);
    users.push(input.userId);
  }

  beforeAll(async () => {
    await pool.query('select 1');
  });

  afterAll(async () => {
    if (workspaces.length > 0) {
      await pool.query('delete from adscale_app.creative_work_items where workspace_id = any($1)', [workspaces]);
      await pool.query('delete from adscale_app.client_profiles where workspace_id = any($1)', [workspaces]);
      await pool.query('delete from adscale_app.workspaces where id = any($1)', [workspaces]);
    }
    if (users.length > 0) {
      await pool.query('delete from adscale_app."user" where id = any($1)', [users]);
    }
    await pool.end();
  });

  async function scopedDraft(overrides: Partial<{ workspaceId: string; userId: string; clientProfileId: string; draftKey: string }> = {}) {
    const input = {
      workspaceId: overrides.workspaceId ?? randomUUID(),
      userId: overrides.userId ?? `user-${randomUUID()}`,
      clientProfileId: overrides.clientProfileId ?? randomUUID(),
      draftKey: overrides.draftKey ?? randomUUID(),
    };
    await ensureScope(input);
    return insertDraft(pool, input);
  }

  it('same key twice returns the same row without duplicating', async () => {
    const workspaceId = randomUUID();
    const userId = `user-${randomUUID()}`;
    const clientProfileId = randomUUID();
    const draftKey = randomUUID();
    await ensureScope({ workspaceId, userId, clientProfileId });
    const first = await insertDraft(pool, { workspaceId, userId, clientProfileId, draftKey });
    const second = await insertDraft(pool, { workspaceId, userId, clientProfileId, draftKey });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.row.id).toBe(first.row.id);
    const { rows } = await pool.query(
      'select count(*)::int as n from adscale_app.creative_work_items where workspace_id = $1 and draft_key = $2',
      [workspaceId, draftKey],
    );
    expect(rows[0].n).toBe(1);
  });

  it('same key in another workspace creates an isolated row', async () => {
    const draftKey = randomUUID();
    const userId = `user-${randomUUID()}`;
    const first = await scopedDraft({ userId, draftKey });
    const second = await scopedDraft({ userId, draftKey });
    expect(second.created).toBe(true);
    expect(second.row.id).not.toBe(first.row.id);
  });

  it('same key for another user creates an isolated row', async () => {
    const draftKey = randomUUID();
    const workspaceId = randomUUID();
    const first = await scopedDraft({ workspaceId, draftKey });
    const second = await scopedDraft({ workspaceId, draftKey });
    expect(second.created).toBe(true);
    expect(second.row.id).not.toBe(first.row.id);
  });

  it('same scope and key returns the original row even for another brand', async () => {
    const workspaceId = randomUUID();
    const userId = `user-${randomUUID()}`;
    const draftKey = randomUUID();
    const first = await scopedDraft({ workspaceId, userId, draftKey });
    const second = await scopedDraft({ workspaceId, userId, draftKey });
    // Same row wins: this is why the import adapter must verify identity
    // after the write instead of trusting the returned row blindly.
    expect(second.created).toBe(false);
    expect(second.row.id).toBe(first.row.id);
    expect(second.row.client_profile_id).toBe(first.row.client_profile_id);
  });
});
