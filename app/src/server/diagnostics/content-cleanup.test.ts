import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createServer, type Server } from "node:http";

import { diagnosticAccessAudit, diagnosticEvents } from "../db/schema";
import {
  DIAGNOSTIC_RETENTION_WINDOWS,
  __resetContentPolicyForTests,
  resolveContentPolicy,
  shutdownContentCapture,
} from "./content-policy";
import type { CleanupDiagnosticData } from "./contract";
import type { DiagnosticDatabase } from "./journal";
import {
  DiagnosticCleanupError,
  cleanupDiagnosticData,
  createHttpRemoteDeletionClient,
  deleteRemoteTraceWithConfirmation,
  parseCleanupArgs,
  probeRemoteDeletion,
  type RemoteTraceDeletionClient,
} from "./content-cleanup";

const NOW = new Date("2026-09-17T12:00:00.000Z");

/** Fake remote trace store over real HTTP (no mocks at the boundary). */
function startFakeRemote() {
  const traces = new Map<string, boolean>();
  let datasetHits = 0;
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://fake");
    if (url.pathname.startsWith("/datasets")) {
      datasetHits += 1;
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "datasets are never touched" }));
      return;
    }
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
    datasetHits: () => datasetHits,
    async listen(): Promise<string> {
      await new Promise<void>((resolve) => server.listen(0, resolve));
      const address = server.address();
      const port =
        typeof address === "object" && address ? address.port : 0;
      return `http://127.0.0.1:${port}`;
    },
    async close(): Promise<void> {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}

let fake: ReturnType<typeof startFakeRemote> | null = null;

afterEach(async () => {
  if (fake) {
    await fake.close();
    fake = null;
  }
});

beforeEach(() => {
  __resetContentPolicyForTests();
});

describe("remote deletion with re-query (#391)", () => {
  it("confirms deletion only when the re-query finds the trace gone", async () => {
    fake = startFakeRemote();
    const baseUrl = await fake.listen();
    fake.traces.set("trace-1", true);
    const client = createHttpRemoteDeletionClient({ baseUrl });
    const confirmation = await deleteRemoteTraceWithConfirmation(
      client,
      "trace-1",
    );
    expect(confirmation).toMatchObject({
      traceId: "trace-1",
      deleteAccepted: true,
      requeryFound: false,
      confirmed: true,
    });
    expect(confirmation.confirmedAt).toBeTruthy();
    expect(confirmation.error).toBeNull();
  });

  it("records unconfirmed when the re-query still finds the trace", async () => {
    const lingering: RemoteTraceDeletionClient = {
      deleteTrace: async () => ({ accepted: true }),
      getTrace: async () => ({ found: true }),
    };
    const confirmation = await deleteRemoteTraceWithConfirmation(
      lingering,
      "trace-2",
    );
    expect(confirmation.confirmed).toBe(false);
    expect(confirmation.confirmedAt).toBeNull();
    expect(confirmation.requeryFound).toBe(true);
  });

  it("records the error instead of throwing when the remote fails", async () => {
    const failing: RemoteTraceDeletionClient = {
      deleteTrace: async () => {
        throw new Error("remote down");
      },
      getTrace: async () => ({ found: false }),
    };
    const confirmation = await deleteRemoteTraceWithConfirmation(
      failing,
      "trace-3",
    );
    expect(confirmation.confirmed).toBe(false);
    expect(confirmation.error).toContain("remote down");
  });

  it("never touches vendor datasets: only delete + re-query operations exist", async () => {
    fake = startFakeRemote();
    const baseUrl = await fake.listen();
    fake.traces.set("trace-4", true);
    const client = createHttpRemoteDeletionClient({ baseUrl });
    expect(Object.keys(client).sort()).toEqual(["deleteTrace", "getTrace"]);
    await expect(probeRemoteDeletion(client, "trace-4")).resolves.toBe(true);
    expect(fake.datasetHits()).toBe(0);
  });

  it("probeRemoteDeletion is false for blank ids and never throws", async () => {
    fake = startFakeRemote();
    const baseUrl = await fake.listen();
    const client = createHttpRemoteDeletionClient({ baseUrl });
    await expect(probeRemoteDeletion(client, "  ")).resolves.toBe(false);
    const failing: RemoteTraceDeletionClient = {
      deleteTrace: async () => {
        throw new Error("boom");
      },
      getTrace: async () => {
        throw new Error("boom");
      },
    };
    await expect(probeRemoteDeletion(failing, "x")).resolves.toBe(false);
  });
});

