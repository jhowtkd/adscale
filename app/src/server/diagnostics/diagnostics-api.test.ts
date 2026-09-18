/**
 * trace-392: read-only diagnostics API — unit tests (no database).
 *
 * Pure composition, cursor math, link building, the server-side remote
 * trace read (fake fetch + one local HTTP server proof), and input
 * validation. Database-backed listing/detail/audit behavior lives in
 * diagnostics-api.pg.test.ts.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DiagnosticEventEnvelope } from "./contract";
import {
  DiagnosticApiError,
  buildDiagnosticLinks,
  classifyWorkStates,
  composeCallProjection,
  composeWorkDiagnostics,
  decodeWorksCursor,
  encodeWorksCursor,
  getDiagnosticCall,
  getWorkDiagnostics,
  listDiagnosticWorks,
  readRemoteTrace,
  type DiagnosticWorkProjection,
} from "./diagnostics-api";

function makeEvent(
  overrides?: Partial<DiagnosticEventEnvelope>,
): DiagnosticEventEnvelope {
  return {
    eventId: `evt-${Math.random().toString(36).slice(2)}`,
    event: "operation.started",
    schemaVersion: 1,
    occurredAt: "2026-09-17T12:00:00.000Z",
    recordedAt: "2026-09-17T12:00:00.010Z",
    correlation: "full",
    context: {
      schemaVersion: 1,
      workspaceId: "ws-1",
      clientProfileId: null,
      workItemId: "work-1",
      protocol: "single",
      operationId: "op-1",
      releaseSha: "sha",
      environment: "test",
      process: "web",
      dataOrigin: "test",
    },
    ...overrides,
  };
}

function makeWork(): DiagnosticWorkProjection {
  return {
    origin: "canonical",
    updatedAt: "2026-09-17T12:00:00.000Z",
    workspaceId: "ws-1",
    workItemId: "work-1",
    clientProfileId: null,
    toolKind: "single",
    status: "ready",
    title: "Peça teste",
    briefPresent: true,
    requestPresent: true,
    createdAt: "2026-09-17T11:00:00.000Z",
    outputs: [],
    selection: {
      selectedOutputId: null,
      selectedBy: null,
      updatedAt: "2026-09-17T12:00:00.000Z",
    },
    delivery: { origin: "canonical", recorded: false },
  };
}

describe("works cursor", () => {
  it("round-trips a position for both sorts", () => {
    for (const sort of ["recent", "oldest"] as const) {
      const cursor = encodeWorksCursor({
        lastSeen: "2026-09-17T12:00:00.000Z",
        workspaceId: "ws-1",
        workItemId: "work-1",
        sort,
      });
      expect(decodeWorksCursor(cursor, sort)).toEqual({
        lastSeen: "2026-09-17T12:00:00.000Z",
        workspaceId: "ws-1",
        workItemId: "work-1",
        sort,
      });
    }
  });

  it("rejects garbage, wrong shapes and sort switches", () => {
    expect(() => decodeWorksCursor("!!!", "recent")).toThrow(DiagnosticApiError);
    const twoTuple = Buffer.from(JSON.stringify(["a", "b"]), "utf8").toString(
      "base64url",
    );
    expect(() => decodeWorksCursor(twoTuple, "recent")).toThrow(
      expect.objectContaining({ code: "INVALID_CURSOR" }),
    );
    const recent = encodeWorksCursor({
      lastSeen: "2026-09-17T12:00:00.000Z",
      workspaceId: "ws-1",
      workItemId: "work-1",
      sort: "recent",
    });
    expect(() => decodeWorksCursor(recent, "oldest")).toThrow(
      expect.objectContaining({ code: "INVALID_CURSOR" }),
    );
  });
});

describe("classifyWorkStates", () => {
  it("applies failed > completed > unconfirmed precedence", () => {
    expect(
      classifyWorkStates({ failed: true, completed: true, partial: false }),
    ).toEqual(["failed"]);
    expect(
      classifyWorkStates({ failed: false, completed: true, partial: false }),
    ).toEqual(["completed"]);
    expect(
      classifyWorkStates({ failed: false, completed: false, partial: false }),
    ).toEqual(["unconfirmed"]);
  });

  it("travels partial alongside the outcome", () => {
    expect(
      classifyWorkStates({ failed: false, completed: true, partial: true }),
    ).toEqual(["completed", "partial"]);
  });
});

describe("buildDiagnosticLinks", () => {
  const refs = {
    sentryEventId: "abc123",
    inngestRunId: "run-1",
    langfuseTraceId: "trace-1",
  };

  it("builds links from server templates with encoded ids", () => {
    const links = buildDiagnosticLinks(refs, {
      DIAGNOSTICS_SENTRY_EVENT_URL_TEMPLATE:
        "https://sentry.example.com/e/{eventId}",
      DIAGNOSTICS_INNGEST_RUN_URL_TEMPLATE:
        "https://inngest.example.com/r/{runId}",
      DIAGNOSTICS_LANGFUSE_TRACE_URL_TEMPLATE:
        "https://langfuse.example.com/t/{traceId}",
    });
    expect(links).toEqual([
      {
        destination: "sentry",
        url: "https://sentry.example.com/e/abc123",
        availability: "configured",
      },
      {
        destination: "inngest",
        url: "https://inngest.example.com/r/run-1",
        availability: "configured",
      },
      {
        destination: "langfuse",
        url: "https://langfuse.example.com/t/trace-1",
        availability: "configured",
      },
    ]);
  });

  it("reports unconfigured templates explicitly", () => {
    const links = buildDiagnosticLinks(refs, {});
    expect(links.map((link) => link.availability)).toEqual([
      "unconfigured",
      "unconfigured",
      "unconfigured",
    ]);
    expect(links.every((link) => link.url === null)).toBe(true);
  });

  it("reports missing refs explicitly", () => {
    const links = buildDiagnosticLinks({}, {});
    expect(links.map((link) => link.availability)).toEqual([
      "no_ref",
      "no_ref",
      "no_ref",
    ]);
  });

  it("withholds links for credentialed, schemed or placeholder-less templates", () => {
    const links = buildDiagnosticLinks(refs, {
      DIAGNOSTICS_SENTRY_EVENT_URL_TEMPLATE:
        "https://user:pass@sentry.example.com/e/{eventId}",
      DIAGNOSTICS_INNGEST_RUN_URL_TEMPLATE:
        "javascript:alert('{runId}')",
      DIAGNOSTICS_LANGFUSE_TRACE_URL_TEMPLATE:
        "https://langfuse.example.com/traces",
    });
    expect(links.map((link) => link.availability)).toEqual([
      "misconfigured",
      "misconfigured",
      "misconfigured",
    ]);
    expect(links.every((link) => link.url === null)).toBe(true);
  });

  it("never throws on hostile env", () => {
    const exploding = new Proxy(
      {},
      {
        get() {
          throw new Error("boom");
        },
      },
    ) as NodeJS.ProcessEnv;
    expect(() => buildDiagnosticLinks(refs, exploding)).not.toThrow();
  });
});

describe("readRemoteTrace", () => {
  const env = {
    LANGFUSE_PUBLIC_KEY: "pk",
    LANGFUSE_SECRET_KEY: "sk",
    LANGFUSE_BASE_URL: "https://langfuse.example.com",
  };

  it("returns trace content, preferring the observation match", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        id: "trace-1",
        input: { prompt: "trace-level" },
        output: null,
        observations: [
          { id: "obs-9", input: { prompt: "other" }, output: null },
          { id: "obs-1", input: { prompt: "oi" }, output: { text: "olá" } },
        ],
      }),
    }));
    const read = await readRemoteTrace("trace-1", "obs-1", {
      env,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(read.status).toBe("present");
    expect(read.content).toEqual({
      input: { prompt: "oi" },
      output: { text: "olá" },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://langfuse.example.com/api/public/traces/trace-1");
    expect(init.method).toBe("GET");
    expect(init.headers).toEqual({
      authorization: `Basic ${Buffer.from("pk:sk", "utf8").toString("base64")}`,
    });
  });

  it("falls back to trace-level content without an observation match", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: "t", input: { a: 1 }, output: null }),
    }));
    const read = await readRemoteTrace("t", null, {
      env,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(read).toEqual({
      status: "present",
      content: { input: { a: 1 }, output: null },
    });
  });

  it.each([401, 404, 410, 429, 500])(
    "maps HTTP %s to unavailable",
    async (status) => {
      const fetchImpl = vi.fn(async () => ({
        ok: false,
        status,
        json: async () => ({}),
      }));
      const read = await readRemoteTrace("t", null, {
        env,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      expect(read).toEqual({ status: "unavailable" });
    },
  );

  it("maps network failures, timeouts and empty bodies to unavailable", async () => {
    const throwing = vi.fn(async () => {
      throw new Error("down");
    });
    expect(
      await readRemoteTrace("t", null, {
        env,
        fetchImpl: throwing as unknown as typeof fetch,
      }),
    ).toEqual({ status: "unavailable" });

    const empty = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: "t", input: null, output: null }),
    }));
    expect(
      await readRemoteTrace("t", null, {
        env,
        fetchImpl: empty as unknown as typeof fetch,
      }),
    ).toEqual({ status: "unavailable" });
  });

  it("needs no network when config is missing, and encodes hostile ids", async () => {
    const fetchImpl = vi.fn();
    expect(
      await readRemoteTrace("t", null, {
        env: {},
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).toEqual({ status: "unavailable" });
    expect(
      await readRemoteTrace("", null, {
        env,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).toEqual({ status: "unavailable" });
    expect(fetchImpl).not.toHaveBeenCalled();

    const seen: string[] = [];
    const recording = vi.fn(async (url: string) => {
      seen.push(url);
      return { ok: false, status: 404, json: async () => ({}) };
    });
    await readRemoteTrace("a/b?c=d", null, {
      env,
      fetchImpl: recording as unknown as typeof fetch,
    });
    expect(seen[0]).toBe(
      "https://langfuse.example.com/api/public/traces/a%2Fb%3Fc%3Dd",
    );
  });
});

describe("readRemoteTrace over local HTTP", () => {
  let server: Server | null = null;

  afterEach(async () => {
    const current = server;
    server = null;
    if (current) {
      await new Promise<void>((resolve) => current.close(() => resolve()));
    }
  });

  it("performs a real authorized GET and parses the trace", async () => {
    let authorization: string | undefined;
    const live = createServer((req, res) => {
      authorization = req.headers.authorization;
      if (req.url === "/api/public/traces/trace-live") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ id: "trace-live", input: { a: 1 }, output: "b" }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    server = live;
    await new Promise<void>((resolve) => live.listen(0, resolve));
    const port = (live.address() as AddressInfo).port;
    const read = await readRemoteTrace("trace-live", null, {
      env: {
        LANGFUSE_PUBLIC_KEY: "pk",
        LANGFUSE_SECRET_KEY: "sk",
        LANGFUSE_BASE_URL: `http://127.0.0.1:${port}`,
      },
    });
    expect(read).toEqual({
      status: "present",
      content: { input: { a: 1 }, output: "b" },
    });
    expect(authorization).toBe(
      `Basic ${Buffer.from("pk:sk", "utf8").toString("base64")}`,
    );
  });
});

describe("composeWorkDiagnostics", () => {
  it("composes canonical state with journal evidence in parallel shape", () => {
    const result = composeWorkDiagnostics(
      makeWork(),
      {
        status: "ok",
        events: [
          makeEvent({ event: "operation.started" }),
          makeEvent({
            event: "stage.completed",
            correlation: "partial",
            recordedAt: "2026-09-17T12:05:00.000Z",
            context: { ...makeEvent().context!, operationId: "op-2" },
          }),
        ],
        nextCursor: "cursor-1",
      },
      [],
    );
    expect(result.found).toBe(true);
    expect(result.work.origin).toBe("canonical");
    expect(result.telemetry.status).toBe("ok");
    expect(result.telemetry.partial).toBe(true);
    expect(result.telemetry.operationIds).toEqual(["op-1", "op-2"]);
    expect(result.telemetry.updatedAt).toBe("2026-09-17T12:05:00.000Z");
    expect(result.telemetry.nextCursor).toBe("cursor-1");
    expect(result.links.origin).toBe("server-config");
  });

  it("keeps the Trabalho visible when the index fails", () => {
    const result = composeWorkDiagnostics(
      makeWork(),
      { status: "unavailable" },
      [],
    );
    expect(result.work.workItemId).toBe("work-1");
    expect(result.telemetry.status).toBe("unavailable");
    expect(result.telemetry.events).toEqual([]);
    expect(result.telemetry.partial).toBe(true);
    expect(result.telemetry.updatedAt).toBeNull();
  });
});

describe("composeCallProjection", () => {
  function callEvent(
    event: DiagnosticEventEnvelope["event"],
    occurredAt: string,
    call?: DiagnosticEventEnvelope["call"],
  ) {
    return makeEvent({ event, occurredAt, recordedAt: occurredAt, call });
  }

  it("merges facts with latest wins and tokens only when returned", () => {
    const projection = composeCallProjection("call-1", [
      callEvent("model.call.started", "2026-09-17T12:00:00.000Z", {
        callId: "call-1",
        provider: "openai",
        requestedModel: "gpt-x",
        returnedModel: null,
        providerRequestId: null,
      }),
      callEvent("model.call.completed", "2026-09-17T12:00:01.000Z", {
        callId: "call-1",
        provider: "openai",
        requestedModel: "gpt-x",
        returnedModel: "gpt-x-1",
        providerRequestId: "req-1",
        latencyMs: 900,
        inputTokens: 10,
        outputTokens: 20,
      }),
      callEvent("model.call.completed", "2026-09-17T12:00:02.000Z", {
        callId: "other",
        provider: "openai",
        requestedModel: "gpt-x",
        returnedModel: "gpt-x-2",
        providerRequestId: "req-2",
      }),
    ]);
    expect(projection?.provider).toBe("openai");
    expect(projection?.returnedModel).toBe("gpt-x-1");
    expect(projection?.providerRequestId).toBe("req-1");
    expect(projection?.latencyMs).toBe(900);
    expect(projection?.inputTokens).toBe(10);
    expect(projection?.outputTokens).toBe(20);
    expect(projection?.status).toBe("completed");
    expect(projection?.events).toHaveLength(2);
  });

  it("lets the latest terminal event win and keeps validation independent", () => {
    const projection = composeCallProjection("call-1", [
      callEvent("model.call.failed", "2026-09-17T12:00:01.000Z", {
        callId: "call-1",
        provider: "openai",
        requestedModel: "gpt-x",
        returnedModel: null,
        providerRequestId: null,
      }),
      callEvent("model.call.completed", "2026-09-17T12:00:02.000Z", {
        callId: "call-1",
        provider: "openai",
        requestedModel: "gpt-x",
        returnedModel: "gpt-x-1",
        providerRequestId: "req-1",
      }),
      callEvent("model.validation.failed", "2026-09-17T12:00:03.000Z", {
        callId: "call-1",
        provider: "openai",
        requestedModel: "gpt-x",
        returnedModel: "gpt-x-1",
        providerRequestId: "req-1",
      }),
    ]);
    expect(projection?.status).toBe("completed");
    expect(projection?.validationFailed).toBe(true);
  });

  it("returns null without the call's own events", () => {
    expect(composeCallProjection("missing", [makeEvent()])).toBeNull();
  });
});

describe("input validation (no I/O)", () => {
  it("rejects invalid list filters before touching the database", async () => {
    await expect(listDiagnosticWorks({ stage: "nope" })).rejects.toMatchObject({
      code: "INVALID_FILTER",
    });
    await expect(listDiagnosticWorks({ state: "nope" })).rejects.toMatchObject({
      code: "INVALID_FILTER",
    });
    await expect(listDiagnosticWorks({ sort: "nope" })).rejects.toMatchObject({
      code: "INVALID_FILTER",
    });
    await expect(
      listDiagnosticWorks({ from: "not-a-date" }),
    ).rejects.toMatchObject({ code: "INVALID_FILTER" });
    await expect(
      listDiagnosticWorks({
        from: "2026-09-18T00:00:00.000Z",
        to: "2026-09-17T00:00:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "INVALID_FILTER" });
    await expect(listDiagnosticWorks({ limit: 0 })).rejects.toMatchObject({
      code: "INVALID_LIMIT",
    });
    await expect(
      listDiagnosticWorks({ cursor: "!!!" }),
    ).rejects.toMatchObject({ code: "INVALID_CURSOR" });
  });

  it("rejects invalid detail scope before touching the database", async () => {
    await expect(
      getWorkDiagnostics({ workspaceId: "", workItemId: "w" }),
    ).rejects.toMatchObject({ code: "INVALID_SCOPE" });
    await expect(
      getWorkDiagnostics({ workspaceId: "ws", workItemId: "w", limit: -1 }),
    ).rejects.toMatchObject({ code: "INVALID_LIMIT" });
  });

  it("rejects invalid call reads before touching the database", async () => {
    const base = {
      workspaceId: "ws",
      workItemId: "w",
      callId: "c",
      actorId: "actor",
      reason: "incident review",
    };
    await expect(
      getDiagnosticCall({ ...base, callId: "" }),
    ).rejects.toMatchObject({ code: "INVALID_SCOPE" });
    await expect(
      getDiagnosticCall({ ...base, actorId: "" }),
    ).rejects.toMatchObject({ code: "INVALID_READ_REQUEST" });
    await expect(
      getDiagnosticCall({ ...base, reason: "  " }),
    ).rejects.toMatchObject({ code: "INVALID_READ_REQUEST" });
    await expect(
      getDiagnosticCall({ ...base, reason: "x".repeat(501) }),
    ).rejects.toMatchObject({ code: "INVALID_READ_REQUEST" });
  });
});
