/**
 * trace-387: diagnostic journal against real Postgres.
 *
 * Durability criteria — dedup by eventId, stable ordering, cursor
 * pagination, workspace isolation, DB-down/full-queue/oversize/shutdown/
 * crash with canonical state readable — are proven here, never with mocks.
 * Buffer/drop-counter/timeout unit logic lives in journal.test.ts.
 *
 * Requires a migrated test database (migration 0107):
 *   DATABASE_URL=postgres://<user>@localhost:5432/adscale_test npm test -- src/server/diagnostics/journal.pg.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const TEST_DB_EXPLICITLY_CONFIGURED = Boolean(
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL,
);

import { db } from "../db";
import {
  clientProfiles,
  creativeWorkItems,
  diagnosticEvents,
  user,
  workspaces,
} from "../db/schema";
import type {
  DiagnosticEventEnvelope,
  DiagnosticEventName,
} from "./contract";
import {
  DiagnosticJournalError,
  createDiagnosticJournal,
  createDrizzlePersistBatch,
  emitDiagnosticEvent,
  flushDiagnosticEvents,
  getDiagnosticJournalStats,
  listDiagnosticEvents,
} from "./journal";

const RUN_ID = `387-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let seq = 0;
const createdWorkspaceIds: string[] = [];
const createdUserIds: string[] = [];

type Scope = { userId: string; workspaceId: string; clientProfileId: string };

async function createScope(tag: string): Promise<Scope> {
  seq += 1;
  const name = `j-${RUN_ID}-${tag}-${seq}`;
  const userId = `user-${name}`;
  await db.insert(user).values({
    id: userId,
    name: "Journal",
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
      request: "Peça única de teste do journal",
      toolKind: "single",
      status: "draft",
      format: "4:5",
      settings: { targetFormats: [] },
    })
    .returning();
  return work;
}

function makeEnvelope(
  scope: { workspaceId: string; workItemId: string },
  overrides?: Partial<DiagnosticEventEnvelope>,
): DiagnosticEventEnvelope {
  seq += 1;
  return {
    eventId: `evt-387-${RUN_ID}-${seq}`,
    event: "operation.started",
    schemaVersion: 1,
    occurredAt: "2026-09-16T12:00:00.000Z",
    recordedAt: "2026-09-16T12:00:00.005Z",
    correlation: "full",
    context: {
      schemaVersion: 1,
      workspaceId: scope.workspaceId,
      clientProfileId: null,
      workItemId: scope.workItemId,
      protocol: "single",
      operationId: `op-387-${seq}`,
      releaseSha: "test-sha",
      environment: "test",
      process: "web",
      dataOrigin: "test",
    },
    ...overrides,
  };
}

async function expectConstraint(promise: Promise<unknown>, constraint: RegExp) {
  const error = await promise.then(
    () => null,
    (err: unknown) => err,
  );
  expect(error).not.toBeNull();
  const detail = String((error as { cause?: unknown })?.cause ?? error);
  expect(detail).toMatch(constraint);
}

beforeAll(async () => {
  if (!TEST_DB_EXPLICITLY_CONFIGURED) return;
  try {
    await db.execute(sql`select 1 from adscale_app.diagnostic_events limit 0`);
    await db.execute(sql`select 1 from adscale_app.diagnostic_access_audit limit 0`);
  } catch (err) {
    throw new Error(
      `[journal.pg] Postgres de teste INACESSÍVEL ou sem a 0107 ` +
        `(DATABASE_URL=${process.env.DATABASE_URL ?? "(não definida)"}). ` +
        `Aplique drizzle/0107_diagnostic_journal.sql. ` +
        `Causa: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
});

afterAll(async () => {
  if (!TEST_DB_EXPLICITLY_CONFIGURED) return;
  await db.execute(
    sql`delete from adscale_app.diagnostic_events where workspace_id like 'ws-387-%'`,
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

describe.skipIf(!TEST_DB_EXPLICITLY_CONFIGURED)("journal tables (migration 0107)", () => {
  it("exposes the spec indexes and no prompt/response content columns", async () => {
    const indexes = await db.execute<{ indexname: string }>(sql`
      select indexname from pg_indexes
      where schemaname = 'adscale_app' and tablename = 'diagnostic_events'
    `);
    const names = indexes.rows.map((row) => row.indexname);
    expect(names).toContain("diagnostic_events_pkey");
    expect(names).toContain("diagnostic_events_workspace_work_time_idx");
    expect(names).toContain("diagnostic_events_environment_time_idx");
    expect(names).toContain("diagnostic_events_workspace_call_idx");

    const columns = await db.execute<{ column_name: string }>(sql`
      select column_name from information_schema.columns
      where table_schema = 'adscale_app' and table_name = 'diagnostic_events'
    `);
    const columnNames = columns.rows.map((row) => row.column_name);
    expect(columnNames).not.toContain("prompt");
    expect(columnNames).not.toContain("response");
    expect(columnNames).not.toContain("prompt_text");
    expect(columnNames).not.toContain("response_text");
    expect(columnNames).toContain("attributes");

    const audit = await db.execute<{ column_name: string }>(sql`
      select column_name from information_schema.columns
      where table_schema = 'adscale_app' and table_name = 'diagnostic_access_audit'
    `);
    const auditColumns = audit.rows.map((row) => row.column_name);
    for (const required of [
      "operator_id",
      "scope",
      "workspace_id",
      "work_item_id",
      "resource",
      "action",
      "reason",
      "result",
      "occurred_at",
    ]) {
      expect(auditColumns).toContain(required);
    }
  });

  it("rejects invented event names at the database level", async () => {
    await expectConstraint(
      db.insert(diagnosticEvents).values({
        id: `evt-387-${RUN_ID}-badname`,
        workspaceId: `ws-387-${RUN_ID}`,
        workItemId: "work-bad",
        operationId: "op-bad",
        event: "invented.event",
        occurredAt: new Date("2026-09-16T12:00:00.000Z"),
        recordedAt: new Date("2026-09-16T12:00:00.000Z"),
        releaseSha: "test",
        environment: "test",
        process: "web",
        dataOrigin: "test",
      }),
      /diagnostic_events_event_check/,
    );
  });
});

describe.skipIf(!TEST_DB_EXPLICITLY_CONFIGURED)("journal dedup by event identity", () => {
  it("persists a replayed eventId once, even under concurrent flush", async () => {
    const ws = `ws-387-${RUN_ID}-dedup`;
    const event = makeEnvelope(
      { workspaceId: ws, workItemId: "work-dedup" },
      { eventId: `evt-387-${RUN_ID}-dedup-1`, event: "operation.started" },
    );
    const first = createDiagnosticJournal();
    const second = createDiagnosticJournal();
    first.enqueue(event);
    second.enqueue({ ...event });
    await Promise.all([first.flush(), second.flush()]);
    const rows = await db
      .select()
      .from(diagnosticEvents)
      .where(eq(diagnosticEvents.id, event.eventId));
    expect(rows).toHaveLength(1);
    expect(first.stats().persistedEvents + second.stats().persistedEvents).toBe(1);
    expect(first.stats().duplicateEvents + second.stats().duplicateEvents).toBe(1);
  });
});

describe.skipIf(!TEST_DB_EXPLICITLY_CONFIGURED)("journal ordering and cursor pagination", () => {
  it("lists in (occurred_at, id) order across pages with a stable cursor", async () => {
    const ws = `ws-387-${RUN_ID}-page`;
    const work = "work-page";
    const journal = createDiagnosticJournal();
    const stamps = [
      "2026-09-16T12:00:03.000Z",
      "2026-09-16T12:00:01.000Z",
      "2026-09-16T12:00:02.000Z",
      "2026-09-16T12:00:01.000Z",
      "2026-09-16T12:00:02.000Z",
    ];
    const ids = stamps.map((occurredAt, i) => {
      const eventId = `evt-387-${RUN_ID}-page-${String(i).padStart(2, "0")}`;
      journal.enqueue(
        makeEnvelope(
          { workspaceId: ws, workItemId: work },
          { eventId, occurredAt, event: "stage.completed" },
        ),
      );
      return { eventId, occurredAt };
    });
    await journal.flush();
    const expected = [...ids].sort((a, b) =>
      a.occurredAt === b.occurredAt
        ? a.eventId.localeCompare(b.eventId)
        : a.occurredAt.localeCompare(b.occurredAt),
    );

    const first = await listDiagnosticEvents({ workspaceId: ws, workItemId: work, limit: 2 });
    expect(first.events.map((e) => e.eventId)).toEqual(expected.slice(0, 2).map((e) => e.eventId));
    expect(first.nextCursor).not.toBeNull();

    const second = await listDiagnosticEvents({
      workspaceId: ws,
      workItemId: work,
      limit: 2,
      cursor: first.nextCursor as string,
    });
    expect(second.events.map((e) => e.eventId)).toEqual(expected.slice(2, 4).map((e) => e.eventId));
    expect(second.nextCursor).not.toBeNull();

    const third = await listDiagnosticEvents({
      workspaceId: ws,
      workItemId: work,
      limit: 2,
      cursor: second.nextCursor as string,
    });
    expect(third.events.map((e) => e.eventId)).toEqual(expected.slice(4).map((e) => e.eventId));
    expect(third.nextCursor).toBeNull();
  });

  it("clamps reads to 100 rows per page", async () => {
    const ws = `ws-387-${RUN_ID}-clamp`;
    const work = "work-clamp";
    const journal = createDiagnosticJournal();
    for (let i = 0; i < 105; i += 1) {
      journal.enqueue(
        makeEnvelope(
          { workspaceId: ws, workItemId: work },
          {
            eventId: `evt-387-${RUN_ID}-clamp-${String(i).padStart(3, "0")}`,
            occurredAt: `2026-09-16T12:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}.000Z`,
            event: "stage.started",
          },
        ),
      );
    }
    await journal.flush();
    const page = await listDiagnosticEvents({ workspaceId: ws, workItemId: work, limit: 500 });
    expect(page.events).toHaveLength(100);
    expect(page.nextCursor).not.toBeNull();
    const rest = await listDiagnosticEvents({
      workspaceId: ws,
      workItemId: work,
      limit: 500,
      cursor: page.nextCursor as string,
    });
    expect(rest.events).toHaveLength(5);
    expect(rest.nextCursor).toBeNull();
  });

  it("rejects invalid scope, cursor and limit without touching other tenants", async () => {
    await expect(
      listDiagnosticEvents({ workspaceId: "", workItemId: "w" }),
    ).rejects.toBeInstanceOf(DiagnosticJournalError);
    await expect(
      listDiagnosticEvents({ workspaceId: "ws", workItemId: "", cursor: "x" }),
    ).rejects.toBeInstanceOf(DiagnosticJournalError);
    await expect(
      listDiagnosticEvents({ workspaceId: "ws", workItemId: "w", cursor: "not-a-cursor!!" }),
    ).rejects.toBeInstanceOf(DiagnosticJournalError);
    await expect(
      listDiagnosticEvents({ workspaceId: "ws", workItemId: "w", limit: 0 }),
    ).rejects.toBeInstanceOf(DiagnosticJournalError);
  });
});

describe.skipIf(!TEST_DB_EXPLICITLY_CONFIGURED)("journal workspace isolation", () => {
  it("makes cross-workspace reads impossible", async () => {
    const journal = createDiagnosticJournal();
    const sharedWork = "work-shared";
    journal.enqueue(
      makeEnvelope({ workspaceId: `ws-387-${RUN_ID}-a`, workItemId: sharedWork }),
    );
    journal.enqueue(
      makeEnvelope({ workspaceId: `ws-387-${RUN_ID}-b`, workItemId: sharedWork }),
    );
    journal.enqueue(
      makeEnvelope({ workspaceId: `ws-387-${RUN_ID}-a`, workItemId: "work-other" }),
    );
    await journal.flush();

    const onlyA = await listDiagnosticEvents({
      workspaceId: `ws-387-${RUN_ID}-a`,
      workItemId: sharedWork,
    });
    expect(onlyA.events).toHaveLength(1);
    expect(onlyA.events[0].context?.workspaceId).toBe(`ws-387-${RUN_ID}-a`);

    const onlyB = await listDiagnosticEvents({
      workspaceId: `ws-387-${RUN_ID}-b`,
      workItemId: sharedWork,
    });
    expect(onlyB.events).toHaveLength(1);
    expect(onlyB.events[0].context?.workspaceId).toBe(`ws-387-${RUN_ID}-b`);
  });
});

describe.skipIf(!TEST_DB_EXPLICITLY_CONFIGURED)("journal failure modes keep canonical state readable", () => {
  it("DB down: emit/flush resolve and the Trabalho stays readable", async () => {
    const restore = vi.spyOn(console, "error").mockImplementation(() => {});
    const scope = await createScope("dbdown");
    const work = await createWork(scope, "Trabalho com journal fora do ar");
    const deadPool = new Pool({
      host: "127.0.0.1",
      port: 9,
      connectionTimeoutMillis: 500,
      max: 1,
    });
    deadPool.on("error", () => {});
    try {
      const deadDb = drizzle(deadPool);
      const journal = createDiagnosticJournal({
        persistBatch: createDrizzlePersistBatch(
          deadDb as unknown as Parameters<typeof createDrizzlePersistBatch>[0],
        ),
        writeTimeoutMs: 2_000,
      });
      await expect(
        journal.emit(makeEnvelope({ workspaceId: `ws-387-${RUN_ID}`, workItemId: work.id })),
      ).resolves.toBeUndefined();
      await expect(journal.flush()).resolves.toBeUndefined();
      expect(journal.stats().failedFlushes).toBeGreaterThan(0);

      const canonical = await db
        .select()
        .from(creativeWorkItems)
        .where(eq(creativeWorkItems.id, work.id));
      expect(canonical).toHaveLength(1);
      expect(canonical[0].title).toBe("Trabalho com journal fora do ar");
    } finally {
      restore.mockRestore();
      await deadPool.end().catch(() => {});
    }
  });

  it("full queue: drops are counted and the Trabalho stays readable", async () => {
    const restore = vi.spyOn(console, "error").mockImplementation(() => {});
    const scope = await createScope("fullq");
    const work = await createWork(scope, "Trabalho com fila cheia");
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const seen: string[] = [];
    const journal = createDiagnosticJournal({
      persistBatch: async (rows) => {
        await gate;
        for (const row of rows) seen.push(row.id);
        return { inserted: rows.length, duplicates: 0 };
      },
      maxBufferedEvents: 4,
    });
    const running = journal.flush();
    for (let i = 0; i < 6; i += 1) {
      journal.enqueue(
        makeEnvelope({ workspaceId: `ws-387-${RUN_ID}`, workItemId: work.id }),
      );
    }
    expect(journal.stats().droppedEvents).toBe(2);
    const canonical = await db
      .select()
      .from(creativeWorkItems)
      .where(eq(creativeWorkItems.id, work.id));
    expect(canonical).toHaveLength(1);
    release();
    await running;
    await journal.flush();
    expect(seen).toHaveLength(4);
    restore.mockRestore();
  });

  it("oversize event: reduced row persists and the Trabalho stays readable", async () => {
    const scope = await createScope("bigr");
    const work = await createWork(scope, "Trabalho com evento grande");
    const journal = createDiagnosticJournal();
    const attributes: Record<string, string> = {};
    for (let i = 0; i < 40; i += 1) {
      attributes[`k-${i}`] = "z".repeat(600);
    }
    journal.enqueue(
      makeEnvelope(
        { workspaceId: `ws-387-${RUN_ID}`, workItemId: work.id },
        { eventId: `evt-387-${RUN_ID}-big-1`, attributes },
      ),
    );
    await journal.flush();
    expect(journal.stats().droppedEvents).toBe(0);
    const page = await listDiagnosticEvents({
      workspaceId: `ws-387-${RUN_ID}`,
      workItemId: work.id,
    });
    expect(page.events).toHaveLength(1);
    expect(page.events[0].attributes?.["diagnostic.reduced"]).toBe(
      "oversize-attributes-dropped",
    );
    const canonical = await db
      .select()
      .from(creativeWorkItems)
      .where(eq(creativeWorkItems.id, work.id));
    expect(canonical).toHaveLength(1);
  });

  it("shutdown with budget persists buffered events", async () => {
    const ws = `ws-387-${RUN_ID}-shut`;
    const journal = createDiagnosticJournal();
    journal.enqueue(makeEnvelope({ workspaceId: ws, workItemId: "work-shut" }));
    await journal.shutdown(5_000);
    const page = await listDiagnosticEvents({ workspaceId: ws, workItemId: "work-shut" });
    expect(page.events).toHaveLength(1);
  });

  it("simulated crash: only durable rows list, canonical stays readable", async () => {
    const scope = await createScope("crash");
    const work = await createWork(scope, "Trabalho após crash do worker");
    const ws = `ws-387-${RUN_ID}`;
    const durable = createDiagnosticJournal();
    durable.enqueue(
      makeEnvelope(
        { workspaceId: ws, workItemId: work.id },
        { eventId: `evt-387-${RUN_ID}-crash-durable`, event: "operation.started" },
      ),
    );
    await durable.flush();

    // The crashed process buffered this event and died before flushing it.
    const crashed = createDiagnosticJournal();
    crashed.enqueue(
      makeEnvelope(
        { workspaceId: ws, workItemId: work.id },
        { eventId: `evt-387-${RUN_ID}-crash-lost`, event: "operation.completed" },
      ),
    );

    const page = await listDiagnosticEvents({ workspaceId: ws, workItemId: work.id });
    expect(page.events.map((e) => e.eventId)).toEqual([`evt-387-${RUN_ID}-crash-durable`]);
    const canonical = await db
      .select()
      .from(creativeWorkItems)
      .where(eq(creativeWorkItems.id, work.id));
    expect(canonical).toHaveLength(1);
    expect(canonical[0].title).toBe("Trabalho após crash do worker");
  });
});

describe.skipIf(!TEST_DB_EXPLICITLY_CONFIGURED)("journal call identity", () => {
  it("keeps real attempts distinct and never invents calls from replays", async () => {
    const ws = `ws-387-${RUN_ID}-calls`;
    const work = "work-calls";
    const journal = createDiagnosticJournal();
    journal.enqueue(
      makeEnvelope(
        { workspaceId: ws, workItemId: work },
        {
          eventId: `evt-387-${RUN_ID}-call-1`,
          event: "model.call.completed",
          call: {
            callId: `call-387-${RUN_ID}-1`,
            provider: "openai",
            requestedModel: "gpt-image-2",
            returnedModel: "gpt-image-2",
            providerRequestId: "req-1",
            latencyMs: 1200,
            inputTokens: 10,
            outputTokens: 0,
          },
        },
      ),
    );
    journal.enqueue(
      makeEnvelope(
        { workspaceId: ws, workItemId: work },
        {
          eventId: `evt-387-${RUN_ID}-call-2`,
          event: "model.call.completed",
          call: {
            callId: `call-387-${RUN_ID}-2`,
            provider: "openai",
            requestedModel: "gpt-image-2",
            returnedModel: "gpt-image-2",
            providerRequestId: "req-2",
            latencyMs: 900,
          },
        },
      ),
    );
    journal.enqueue(
      makeEnvelope(
        { workspaceId: ws, workItemId: work },
        { eventId: `evt-387-${RUN_ID}-replay-1`, event: "operation.replayed" },
      ),
    );
    await journal.flush();

    const page = await listDiagnosticEvents({ workspaceId: ws, workItemId: work });
    expect(page.events).toHaveLength(3);
    const calls = page.events.filter((e) => e.event === "model.call.completed");
    expect(calls).toHaveLength(2);
    expect(calls.map((e) => e.call?.callId).sort()).toEqual([
      `call-387-${RUN_ID}-1`,
      `call-387-${RUN_ID}-2`,
    ]);
    // The memoized replay marker persists exactly as observed — no fictive call.
    const replay = page.events.find((e) => e.event === "operation.replayed");
    expect(replay?.call).toBeUndefined();
    const withCallId = await db
      .select({ id: diagnosticEvents.id })
      .from(diagnosticEvents)
      .where(
        and(
          eq(diagnosticEvents.workspaceId, ws),
          eq(diagnosticEvents.workItemId, work),
          sql`${diagnosticEvents.callId} is not null`,
        ),
      );
    expect(withCallId).toHaveLength(2);
  });

  it("round-trips context, error, refs, content and attributes", async () => {
    const ws = `ws-387-${RUN_ID}-roundtrip`;
    const work = "work-roundtrip";
    const journal = createDiagnosticJournal();
    const envelope = makeEnvelope(
      { workspaceId: ws, workItemId: work },
      {
        eventId: `evt-387-${RUN_ID}-rt-1`,
        event: "model.call.failed",
        correlation: "partial",
        stage: "image",
        status: "failed",
        durationMs: 1500,
        error: { errorClass: "TimeoutError", status: 504, reason: "provider timeout" },
        externalRefs: { sentryEventId: "sentry-1", inngestRunId: "run-1" },
        content: { availability: "redacted", policyVersion: "v1" },
        attributes: { attempt: 2, cached: false, note: "hello" },
      },
    );
    journal.enqueue(envelope);
    await journal.flush();
    const page = await listDiagnosticEvents({ workspaceId: ws, workItemId: work });
    expect(page.events).toHaveLength(1);
    const back = page.events[0];
    expect(back.eventId).toBe(envelope.eventId);
    expect(back.event).toBe("model.call.failed");
    expect(back.correlation).toBe("partial");
    expect(back.stage).toBe("image");
    expect(back.status).toBe("failed");
    expect(back.durationMs).toBe(1500);
    expect(back.error).toEqual({ errorClass: "TimeoutError", status: 504, reason: "provider timeout" });
    expect(back.externalRefs).toEqual({ sentryEventId: "sentry-1", inngestRunId: "run-1" });
    expect(back.content).toEqual({ availability: "redacted", policyVersion: "v1" });
    expect(back.attributes).toEqual({ attempt: 2, cached: false, note: "hello" });
    expect(back.context?.workspaceId).toBe(ws);
    expect(back.context?.operationId).toBe(envelope.context?.operationId);
  });
});

describe.skipIf(!TEST_DB_EXPLICITLY_CONFIGURED)("journal default instance (contract surface)", () => {
  it("emit/flush/list/stats work end to end without waiting for the flush", async () => {
    const ws = `ws-387-${RUN_ID}-default`;
    const work = "work-default";
    const before = getDiagnosticJournalStats().persistedEvents;
    await emitDiagnosticEvent(
      makeEnvelope(
        { workspaceId: ws, workItemId: work },
        { eventId: `evt-387-${RUN_ID}-default-1`, event: "operation.completed" as DiagnosticEventName },
      ),
    );
    await flushDiagnosticEvents();
    const after = getDiagnosticJournalStats().persistedEvents;
    expect(after).toBeGreaterThanOrEqual(before + 1);
    const page = await listDiagnosticEvents({ workspaceId: ws, workItemId: work });
    expect(page.events.map((e) => e.eventId)).toContain(`evt-387-${RUN_ID}-default-1`);
  });
});
