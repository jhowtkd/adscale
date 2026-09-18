/**
 * trace-392: read-only diagnostics API against real Postgres.
 *
 * Works listing (filters/sort/cursor), Trabalho detail composition
 * (canonical + journal in parallel, index failure degrades telemetry),
 * call resolution + audited content reads (allow/deny/disclose), and
 * link building from stored external refs. Skips without an explicit
 * test database; pure composition lives in diagnostics-api.test.ts.
 *
 * Requires a migrated test database (migration 0107):
 *   TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test npm test -- src/server/diagnostics/diagnostics-api.pg.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";

const TEST_DB_EXPLICITLY_CONFIGURED = Boolean(
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL,
);

import { db } from "../db";
import {
  clientProfiles,
  creativeWorkItems,
  creativeWorkOutputs,
  diagnosticAccessAudit,
  diagnosticEvents,
  user,
  workspaces,
} from "../db/schema";
import type { DiagnosticDatabase } from "./journal";
import {
  getDiagnosticCall,
  getWorkDiagnostics,
  listDiagnosticWorks,
  type DiagnosticCallResult,
  type GetDiagnosticCallResult,
  type WorkDiagnosticsResult,
} from "./diagnostics-api";

const RUN_ID = `392-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let seq = 0;
const createdWorkspaceIds: string[] = [];
const createdUserIds: string[] = [];

type Scope = { userId: string; workspaceId: string; clientProfileId: string };

async function createScope(tag: string): Promise<Scope> {
  seq += 1;
  const name = `d-${RUN_ID}-${tag}-${seq}`.slice(0, 60);
  const userId = `user-${name}`;
  await db.insert(user).values({
    id: userId,
    name: "Diagnostics API",
    email: `${name}@example.com`,
    emailVerified: true,
  });
  const [workspace] = await db
    .insert(workspaces)
    .values({ name, slug: name })
    .returning();
  const [profile] = await db
    .insert(clientProfiles)
    .values({ workspaceId: workspace.id, name })
    .returning();
  createdUserIds.push(userId);
  createdWorkspaceIds.push(workspace.id);
  return { userId, workspaceId: workspace.id, clientProfileId: profile.id };
}

async function createWork(scope: Scope, title: string) {
  const [work] = await db
    .insert(creativeWorkItems)
    .values({
      workspaceId: scope.workspaceId,
      clientProfileId: scope.clientProfileId,
      createdByUserId: scope.userId,
      title,
      request: "Peça única de teste da API de diagnóstico",
      toolKind: "single",
      status: "ready",
      format: "4:5",
      settings: { targetFormats: [] },
    })
    .returning();
  return work;
}

async function createOutput(
  scope: Scope,
  workId: string,
  overrides?: Partial<typeof creativeWorkOutputs.$inferInsert>,
) {
  seq += 1;
  const [output] = await db
    .insert(creativeWorkOutputs)
    .values({
      workspaceId: scope.workspaceId,
      workItemId: workId,
      creativeLevel: "balanced",
      targetFormat: "4:5",
      operationKey: `opk-${RUN_ID}-${seq}`,
      status: "completed",
      outputKey: `test/output-${RUN_ID}-${seq}.png`,
      quality: { schemaVersion: 1, objectiveVerdict: "pass" },
      ...overrides,
    })
    .returning();
  return output;
}

async function insertEvent(row: typeof diagnosticEvents.$inferInsert) {
  seq += 1;
  await db.insert(diagnosticEvents).values({
    id: `evt-392-${RUN_ID}-${seq}`,
    releaseSha: "test-sha",
    environment: "test",
    process: "web",
    dataOrigin: "test",
    correlation: "full",
    ...row,
  });
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 3_600_000);
}

beforeAll(async () => {
  if (!TEST_DB_EXPLICITLY_CONFIGURED) return;
  try {
    await db.execute(sql`select 1 from adscale_app.diagnostic_events limit 0`);
    await db.execute(sql`select 1 from adscale_app.diagnostic_access_audit limit 0`);
  } catch (err) {
    throw new Error(
      `[diagnostics-api.pg] Postgres de teste INACESSÍVEL ou sem a 0107. ` +
        `Causa: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
});

afterAll(async () => {
  if (!TEST_DB_EXPLICITLY_CONFIGURED) return;
  if (createdWorkspaceIds.length > 0) {
    const textScope = sql.join(
      createdWorkspaceIds.map((id) => sql`${id}`),
      sql`, `,
    );
    const uuidScope = sql.join(
      createdWorkspaceIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    );
    await db.execute(
      sql`delete from adscale_app.diagnostic_access_audit where workspace_id in (${textScope})`,
    );
    await db.execute(
      sql`delete from adscale_app.diagnostic_events where workspace_id in (${textScope})`,
    );
    await db.execute(
      sql`delete from adscale_app.creative_work_outputs where workspace_id in (${uuidScope})`,
    );
    await db.execute(
      sql`delete from adscale_app.creative_work_items where workspace_id in (${uuidScope})`,
    );
    await db
      .delete(workspaces)
      .where(sql`${workspaces.id} in (${sql.join(createdWorkspaceIds.map((id) => sql`${id}::uuid`), sql`, `)})`);
  }
  if (createdUserIds.length > 0) {
    await db.delete(user).where(sql`${user.id} in (${sql.join(createdUserIds.map((id) => sql`${id}`), sql`, `)})`);
  }
});

describe.skipIf(!TEST_DB_EXPLICITLY_CONFIGURED)("works listing", () => {
  it("lists, filters, sorts and paginates observed works", async () => {
    const scope = await createScope("list");
    const first = await createWork(scope, "first");
    const second = await createWork(scope, "second");
    const at = (h: number) => hoursAgo(h);
    await insertEvent({
      workspaceId: scope.workspaceId,
      workItemId: first.id,
      operationId: "op-list-1",
      event: "operation.started",
      stage: "prepare",
      occurredAt: at(5),
      recordedAt: at(5),
    });
    await insertEvent({
      workspaceId: scope.workspaceId,
      workItemId: first.id,
      operationId: "op-list-1",
      event: "operation.failed",
      stage: "image",
      provider: "openai",
      requestedModel: "gpt-image-x",
      occurredAt: at(4),
      recordedAt: at(4),
    });
    await insertEvent({
      workspaceId: scope.workspaceId,
      workItemId: second.id,
      operationId: "op-list-2",
      event: "operation.completed",
      stage: "export",
      provider: "openai",
      requestedModel: "gpt-image-x",
      occurredAt: at(1),
      recordedAt: at(1),
    });

    const all = await listDiagnosticWorks({ workspaceId: scope.workspaceId });
    expect(all.works.map((work) => work.workItemId)).toEqual([
      second.id,
      first.id,
    ]);
    expect(all.nextCursor).toBeNull();
    expect(all.works[1]).toMatchObject({
      workspaceId: scope.workspaceId,
      eventCount: 2,
      states: ["failed"],
    });

    const oldest = await listDiagnosticWorks({
      workspaceId: scope.workspaceId,
      sort: "oldest",
    });
    expect(oldest.works.map((work) => work.workItemId)).toEqual([
      first.id,
      second.id,
    ]);

    const failed = await listDiagnosticWorks({
      workspaceId: scope.workspaceId,
      state: "failed",
    });
    expect(failed.works.map((work) => work.workItemId)).toEqual([first.id]);

    const byModel = await listDiagnosticWorks({
      workspaceId: scope.workspaceId,
      model: "gpt-image-x",
    });
    expect(byModel.works).toHaveLength(2);

    const byStage = await listDiagnosticWorks({
      workspaceId: scope.workspaceId,
      stage: "export",
    });
    expect(byStage.works.map((work) => work.workItemId)).toEqual([second.id]);

    const exact = await listDiagnosticWorks({ workItemId: second.id });
    expect(exact.works.map((work) => work.workItemId)).toEqual([second.id]);

    const windowed = await listDiagnosticWorks({
      workspaceId: scope.workspaceId,
      from: hoursAgo(2).toISOString(),
    });
    expect(windowed.works.map((work) => work.workItemId)).toEqual([second.id]);

    const pageOne = await listDiagnosticWorks({
      workspaceId: scope.workspaceId,
      limit: 1,
    });
    expect(pageOne.works.map((work) => work.workItemId)).toEqual([second.id]);
    expect(pageOne.nextCursor).not.toBeNull();
    const pageTwo = await listDiagnosticWorks({
      workspaceId: scope.workspaceId,
      limit: 1,
      cursor: pageOne.nextCursor as string,
    });
    expect(pageTwo.works.map((work) => work.workItemId)).toEqual([first.id]);
    expect(pageTwo.nextCursor).toBeNull();
  });

  it("clamps limits and isolates workspaces", async () => {
    const scope = await createScope("iso");
    const other = await createScope("iso-other");
    const work = await createWork(scope, "iso-work");
    const otherWork = await createWork(other, "iso-other-work");
    for (const [ws, id] of [
      [scope.workspaceId, work.id],
      [other.workspaceId, otherWork.id],
    ] as const) {
      await insertEvent({
        workspaceId: ws,
        workItemId: id,
        operationId: `op-iso-${id}`,
        event: "operation.started",
        occurredAt: hoursAgo(1),
        recordedAt: hoursAgo(1),
      });
    }
    const scoped = await listDiagnosticWorks({
      workspaceId: scope.workspaceId,
      limit: 500,
    });
    expect(scoped.works.map((w) => w.workItemId)).toEqual([work.id]);
  });
});

describe.skipIf(!TEST_DB_EXPLICITLY_CONFIGURED)("Trabalho detail", () => {
  it("composes canonical state with journal evidence", async () => {
    const scope = await createScope("detail");
    const work = await createWork(scope, "detail-work");
    const output = await createOutput(scope, work.id, {
      isSelected: true,
      selectedBy: "operator",
    });
    await insertEvent({
      workspaceId: scope.workspaceId,
      workItemId: work.id,
      operationId: "op-detail-1",
      event: "operation.started",
      occurredAt: hoursAgo(2),
      recordedAt: hoursAgo(2),
    });
    await insertEvent({
      workspaceId: scope.workspaceId,
      workItemId: work.id,
      operationId: "op-detail-1",
      event: "model.call.completed",
      stage: "image",
      callId: "call-detail-1",
      provider: "openai",
      requestedModel: "gpt-image-x",
      returnedModel: "gpt-image-x-1",
      providerRequestId: "req-1",
      latencyMs: 1200,
      inputTokens: 11,
      outputTokens: 22,
      sentryEventId: "sentry-1",
      occurredAt: hoursAgo(1),
      recordedAt: hoursAgo(1),
    });

    const result = (await getWorkDiagnostics({
      workspaceId: scope.workspaceId,
      workItemId: work.id,
    })) as WorkDiagnosticsResult;
    expect(result.found).toBe(true);
    expect(result.work).toMatchObject({
      origin: "canonical",
      workItemId: work.id,
      toolKind: "single",
      title: "detail-work",
    });
    expect(result.work.outputs).toHaveLength(1);
    expect(result.work.outputs[0]).toMatchObject({
      id: output.id,
      status: "completed",
      isSelected: true,
      selectedBy: "operator",
      deliverable: true,
      selectable: true,
      selectionConfirmationRequired: false,
      qualityPresent: true,
    });
    expect(result.work.selection).toMatchObject({
      selectedOutputId: output.id,
      selectedBy: "operator",
    });
    expect(result.work.delivery).toEqual({
      origin: "canonical",
      recorded: false,
    });
    expect(result.telemetry.status).toBe("ok");
    expect(result.telemetry.origin).toBe("journal");
    expect(result.telemetry.events).toHaveLength(2);
    expect(result.telemetry.operationIds).toEqual(["op-detail-1"]);
    expect(result.telemetry.partial).toBe(false);
    expect(typeof result.telemetry.updatedAt).toBe("string");
    const sentry = result.links.items.find((link) => link.destination === "sentry");
    expect(sentry?.availability).toBe("unconfigured");
    expect(sentry?.url).toBeNull();
  });

  it("returns no content for inconsistent associations", async () => {
    const scope = await createScope("assoc");
    const other = await createScope("assoc-other");
    const work = await createWork(scope, "assoc-work");
    await insertEvent({
      workspaceId: scope.workspaceId,
      workItemId: work.id,
      operationId: "op-assoc-1",
      event: "operation.started",
      occurredAt: hoursAgo(1),
      recordedAt: hoursAgo(1),
    });
    const mismatched = await getWorkDiagnostics({
      workspaceId: other.workspaceId,
      workItemId: work.id,
    });
    expect(mismatched).toEqual({ found: false });
    const missing = await getWorkDiagnostics({
      workspaceId: scope.workspaceId,
      workItemId: "00000000-0000-0000-0000-000000000000",
    });
    expect(missing).toEqual({ found: false });
  });

  it("keeps canonical state readable when the index fails", async () => {
    const scope = await createScope("degraded");
    const work = await createWork(scope, "degraded-work");
    const failingList = vi.fn(async () => {
      throw new Error("index down");
    });
    const result = (await getWorkDiagnostics(
      { workspaceId: scope.workspaceId, workItemId: work.id },
      { listEvents: failingList },
    )) as WorkDiagnosticsResult;
    expect(result.found).toBe(true);
    expect(result.work.workItemId).toBe(work.id);
    expect(result.telemetry.status).toBe("unavailable");
    expect(result.telemetry.events).toEqual([]);
  });
});

describe.skipIf(!TEST_DB_EXPLICITLY_CONFIGURED)("call detail", () => {
  async function seedCall(tag: string, eventOverrides = {}) {
    const scope = await createScope(tag);
    const work = await createWork(scope, `${tag}-work`);
    const output = await createOutput(scope, work.id);
    const at = hoursAgo(1);
    await insertEvent({
      workspaceId: scope.workspaceId,
      workItemId: work.id,
      operationId: `op-${tag}-1`,
      event: "model.call.started",
      stage: "image",
      callId: `call-${tag}-1`,
      provider: "openai",
      requestedModel: "gpt-image-x",
      outputId: output.id,
      occurredAt: at,
      recordedAt: at,
      ...eventOverrides,
    });
    await insertEvent({
      workspaceId: scope.workspaceId,
      workItemId: work.id,
      operationId: `op-${tag}-1`,
      event: "model.call.completed",
      stage: "image",
      callId: `call-${tag}-1`,
      provider: "openai",
      requestedModel: "gpt-image-x",
      returnedModel: "gpt-image-x-1",
      providerRequestId: "req-call-1",
      latencyMs: 800,
      outputId: output.id,
      langfuseTraceId: "trace-call-1",
      langfuseObservationId: "obs-call-1",
      occurredAt: at,
      recordedAt: at,
      ...eventOverrides,
    });
    return { scope, work, output, callId: `call-${tag}-1` };
  }

  it("resolves the call, audits the read, and reports metadata-only honestly", async () => {
    const { scope, work, callId } = await seedCall("callok");
    const result = (await getDiagnosticCall({
      workspaceId: scope.workspaceId,
      workItemId: work.id,
      callId,
      actorId: "owner-1",
      reason: "incident review",
    })) as DiagnosticCallResult;
    expect(result.found).toBe(true);
    expect(result.call).toMatchObject({
      origin: "journal",
      callId,
      provider: "openai",
      requestedModel: "gpt-image-x",
      returnedModel: "gpt-image-x-1",
      providerRequestId: "req-call-1",
      status: "completed",
      validationFailed: false,
    });
    expect(result.call.outputTokens).toBeUndefined();
    expect(result.content).toMatchObject({
      allowed: true,
      availability: "not_collected",
      policyVersion: "v1",
    });
    expect(result.content.payload).toBeUndefined();
    expect(typeof result.content.auditId).toBe("string");
    expect(result.externalRefs.langfuseTraceId).toBe("trace-call-1");

    const audits = await db
      .select()
      .from(diagnosticAccessAudit)
      .where(
        and(
          eq(diagnosticAccessAudit.workspaceId, scope.workspaceId),
          eq(diagnosticAccessAudit.resource, `call:${callId}`),
        ),
      );
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      operatorId: "owner-1",
      scope: "platform-owner",
      workItemId: work.id,
      action: "content.read",
      reason: "incident review",
      result: "allowed",
    });
  });

  it("denies content when the audit write fails, keeping safe metadata", async () => {
    const { scope, work, callId } = await seedCall("calldeny");
    const auditDown = new Proxy(db, {
      get(target, prop, receiver) {
        if (prop === "insert") {
          return () => {
            throw new Error("audit store down");
          };
        }
        const value = Reflect.get(target, prop, receiver) as unknown;
        return typeof value === "function"
          ? (value as (...args: unknown[]) => unknown).bind(target)
          : value;
      },
    }) as unknown as DiagnosticDatabase;
    const result = (await getDiagnosticCall(
      {
        workspaceId: scope.workspaceId,
        workItemId: work.id,
        callId,
        actorId: "owner-1",
        reason: "incident review",
      },
      { database: auditDown },
    )) as DiagnosticCallResult;
    expect(result.found).toBe(true);
    expect(result.content.allowed).toBe(false);
    expect(result.content.auditId).toBeNull();
    expect(result.content.payload).toBeUndefined();
    expect(result.call.callId).toBe(callId);
    expect(result.call.returnedModel).toBe("gpt-image-x-1");
  });

  it("discloses redacted content only with an approved policy and a reachable remote", async () => {
    const { scope, work, callId } = await seedCall("callredact");
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        id: "trace-call-1",
        observations: [
          {
            id: "obs-call-1",
            input: { prompt: "gere uma peça" },
            output: { text: "peça pronta" },
          },
        ],
      }),
    }));
    const result = (await getDiagnosticCall(
      {
        workspaceId: scope.workspaceId,
        workItemId: work.id,
        callId,
        actorId: "owner-1",
        reason: "incident review",
      },
      {
        env: {
          LANGFUSE_PUBLIC_KEY: "pk",
          LANGFUSE_SECRET_KEY: "sk",
          LANGFUSE_BASE_URL: "https://langfuse.example.com",
        },
        policyDeps: {
          env: {
            OBSERVABILITY_CONTENT_MODE: "redacted",
            OBSERVABILITY_WORKSPACE_ALLOWLIST: scope.workspaceId,
          },
          verifyAccess: async () => true,
          verifyDeletion: async () => true,
        },
        fetchImpl: fetchImpl as unknown as typeof fetch,
      },
    )) as DiagnosticCallResult;
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.content.allowed).toBe(true);
    expect(result.content.availability).toBe("redacted");
    expect(result.content.verbatim).toBe(false);
    expect(typeof result.content.notice).toBe("string");
    expect(result.content.payload).toBeDefined();
  });

  it("maps a down remote to unavailable, never a 500", async () => {
    const { scope, work, callId } = await seedCall("calldown");
    const fetchImpl = vi.fn(async () => {
      throw new Error("langfuse down");
    });
    const result = (await getDiagnosticCall(
      {
        workspaceId: scope.workspaceId,
        workItemId: work.id,
        callId,
        actorId: "owner-1",
        reason: "incident review",
      },
      {
        env: {
          LANGFUSE_PUBLIC_KEY: "pk",
          LANGFUSE_SECRET_KEY: "sk",
          LANGFUSE_BASE_URL: "https://langfuse.example.com",
        },
        policyDeps: {
          env: {
            OBSERVABILITY_CONTENT_MODE: "redacted",
            OBSERVABILITY_WORKSPACE_ALLOWLIST: scope.workspaceId,
          },
          verifyAccess: async () => true,
          verifyDeletion: async () => true,
        },
        fetchImpl: fetchImpl as unknown as typeof fetch,
      },
    )) as GetDiagnosticCallResult;
    expect(result).toMatchObject({
      found: true,
      content: { allowed: true, availability: "unavailable" },
    });
  });

  it("returns no content for unknown calls and mismatched outputs", async () => {
    const { scope, work } = await seedCall("callmiss");
    const unknown = await getDiagnosticCall({
      workspaceId: scope.workspaceId,
      workItemId: work.id,
      callId: "call-never-existed",
      actorId: "owner-1",
      reason: "incident review",
    });
    expect(unknown).toEqual({ found: false });

    const other = await createWork(scope, "callmiss-other");
    const stray = await getDiagnosticCall({
      workspaceId: scope.workspaceId,
      workItemId: other.id,
      callId: "call-callmiss-1",
      actorId: "owner-1",
      reason: "incident review",
    });
    expect(stray).toEqual({ found: false });
  });
});
