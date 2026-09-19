/**
 * trace-397: alert queries against real Postgres.
 *
 * Seeds journal rows plus canonical outputs in an isolated window and
 * workspace, asserts the alert queries return the expected cohorts, feeds
 * the rows through the pure evaluators, and verifies the queries are
 * read-only (row counts unchanged). Skips without an explicit test
 * database; pure evaluation lives in alerts.test.ts.
 *
 * Requires a migrated test database (migration 0107 + 0081 terminal_at):
 *   DATABASE_URL=postgres://test:test@localhost:5433/adscale_test npm test -- src/server/diagnostics/alerts.pg.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

const TEST_DB_EXPLICITLY_CONFIGURED = Boolean(
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL,
);

import { db } from "../db";
import {
  clientProfiles,
  creativeWorkItems,
  creativeWorkOutputs,
  diagnosticEvents,
  user,
  workspaces,
} from "../db/schema";
import {
  evaluateMissingExpectedEvents,
  evaluateStalledOperations,
  evaluateTerminalFailureRate,
  queryFunnelComparison,
  queryStalledOperationSamples,
  queryTerminalCohortSamples,
  type DiagnosticAlertCohort,
} from "./alerts";

const RUN_ID = `397-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let seq = 0;
const createdWorkspaceIds: string[] = [];
const createdUserIds: string[] = [];

/** Isolated window (2024): no other fixture writes terminal rows here. */
const WINDOW_SINCE = new Date("2024-04-04T00:00:00.000Z");
const WINDOW_UNTIL = new Date("2024-04-04T02:00:00.000Z");
const WINDOW_MID = new Date("2024-04-04T01:00:00.000Z");

/**
 * Deployment cohort for the stalled/funnel queries: labels the evaluating
 * test deployment. The seeds deliberately span dataOrigins (test +
 * synthetic) to prove per-row cohort grouping elsewhere; the
 * deployment-scoped queries count workspace-wide and must never be read
 * as per-cohort claims.
 */
const DEPLOYMENT_COHORT: DiagnosticAlertCohort = {
  protocol: "single",
  environment: "test",
  dataOrigin: "test",
};

type Scope = {
  userId: string;
  workspaceId: string;
  clientProfileId: string;
  workItemId: string;
};

let scope: Scope | null = null;

function nextTag(): string {
  seq += 1;
  return `${RUN_ID}-${seq}`;
}

async function createScope(): Promise<Scope> {
  const name = `d-${nextTag()}`.slice(0, 60);
  const userId = `user-${name}`;
  await db.insert(user).values({
    id: userId,
    name: "Diagnostics Alerts",
    email: `${name}@example.com`,
    emailVerified: true,
  });
  const [workspace] = await db
    .insert(workspaces)
    .values({ name, slug: name })
    .returning();
  if (!workspace) throw new Error("[alerts.pg] workspace insert returned no row");
  const [profile] = await db
    .insert(clientProfiles)
    .values({ workspaceId: workspace.id, name })
    .returning();
  if (!profile) throw new Error("[alerts.pg] profile insert returned no row");
  const [work] = await db
    .insert(creativeWorkItems)
    .values({
      workspaceId: workspace.id,
      clientProfileId: profile.id,
      createdByUserId: userId,
      title: "Peça única de teste dos alertas",
      request: "alertas de rastreabilidade",
      toolKind: "single",
      status: "draft",
      format: "4:5",
      settings: { targetFormats: [] },
    })
    .returning();
  if (!work) throw new Error("[alerts.pg] work insert returned no row");
  createdUserIds.push(userId);
  createdWorkspaceIds.push(workspace.id);
  return {
    userId,
    workspaceId: workspace.id,
    clientProfileId: profile.id,
    workItemId: work.id,
  };
}

