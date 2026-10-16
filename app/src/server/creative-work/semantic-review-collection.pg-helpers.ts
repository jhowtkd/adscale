/**
 * Helpers for semantic-review-collection.pg.test.ts (#468). Test-only: real
 * Postgres at an explicit, safe TEST_DATABASE_URL; every row is synthetic.
 */
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { SYNTHETIC_CASES } from "../../../scripts/run-jev-offline";
import * as schema from "../db/schema";
import type { NewCreativeWorkItem } from "../db/schema";
import { requireJevTestDatabaseUrl } from "../../../scripts/jev-collect";

export const T0 = new Date("2026-10-01T00:00:00.000Z");
export const minutes = (base: Date, n: number) => new Date(base.getTime() + n * 60_000);
export const DAY_MS = 86_400_000;

/** Single guard shared with the CLI: explicit, loopback, `*_test`, no query/hash overrides. */
export function assertSafeTestDatabaseUrl(url: string | undefined): string {
  return requireJevTestDatabaseUrl(url);
}

type SyntheticWork = {
  request: string;
  brief: NewCreativeWorkItem["brief"];
  format: NewCreativeWorkItem["format"];
  settings: NewCreativeWorkItem["settings"];
  inputSnapshot: { request: string; factPack: { identity: { clientProfileId: string } } } & Record<string, unknown>;
  copy: { headline: string; body: string; cta: string };
};

export type TestDb = NodePgDatabase<typeof schema>;
export type Scope = { userId: string; workspaceId: string; brandIds: string[] };

export async function openTestDatabase(url: string): Promise<{ db: TestDb; pool: Pool }> {
  const pool = new Pool({ connectionString: url, max: 5 });
  const db = drizzle(pool, { schema });
  const { rows } = await pool.query("select current_database() as name");
  if (rows[0].name !== new URL(url).pathname.slice(1)) throw new Error("test_database_name_mismatch");
  return { db, pool };
}

let seq = 0;
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export async function createScope(db: TestDb, brands = 1): Promise<Scope> {
  seq += 1;
  const tag = `jev468-${RUN}-${seq}`;
  const userId = `user-${tag}`;
  await db.insert(schema.user).values({ id: userId, name: "Jev 468", email: `${tag}@example.com`, emailVerified: true });
  const [workspace] = await db.insert(schema.workspaces).values({ name: tag, slug: tag }).returning();
  const brandIds: string[] = [];
  for (let i = 0; i < brands; i += 1) {
    const [brand] = await db.insert(schema.clientProfiles).values({ workspaceId: workspace.id, name: `${tag}-b${i}` }).returning();
    brandIds.push(brand.id);
  }
  return { userId, workspaceId: workspace.id, brandIds };
}

export async function deleteScopes(db: TestDb, scopes: Scope[]) {
  if (!scopes.length) return;
  await db.delete(schema.workspaces).where(inArray(schema.workspaces.id, scopes.map((s) => s.workspaceId)));
  await db.delete(schema.user).where(inArray(schema.user.id, scopes.map((s) => s.userId)));
}

export type WorkOptions = {
  caseIndex?: number;
  brandIndex?: number;
  updatedAt: Date;
  toolKind?: string;
  training?: boolean;
  staleSnapshot?: boolean;
  headline?: string;
};

/** A persisted-shape work built from the offline synthetic corpus, rebound to real ids. */
export function workRow(scope: Scope, options: WorkOptions & { trainingSessionId?: string }) {
  const base = structuredClone(SYNTHETIC_CASES[options.caseIndex ?? 0].work) as SyntheticWork;
  const clientProfileId = scope.brandIds[options.brandIndex ?? 0];
  base.inputSnapshot.factPack.identity.clientProfileId = clientProfileId;
  if (options.staleSnapshot) base.inputSnapshot.request = "older synthetic request";
  if (options.headline) base.copy.headline = options.headline;
  return {
    id: randomUUID(),
    workspaceId: scope.workspaceId,
    clientProfileId,
    createdByUserId: scope.userId,
    title: "synthetic jev work",
    request: base.request,
    toolKind: (options.toolKind ?? "single") as never,
    status: "draft" as const,
    brief: base.brief,
    format: base.format,
    settings: base.settings,
    inputSnapshot: base.inputSnapshot as unknown as NewCreativeWorkItem["inputSnapshot"],
    copy: base.copy,
    trainingSessionId: options.trainingSessionId ?? null,
    trainingRound: options.trainingSessionId ? 1 : null,
    trainingSlot: options.trainingSessionId ? 1 : null,
    updatedAt: options.updatedAt,
  };
}

export async function insertWorks(db: TestDb, scope: Scope, count: number, options: WorkOptions): Promise<string[]> {
  const ids: string[] = [];
  let trainingSessionId: string | undefined;
  if (options.training) {
    const [session] = await db.insert(schema.brandTrainingSessions).values({
      workspaceId: scope.workspaceId,
      clientProfileId: scope.brandIds[options.brandIndex ?? 0],
      createdByUserId: scope.userId,
      status: "archived",
      candidate: {} as never,
    }).returning();
    trainingSessionId = session.id;
  }
  for (let start = 0; start < count; start += 500) {
    const rows = Array.from({ length: Math.min(500, count - start) }, () => workRow(scope, { ...options, trainingSessionId }));
    await db.insert(schema.creativeWorkItems).values(rows);
    ids.push(...rows.map((row) => row.id));
  }
  return ids;
}

export async function workSnapshot(db: TestDb, workId: string) {
  const [row] = await db.select().from(schema.creativeWorkItems).where(eq(schema.creativeWorkItems.id, workId));
  return JSON.stringify(row);
}

/** Authorization-shaped synthetic policy input; callers override what they test. */
export function policyInput(scope: Scope, versions: Record<string, string>, overrides: Record<string, unknown> = {}) {
  return {
    workspaceId: scope.workspaceId,
    clientProfileIds: [...scope.brandIds],
    authorizationReference: "https://example.com/authorizations/synthetic-468",
    authorizedBy: "synthetic-owner",
    authorizedAt: T0,
    expiresAt: new Date(T0.getTime() + 14 * DAY_MS),
    provider: "typesafe",
    purpose: "prepared_work_semantic_review",
    dataOrigin: "synthetic",
    samplePercent: 100,
    dailyAttemptLimit: 100,
    ...versions,
    ...overrides,
  };
}
