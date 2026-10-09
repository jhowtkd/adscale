// Postgres harness for the free-account suites: INDEPENDENT pools (each one is a
// separate "process"), seeding, and pg_locks probes for deterministic barriers.
// Import only AFTER DATABASE_URL was routed to the test database (see callers).

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, sql } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import * as equipeSchema from "@/server/db/equipe-schema";
import { createPostgresEquipeUnitOfWork } from "../../data/postgres";
import { fixedClock } from "../../domain";
import { FakeAdscaleGateway } from "./fakes";
import type { EquipeModuleDeps } from "../ports";

export type FreePgHarness = ReturnType<typeof openPool>;

export function assertTestDatabase(url: string | null): asserts url is string {
  if (!url || !new URL(url).pathname.slice(1).endsWith("_test")) throw new Error("free_pg_unsafe_database");
}

export function openPool(url: string) {
  const pool = new Pool({ connectionString: url, max: 6 });
  const db = drizzle(pool, { schema: { ...schema, ...equipeSchema } });
  return { pool, db };
}

/** Verifies the effective database name before any write. */
export async function assertEffectiveDatabase(h: FreePgHarness, url: string) {
  const [{ name }] = (await h.db.execute(sql`select current_database() as name`)).rows as { name: string }[];
  if (name !== new URL(url).pathname.slice(1) || !name.endsWith("_test")) throw new Error("free_pg_database_mismatch");
}

export function depsFor(h: FreePgHarness, now = new Date("2026-10-15T15:00:00.000Z"), extra: Partial<EquipeModuleDeps> = {}): EquipeModuleDeps {
  return { uow: createPostgresEquipeUnitOfWork(h.db), clock: fixedClock(now), gateway: new FakeAdscaleGateway(),
    notifier: undefined as never, agents: undefined as never, publisher: undefined as never,
    isPublishEnabled: () => true, ...extra } as EquipeModuleDeps;
}

let seq = 0;
export async function seedWorkspace(h: FreePgHarness, options: { verified?: boolean; member?: boolean; role?: string } = {}) {
  seq += 1;
  const tag = `free-${Date.now().toString(36)}-${seq}-${Math.random().toString(36).slice(2, 8)}`;
  const userId = `user-${tag}`;
  await h.db.insert(schema.user).values({ id: userId, name: "Ana Free", email: `${tag}@example.com`, emailVerified: options.verified ?? true });
  const [workspace] = await h.db.insert(schema.workspaces).values({ name: tag, slug: tag }).returning();
  if (options.member ?? true) await h.db.insert(schema.workspaceMembers).values({ workspaceId: workspace!.id, userId, role: options.role ?? "owner" });
  return { workspaceId: workspace!.id, userId, tag };
}

/** Adds one more user (default: verified guest) to an existing workspace. */
export async function seedExtraMember(h: FreePgHarness, workspaceId: string,
  options: { role?: string; verified?: boolean; createdAt?: Date } = {}) {
  seq += 1;
  const tag = `free-x-${Date.now().toString(36)}-${seq}-${Math.random().toString(36).slice(2, 8)}`;
  const userId = `user-${tag}`;
  await h.db.insert(schema.user).values({ id: userId, name: `Extra ${tag}`, email: `${tag}@example.com`, emailVerified: options.verified ?? true });
  await h.db.insert(schema.workspaceMembers).values({ workspaceId, userId, role: options.role ?? "member",
    ...(options.createdAt ? { createdAt: options.createdAt } : {}) });
  return { userId };
}

export async function cleanup(h: FreePgHarness, workspaceIds: string[], userIds: string[]) {
  for (const id of workspaceIds.splice(0)) await h.db.delete(schema.workspaces).where(eq(schema.workspaces.id, id));
  for (const id of userIds.splice(0)) await h.db.delete(schema.user).where(eq(schema.user.id, id));
}

/** Backends WAITING (not granted) on the advisory lock derived from `key` (hashtextextended(key, 0)). */
export async function waitingOnAdvisoryKey(h: FreePgHarness, key: string): Promise<number> {
  const r = await h.db.execute(sql`select count(*)::int as n from pg_locks
    where locktype = 'advisory' and not granted and ((classid::bigint << 32) | objid::bigint) = hashtextextended(${key}, 0)`);
  return (r.rows[0] as { n: number }).n;
}

/** Sessions currently HOLDING that advisory lock. */
export async function holdingAdvisoryKey(h: FreePgHarness, key: string): Promise<number> {
  const r = await h.db.execute(sql`select count(*)::int as n from pg_locks
    where locktype = 'advisory' and granted and ((classid::bigint << 32) | objid::bigint) = hashtextextended(${key}, 0)`);
  return (r.rows[0] as { n: number }).n;
}

export async function waitUntil(predicate: () => Promise<boolean>, what: string, timeoutMs = 10_000) {
  const start = Date.now();
  while (!(await predicate())) {
    if (Date.now() - start > timeoutMs) throw new Error(`waitUntil timeout: ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

export function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