async function seedJournalTerminals(workspaceId: string, workItemId: string): Promise<void> {
  const rows: Array<typeof diagnosticEvents.$inferInsert> = [];
  // "test" cohort: 20 completed + 5 failed — evaluable (completed >= 20)
  // and firing (25% >= 10%).
  for (let i = 0; i < 20; i += 1) {
    rows.push({
      id: `evt-397-${nextTag()}-c${i}`,
      workspaceId,
      workItemId,
      protocol: "single",
      operationId: `op-397-${RUN_ID}-c${i}`,
      event: "operation.completed",
      occurredAt: WINDOW_MID,
      recordedAt: WINDOW_MID,
      releaseSha: "test-sha",
      environment: "test",
      process: "worker",
      dataOrigin: "test",
    });
  }
  for (let i = 0; i < 5; i += 1) {
    rows.push({
      id: `evt-397-${nextTag()}-f${i}`,
      workspaceId,
      workItemId,
      protocol: "single",
      operationId: `op-397-${RUN_ID}-f${i}`,
      event: "operation.failed",
      occurredAt: WINDOW_MID,
      recordedAt: WINDOW_MID,
      releaseSha: "test-sha",
      environment: "test",
      process: "worker",
      dataOrigin: "test",
    });
  }
  // "synthetic" cohort: same workspace, separate origin — must not merge.
  for (let i = 0; i < 21; i += 1) {
    rows.push({
      id: `evt-397-${nextTag()}-s${i}`,
      workspaceId,
      workItemId,
      protocol: "single",
      operationId: `op-397-${RUN_ID}-s${i}`,
      event: "operation.completed",
      occurredAt: WINDOW_MID,
      recordedAt: WINDOW_MID,
      releaseSha: "test-sha",
      environment: "test",
      process: "worker",
      dataOrigin: "synthetic",
    });
  }
  // Outside the window: must not be counted.
  rows.push({
    id: `evt-397-${nextTag()}-outside`,
    workspaceId,
    workItemId,
    protocol: "single",
    operationId: `op-397-${RUN_ID}-outside`,
    event: "operation.failed",
    occurredAt: new Date("2024-04-05T00:00:00.000Z"),
    recordedAt: new Date("2024-04-05T00:00:00.000Z"),
    releaseSha: "test-sha",
    environment: "test",
    process: "worker",
    dataOrigin: "test",
  });
  await db.insert(diagnosticEvents).values(rows);
}

async function seedOutputs(s: Scope): Promise<{ now: Date }> {
  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const twentyMinutesAgo = new Date(now.getTime() - 20 * 60 * 1000);
  const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
  const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
  // NOTE: versionNumber differs per row: (work_item_id, creative_level,
  // target_format, version_number) carries the legacy_plan_uq unique index.
  // Stalled queued: waiting 2h against the 60-minute lease.
  await db.insert(creativeWorkOutputs).values({
    workspaceId: s.workspaceId,
    workItemId: s.workItemId,
    creativeLevel: "balanced",
    targetFormat: "4:5",
    versionNumber: 1,
    operationKey: `opk-397-${nextTag()}-stalled-queued`,
    status: "queued",
    queuedAt: twoHoursAgo,
  });
  // Stalled processing: no activity for 20m against the 10-minute lease.
  await db.insert(creativeWorkOutputs).values({
    workspaceId: s.workspaceId,
    workItemId: s.workItemId,
    creativeLevel: "balanced",
    targetFormat: "4:5",
    versionNumber: 2,
    operationKey: `opk-397-${nextTag()}-stalled-processing`,
    status: "processing",
    queuedAt: thirtyMinutesAgo,
    updatedAt: twentyMinutesAgo,
  });
  // Fresh queued: 1m old, not stalled.
  await db.insert(creativeWorkOutputs).values({
    workspaceId: s.workspaceId,
    workItemId: s.workItemId,
    creativeLevel: "balanced",
    targetFormat: "4:5",
    versionNumber: 3,
    operationKey: `opk-397-${nextTag()}-fresh`,
    status: "queued",
    queuedAt: oneMinuteAgo,
  });
  // One canonical terminal inside the isolated window for the funnel
  // comparison (against 25 + 21 = 46 journal terminals).
  await db.insert(creativeWorkOutputs).values({
    workspaceId: s.workspaceId,
    workItemId: s.workItemId,
    creativeLevel: "balanced",
    targetFormat: "4:5",
    versionNumber: 4,
    operationKey: `opk-397-${nextTag()}-terminal`,
    status: "completed",
    outputKey: `test/output-${RUN_ID}-terminal.png`,
    terminalAt: WINDOW_MID,
    updatedAt: WINDOW_MID,
  });
  return { now };
}

