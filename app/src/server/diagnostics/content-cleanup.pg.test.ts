/**
 * trace-391: retention cleanup against real Postgres + a fake remote.
 *
 * Retention criteria — dry-run writes nothing, real cleanup deletes only
 * expired rows, remote deletion is re-queried with the confirmation
 * recorded, capture shutdown preserves history without disabling
 * deletion, and the full policy gate (live access probe + fake-proven
 * deletion probe) resolves redacted end to end — are proven here.
 *
 * Requires a migrated test database (migration 0107):
 *   DATABASE_URL=postgres://<user>@localhost:5432/adscale_test npm test -- src/server/diagnostics/content-cleanup.pg.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, like, sql } from "drizzle-orm";
import { createServer, type Server } from "node:http";

const TEST_DB_EXPLICITLY_CONFIGURED = Boolean(
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL,
);

import { db } from "../db";
import { diagnosticAccessAudit, diagnosticEvents } from "../db/schema";
import {
  DIAGNOSTIC_RETENTION_WINDOWS,
  __resetContentPolicyForTests,
  isContentCaptureShutdown,
  resolveContentPolicy,
  shutdownContentCapture,
} from "./content-policy";
import {
  probeContentAccessPath,
  readDiagnosticContent,
} from "./content-access";
import {
  cleanupDiagnosticData,
  createHttpRemoteDeletionClient,
  probeRemoteDeletion,
} from "./content-cleanup";

const RUN_ID = `391c-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const WS = `ws-391c-${RUN_ID}`;
let seq = 0;

function oldEvent(overrides?: Record<string, unknown>) {
  seq += 1;
  return {
    id: `evt-391c-${RUN_ID}-${seq}`,
    workspaceId: WS,
    clientProfileId: null,
    workItemId: `work-391c-${RUN_ID}`,
    protocol: "single",
    operationId: `op-391c-${seq}`,
    event: "model.call.completed",
    correlation: "full",
    occurredAt: new Date("2026-01-05T00:00:00.000Z"),
    recordedAt: new Date("2026-01-05T00:00:01.000Z"),
    releaseSha: "test-sha",
    environment: "test",
    process: "web",
    dataOrigin: "test",
    ...overrides,
  };
}

function freshEvent(overrides?: Record<string, unknown>) {
  seq += 1;
  return {
    id: `evt-391c-${RUN_ID}-fresh-${seq}`,
    workspaceId: WS,
    clientProfileId: null,
    workItemId: `work-391c-${RUN_ID}`,
    protocol: "single",
    operationId: `op-391c-fresh-${seq}`,
    event: "model.call.completed",
    correlation: "full",
    occurredAt: new Date(),
    recordedAt: new Date(),
    releaseSha: "test-sha",
    environment: "test",
    process: "web",
    dataOrigin: "test",
    ...overrides,
  };
}

/** Fake remote trace store over real HTTP (never real Langfuse). */
function startFakeRemote() {
  const traces = new Map<string, boolean>();
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://fake");
    const match = /^\/traces\/([^/]+)$/.exec(url.pathname);
    if (!match) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ found: false }));
      return;
    }
    const id = decodeURIComponent(match[1]);
    if (req.method === "DELETE") {
      const existed = traces.get(id) === true;
      traces.set(id, false);
      res.writeHead(existed ? 200 : 404, {
        "content-type": "application/json",
      });
      res.end(JSON.stringify({ accepted: true }));
      return;
    }
    if (req.method === "GET") {
      const found = traces.get(id) === true;
      res.writeHead(found ? 200 : 404, {
        "content-type": "application/json",
      });
      res.end(JSON.stringify({ found }));
      return;
    }
    res.writeHead(405, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "method not allowed" }));
  });
  return {
    traces,
    async listen(): Promise<string> {
      await new Promise<void>((resolve) => server.listen(0, resolve));
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      return `http://127.0.0.1:${port}`;
    },
    async close(): Promise<void> {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}

beforeAll(async () => {
  if (!TEST_DB_EXPLICITLY_CONFIGURED) return;
  try {
    await db.execute(sql`select 1 from adscale_app.diagnostic_events limit 0`);
    await db.execute(
      sql`select 1 from adscale_app.diagnostic_access_audit limit 0`,
    );
  } catch (err) {
    throw new Error(
      `[content-cleanup.pg] Postgres de teste INACESSÍVEL ou sem a 0107 ` +
        `(DATABASE_URL=${process.env.DATABASE_URL ?? "(não definida)"}). ` +
        `Aplique drizzle/0107_diagnostic_journal.sql. ` +
        `Causa: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
});

afterAll(async () => {
  __resetContentPolicyForTests();
  vi.restoreAllMocks();
  if (!TEST_DB_EXPLICITLY_CONFIGURED) return;
  await db
    .delete(diagnosticEvents)
    .where(like(diagnosticEvents.workspaceId, `${WS}%`));
  await db
    .delete(diagnosticAccessAudit)
    .where(like(diagnosticAccessAudit.workspaceId, `${WS}%`));
});

describe.skipIf(!TEST_DB_EXPLICITLY_CONFIGURED)(
  "retention cleanup (real Postgres + fake remote)",
  () => {
    it("dry-run reports expired rows without deleting anything", async () => {
      seq += 1;
      const eventId = `evt-391c-${RUN_ID}-dry-${seq}`;
      await db.insert(diagnosticEvents).values([oldEvent({ id: eventId })]);
      const [audit] = await db
        .insert(diagnosticAccessAudit)
        .values({
          operatorId: `op-391c-${RUN_ID}-dry`,
          scope: "platform-owner",
          workspaceId: WS,
          workItemId: `work-391c-${RUN_ID}`,
          resource: "call:dry",
          action: "content.read",
          reason: "dry-run fixture",
          result: "allowed",
          occurredAt: new Date("2025-01-05T00:00:00.000Z"),
        })
        .returning({ id: diagnosticAccessAudit.id });

      const result = await cleanupDiagnosticData(new Date(), {
        dryRun: true,
        workspaceId: WS,
      });
      expect(result.dryRun).toBe(true);
      expect(result.local.diagnosticEvents.expired).toBeGreaterThanOrEqual(1);
      expect(result.local.diagnosticEvents.deleted).toBe(0);
      expect(result.local.accessAudit.expired).toBeGreaterThanOrEqual(1);
      expect(result.local.accessAudit.deleted).toBe(0);

      const events = await db
        .select()
        .from(diagnosticEvents)
        .where(eq(diagnosticEvents.id, eventId));
      expect(events).toHaveLength(1);
      const audits = await db
        .select()
        .from(diagnosticAccessAudit)
        .where(eq(diagnosticAccessAudit.id, audit.id));
      expect(audits).toHaveLength(1);
    });

    it("real cleanup deletes only expired rows, fresh history survives", async () => {
      seq += 1;
      const tag = `real-${seq}`;
      const expiredId = `evt-391c-${RUN_ID}-${tag}-old`;
      const freshId = `evt-391c-${RUN_ID}-${tag}-fresh`;
      await db.insert(diagnosticEvents).values([
        oldEvent({ id: expiredId }),
        freshEvent({ id: freshId }),
      ]);

      const result = await cleanupDiagnosticData(new Date(), {
        dryRun: false,
        workspaceId: WS,
      });
      expect(result.dryRun).toBe(false);
      expect(result.local.diagnosticEvents.deleted).toBeGreaterThanOrEqual(1);

      const expired = await db
        .select()
        .from(diagnosticEvents)
        .where(eq(diagnosticEvents.id, expiredId));
      expect(expired).toHaveLength(0);
      const fresh = await db
        .select()
        .from(diagnosticEvents)
        .where(eq(diagnosticEvents.id, freshId));
      expect(fresh).toHaveLength(1);
    });

    it("re-queries remote deletion and records the confirmation", async () => {
      const fake = startFakeRemote();
      try {
        const baseUrl = await fake.listen();
        seq += 1;
        const traceId = `trace-391c-${RUN_ID}-${seq}`;
        fake.traces.set(traceId, true);
        await db.insert(diagnosticEvents).values([
          oldEvent({
            id: `evt-391c-${RUN_ID}-remote-${seq}`,
            langfuseTraceId: traceId,
          }),
        ]);

        const client = createHttpRemoteDeletionClient({ baseUrl });
        const result = await cleanupDiagnosticData(new Date(), {
          dryRun: false,
          workspaceId: WS,
          remoteClient: client,
        });
        expect(result.remote.configured).toBe(true);
        expect(result.remote.candidates).toContain(traceId);
        const confirmation = result.remote.traces.find(
          (entry) => entry.traceId === traceId,
        );
        expect(confirmation).toMatchObject({
          traceId,
          deleteAccepted: true,
          requeryFound: false,
          confirmed: true,
        });
        expect(confirmation?.confirmedAt).toBeTruthy();
        expect(confirmation?.error).toBeNull();
        // The fake really deleted it: a fresh re-query misses.
        expect(await probeRemoteDeletion(client, traceId)).toBe(true);
      } finally {
        await fake.close();
      }
    });

    it("capture shutdown stops emissions without deleting history or disabling deletion", async () => {
      seq += 1;
      const eventId = `evt-391c-${RUN_ID}-shut-${seq}`;
      await db.insert(diagnosticEvents).values([freshEvent({ id: eventId })]);

      shutdownContentCapture();
      expect(isContentCaptureShutdown()).toBe(true);
      await expect(
        resolveContentPolicy(WS, {
          env: {
            OBSERVABILITY_CONTENT_MODE: "redacted",
            OBSERVABILITY_WORKSPACE_ALLOWLIST: WS,
          } as NodeJS.ProcessEnv,
          verifyAccess: async () => true,
          verifyDeletion: async () => true,
        }),
      ).resolves.toBe("metadata_only");

      // History is untouched and cleanup still runs after shutdown.
      const result = await cleanupDiagnosticData(new Date(), {
        dryRun: true,
        workspaceId: WS,
      });
      expect(result.dryRun).toBe(true);
      const rows = await db
        .select()
        .from(diagnosticEvents)
        .where(eq(diagnosticEvents.id, eventId));
      expect(rows).toHaveLength(1);
      __resetContentPolicyForTests();
    });

    it("end-to-end gate: live access probe + fake-proven deletion probe resolve redacted", async () => {
      const fake = startFakeRemote();
      try {
        const baseUrl = await fake.listen();
        seq += 1;
        const tag = `e2e-${seq}`;
        const traceId = `trace-391c-${RUN_ID}-${tag}`;
        fake.traces.set(traceId, true);
        const client = createHttpRemoteDeletionClient({ baseUrl });
        const policyDeps = {
          env: {
            OBSERVABILITY_CONTENT_MODE: "redacted",
            OBSERVABILITY_WORKSPACE_ALLOWLIST: WS,
          } as NodeJS.ProcessEnv,
          verifyAccess: (workspaceId: string) =>
            probeContentAccessPath(workspaceId, db),
          verifyDeletion: () => probeRemoteDeletion(client, traceId),
        };
        await expect(resolveContentPolicy(WS, policyDeps)).resolves.toBe(
          "redacted",
        );

        const scope = {
          operatorId: `op-391c-${RUN_ID}-${tag}`,
          workItemId: `work-391c-${RUN_ID}`,
          callId: `call-391c-${RUN_ID}-${tag}`,
        };
        const read = await readDiagnosticContent(
          {
            ...scope,
            scope: "platform-owner",
            workspaceId: WS,
            reason: "end-to-end gate proof",
            occurredAt: new Date().toISOString(),
            content: { text: "gate proof content" },
            metadata: {
              callId: scope.callId,
              provider: "openai",
              requestedModel: "gpt-5.6-sol",
              returnedModel: "gpt-5.6-sol",
              providerRequestId: "req-e2e",
            },
          },
          { policyDeps },
        );
        expect(read.allowed).toBe(true);
        expect(read.availability).toBe("redacted");
        expect(read.content?.payload).toEqual({
          text: "gate proof content",
        });
        expect(DIAGNOSTIC_RETENTION_WINDOWS.aiTracesDays).toBe(7);
      } finally {
        await fake.close();
      }
    });
  },
);