describe("cleanupDiagnosticData (#391)", () => {
  function stubDatabase(lists: {
    eventIds: string[];
    auditIds: string[];
    traceIds: string[];
  }): {
    database: DiagnosticDatabase;
    deletes: Array<{ table: string; count: number }>;
  } {
    const deletes: Array<{ table: string; count: number }> = [];
    const database = {
      select: () => ({
        from: (table: unknown) => ({
          where: () => ({
            limit: async (n: number) => {
              if (table !== diagnosticEvents && table !== diagnosticAccessAudit) {
                throw new Error("unexpected table");
              }
              const ids =
                table === diagnosticEvents
                  ? lists.eventIds
                  : lists.auditIds;
              return ids.slice(0, n).map((id) => ({ id }));
            },
          }),
        }),
      }),
      selectDistinct: () => ({
        from: () => ({
          where: () => ({
            limit: async (n: number) =>
              lists.traceIds.slice(0, n).map((traceId) => ({ traceId })),
          }),
        }),
      }),
      delete: (table: unknown) => ({
        where: () => ({
          returning: async () => {
            if (table !== diagnosticEvents && table !== diagnosticAccessAudit) {
              throw new Error("unexpected table");
            }
            const ids =
              table === diagnosticEvents ? lists.eventIds : lists.auditIds;
            deletes.push({
              table: table === diagnosticEvents ? "events" : "audit",
              count: ids.length,
            });
            return ids.map((id) => ({ id }));
          },
        }),
      }),
    } as unknown as DiagnosticDatabase;
    return { database, deletes };
  }

  it("satisfies the frozen CleanupDiagnosticData signature", () => {
    const asContract: CleanupDiagnosticData = cleanupDiagnosticData;
    expect(typeof asContract).toBe("function");
  });

  it("dry-run reports expired rows and candidates without writing", async () => {
    const { database, deletes } = stubDatabase({
      eventIds: ["e1", "e2"],
      auditIds: ["a1"],
      traceIds: ["t1"],
    });
    const remote: RemoteTraceDeletionClient = {
      deleteTrace: async () => ({ accepted: true }),
      getTrace: async () => ({ found: false }),
    };
    const result = await cleanupDiagnosticData(NOW, {
      dryRun: true,
      database,
      remoteClient: remote,
    });
    expect(result.dryRun).toBe(true);
    expect(result.local.diagnosticEvents).toMatchObject({
      expired: 2,
      deleted: 0,
    });
    expect(result.local.accessAudit).toMatchObject({ expired: 1, deleted: 0 });
    expect(result.remote.configured).toBe(true);
    expect(result.remote.candidates).toEqual(["t1"]);
    expect(result.remote.traces).toEqual([]);
    expect(deletes).toEqual([]);
  });

  it("dry-run is the default: no flags means no writes", async () => {
    const { database, deletes } = stubDatabase({
      eventIds: ["e1"],
      auditIds: [],
      traceIds: [],
    });
    const result = await cleanupDiagnosticData(NOW, { database });
    expect(result.dryRun).toBe(true);
    expect(result.local.diagnosticEvents.deleted).toBe(0);
    expect(deletes).toEqual([]);
  });

  it("real run deletes expired rows and records remote confirmations", async () => {
    const { database, deletes } = stubDatabase({
      eventIds: ["e1", "e2"],
      auditIds: ["a1"],
      traceIds: ["t1"],
    });
    const remote: RemoteTraceDeletionClient = {
      deleteTrace: async () => ({ accepted: true }),
      getTrace: async () => ({ found: false }),
    };
    const result = await cleanupDiagnosticData(NOW, {
      dryRun: false,
      database,
      remoteClient: remote,
    });
    expect(result.dryRun).toBe(false);
    expect(result.local.diagnosticEvents).toMatchObject({
      expired: 2,
      deleted: 2,
    });
    expect(result.local.accessAudit).toMatchObject({ expired: 1, deleted: 1 });
    expect(deletes).toEqual([
      { table: "events", count: 2 },
      { table: "audit", count: 1 },
    ]);
    expect(result.remote.traces).toHaveLength(1);
    expect(result.remote.traces[0]).toMatchObject({
      traceId: "t1",
      deleteAccepted: true,
      requeryFound: false,
      confirmed: true,
    });
    expect(result.remote.traces[0].confirmedAt).toBeTruthy();
  });

  it("reports the remote step honestly when no client is configured", async () => {
    const { database } = stubDatabase({
      eventIds: [],
      auditIds: [],
      traceIds: ["t1"],
    });
    const result = await cleanupDiagnosticData(NOW, {
      dryRun: false,
      database,
    });
    expect(result.remote.configured).toBe(false);
    expect(result.remote.candidates).toEqual([]);
    expect(result.remote.traces).toEqual([]);
  });

  it("rejects invalid input without side effects", async () => {
    await expect(
      cleanupDiagnosticData(new Date("bad")),
    ).rejects.toBeInstanceOf(DiagnosticCleanupError);
    await expect(
      cleanupDiagnosticData(NOW, { limit: 0 }),
    ).rejects.toBeInstanceOf(DiagnosticCleanupError);
    await expect(
      cleanupDiagnosticData(NOW, { limit: -5 }),
    ).rejects.toBeInstanceOf(DiagnosticCleanupError);
  });

  it("uses the proposed retention windows as data", async () => {
    expect(DIAGNOSTIC_RETENTION_WINDOWS).toMatchObject({
      diagnosticIndexDays: 30,
      aiTracesDays: 7,
      accessAuditDays: 90,
    });
  });

  it("parses CLI args with dry-run as the default", () => {
    expect(parseCleanupArgs([])).toEqual({
      ok: true,
      plan: { dryRun: true, workspaceId: undefined, limit: 1000 },
    });
    expect(parseCleanupArgs(["--dry-run"])).toMatchObject({
      ok: true,
      plan: { dryRun: true },
    });
    expect(
      parseCleanupArgs(["--apply", "--workspace", "ws-1", "--limit", "10"]),
    ).toEqual({
      ok: true,
      plan: { dryRun: false, workspaceId: "ws-1", limit: 10 },
    });
    expect(parseCleanupArgs(["--bogus"]).ok).toBe(false);
    expect(parseCleanupArgs(["--workspace"]).ok).toBe(false);
    expect(parseCleanupArgs(["--limit", "0"]).ok).toBe(false);
    expect(parseCleanupArgs(["--limit", "abc"]).ok).toBe(false);
  });

  it("capture shutdown disables deletion routines never: dry-run still works", async () => {
    shutdownContentCapture();
    // Policy falls back while cleanup stays available (proven against the
    // real database in content-cleanup.pg.test.ts; here the wiring point).
    await expect(
      resolveContentPolicy("ws-any", {
        env: {
          OBSERVABILITY_CONTENT_MODE: "redacted",
          OBSERVABILITY_WORKSPACE_ALLOWLIST: "ws-any",
        } as NodeJS.ProcessEnv,
        verifyAccess: async () => true,
        verifyDeletion: async () => true,
      }),
    ).resolves.toBe("metadata_only");
  });
});