async function countRows(): Promise<{ events: number; outputs: number }> {
  const [eventRow] = await db
    .select({ count: sql<string>`count(*)::text` })
    .from(diagnosticEvents);
  const [outputRow] = await db
    .select({ count: sql<string>`count(*)::text` })
    .from(creativeWorkOutputs);
  return {
    events: Number.parseInt(eventRow?.count ?? "0", 10),
    outputs: Number.parseInt(outputRow?.count ?? "0", 10),
  };
}

beforeAll(async () => {
  if (!TEST_DB_EXPLICITLY_CONFIGURED) return;
  try {
    await db.execute(sql`select 1 from adscale_app.diagnostic_events limit 0`);
    await db.execute(sql`select terminal_at from adscale_app.creative_work_outputs limit 0`);
  } catch (err) {
    throw new Error(
      `[alerts.pg] Postgres de teste INACESSÍVEL ou sem as migrations 0081/0107 ` +
        `(DATABASE_URL=${process.env.DATABASE_URL ?? "(não definida)"}). ` +
        `Causa: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  scope = await createScope();
  await seedJournalTerminals(scope.workspaceId, scope.workItemId);
  await seedOutputs(scope);
});

afterAll(async () => {
  if (!TEST_DB_EXPLICITLY_CONFIGURED) return;
  await db.execute(
    sql`delete from adscale_app.diagnostic_events where id like 'evt-397-%'`,
  );
  await db.execute(
    sql`delete from adscale_app.creative_work_outputs where operation_key like 'opk-397-%'`,
  );
  if (createdWorkspaceIds.length > 0) {
    await db
      .delete(workspaces)
      .where(sql`${workspaces.id} in (${sql.join(createdWorkspaceIds.map((id) => sql`${id}::uuid`), sql`, `)})`);
  }
  if (createdUserIds.length > 0) {
    await db.delete(user).where(sql`${user.id} in (${sql.join(createdUserIds.map((id) => sql`${id}`), sql`, `)})`);
  }
});

describe.skipIf(!TEST_DB_EXPLICITLY_CONFIGURED)("alert terminal cohorts", () => {
  it("groups journal terminals by cohort within the window", async () => {
    if (!scope) throw new Error("[alerts.pg] scope not seeded");
    const samples = await queryTerminalCohortSamples({
      since: WINDOW_SINCE,
      until: WINDOW_UNTIL,
      workspaceIds: [scope.workspaceId],
    });
    expect(samples).toHaveLength(2);
    const testCohort = samples.find((sample) => sample.dataOrigin === "test");
    const syntheticCohort = samples.find((sample) => sample.dataOrigin === "synthetic");
    expect(testCohort).toMatchObject({
      protocol: "single",
      environment: "test",
      terminals: 25,
      completed: 20,
      failed: 5,
    });
    expect(syntheticCohort).toMatchObject({
      protocol: "single",
      environment: "test",
      terminals: 21,
      completed: 21,
      failed: 0,
    });
  });

  it("evaluates the seeded cohorts: test fires, synthetic stays silent", async () => {
    if (!scope) throw new Error("[alerts.pg] scope not seeded");
    const samples = await queryTerminalCohortSamples({
      since: WINDOW_SINCE,
      until: WINDOW_UNTIL,
      workspaceIds: [scope.workspaceId],
    });
    const { alerts, insufficient } = evaluateTerminalFailureRate(samples);
    expect(insufficient).toEqual([]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.cohort.dataOrigin).toBe("test");
    expect(alerts[0]?.observed.failureRate).toBe(0.25);
  });
});

describe.skipIf(!TEST_DB_EXPLICITLY_CONFIGURED)("alert stalled operations", () => {
  it("returns queued/processing ages scoped to the workspace", async () => {
    if (!scope) throw new Error("[alerts.pg] scope not seeded");
    const samples = await queryStalledOperationSamples({
      now: new Date(),
      cohort: DEPLOYMENT_COHORT,
      workspaceIds: [scope.workspaceId],
    });
    expect(samples).toHaveLength(3);
    expect(samples.every((sample) => sample.dataOrigin === "test")).toBe(true);
  });

  it("the seeded stalls fire as one aggregated cohort alert", async () => {
    if (!scope) throw new Error("[alerts.pg] scope not seeded");
    const samples = await queryStalledOperationSamples({
      now: new Date(),
      cohort: DEPLOYMENT_COHORT,
      workspaceIds: [scope.workspaceId],
    });
    const alerts = evaluateStalledOperations(samples);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      rule: "stalled_operation",
      cohort: DEPLOYMENT_COHORT,
      observed: { stalledCount: 2 },
      sampleSize: 2,
    });
    expect(alerts[0]?.observed.maxAgeMs ?? 0).toBeGreaterThan(60 * 60 * 1000);
  });
});

describe.skipIf(!TEST_DB_EXPLICITLY_CONFIGURED)("alert funnel comparison", () => {
  it("counts canonical terminals against journal terminals", async () => {
    if (!scope) throw new Error("[alerts.pg] scope not seeded");
    const funnel = await queryFunnelComparison({
      since: WINDOW_SINCE,
      until: WINDOW_UNTIL,
      cohort: DEPLOYMENT_COHORT,
      workspaceIds: [scope.workspaceId],
    });
    // One seeded canonical terminal; 46 seeded journal terminals.
    expect(funnel.canonicalTerminals).toBe(1);
    expect(funnel.journalTerminals).toBe(46);
  });

  it("a canonical-heavy window evaluates without crashing the evaluator", async () => {
    // Below minCanonicalTerminals the funnel flags insufficient — the point
    // here is the query→evaluator round trip over real rows.
    if (!scope) throw new Error("[alerts.pg] scope not seeded");
    const funnel = await queryFunnelComparison({
      since: WINDOW_SINCE,
      until: WINDOW_UNTIL,
      cohort: DEPLOYMENT_COHORT,
      workspaceIds: [scope.workspaceId],
    });
    const { alerts, insufficient } = evaluateMissingExpectedEvents([funnel]);
    expect(alerts).toEqual([]);
    expect(insufficient).toHaveLength(1);
    expect(insufficient[0]?.reason).toBe("insufficient_sample");
  });
});

describe.skipIf(!TEST_DB_EXPLICITLY_CONFIGURED)("alert queries are read-only", () => {
  it("leaves row counts unchanged", async () => {
    if (!scope) throw new Error("[alerts.pg] scope not seeded");
    const before = await countRows();
    await queryTerminalCohortSamples({
      since: WINDOW_SINCE,
      until: WINDOW_UNTIL,
      workspaceIds: [scope.workspaceId],
    });
    await queryStalledOperationSamples({
      now: new Date(),
      cohort: DEPLOYMENT_COHORT,
      workspaceIds: [scope.workspaceId],
    });
    await queryFunnelComparison({
      since: WINDOW_SINCE,
      until: WINDOW_UNTIL,
      cohort: DEPLOYMENT_COHORT,
      workspaceIds: [scope.workspaceId],
    });
    const after = await countRows();
    expect(after).toEqual(before);
  });
});
