/**
 * trace-389: observed model calls against real Postgres.
 *
 * Journal persistence criteria — model.call.started/completed/failed and
 * model.validation.failed rows with requested vs returned provider/model,
 * usage only when returned, and normalized failure fields — are proven
 * here through the default journal, never with mocks. Wrapper semantics
 * (pass-through, single invocation, no-context silence) live in
 * model-calls.test.ts.
 *
 * Requires a migrated test database (migration 0107):
 *   DATABASE_URL=postgres://<user>@localhost:5432/adscale_test npm test -- src/server/diagnostics/model-calls.pg.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

const TEST_DB_EXPLICITLY_CONFIGURED = Boolean(
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL,
);

import { db } from "../db";
import { createDiagnosticContext, withDiagnosticContext } from "./context";
import { flushDiagnosticEvents, listDiagnosticEvents } from "./journal";
import {
  newModelCallId,
  observeModelCall,
  reportModelValidationFailed,
  summarizeChatCompletion,
} from "./model-calls";

const RUN_ID = `389-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let seq = 0;

function scope(tag: string) {
  seq += 1;
  return {
    workspaceId: `ws-389-${RUN_ID}-${tag}`,
    workItemId: `work-389-${RUN_ID}-${tag}-${seq}`,
  };
}

function testContext(ids: { workspaceId: string; workItemId: string }) {
  return createDiagnosticContext({
    ...ids,
    operationId: `op-389-${RUN_ID}-${seq}`,
    releaseSha: "test-sha",
    environment: "test",
    process: "web",
    dataOrigin: "test",
  });
}

beforeAll(async () => {
  if (!TEST_DB_EXPLICITLY_CONFIGURED) return;
  try {
    await db.execute(sql`select 1 from adscale_app.diagnostic_events limit 0`);
  } catch (err) {
    throw new Error(
      `[model-calls.pg] Postgres de teste INACESSÍVEL ou sem a 0107 ` +
        `(DATABASE_URL=${process.env.DATABASE_URL ?? "(não definida)"}). ` +
        `Aplique drizzle/0107_diagnostic_journal.sql. ` +
        `Causa: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
});

afterAll(async () => {
  if (!TEST_DB_EXPLICITLY_CONFIGURED) return;
  await db.execute(
    sql`delete from adscale_app.diagnostic_events where workspace_id like ${`ws-389-${RUN_ID}-%`}`,
  );
});

describe.skipIf(!TEST_DB_EXPLICITLY_CONFIGURED)("model-call journal persistence", () => {
  it("persists started + completed with requested vs returned model and usage", async () => {
    const ids = scope("success");
    await withDiagnosticContext(testContext(ids), () =>
      observeModelCall(
        {
          callId: newModelCallId(),
          provider: "openai",
          requestedModel: "gpt-4o-mini",
          stage: "copy",
        },
        () =>
          Promise.resolve({
            model: "gpt-4o-mini-2024-07-18",
            id: "chatcmpl-pg-1",
            usage: { prompt_tokens: 11, completion_tokens: 22 },
          }),
        summarizeChatCompletion,
      ),
    );
    await flushDiagnosticEvents();

    const { events } = await listDiagnosticEvents({ ...ids, limit: 10 });
    const started = events.filter((event) => event.event === "model.call.started");
    const completed = events.filter((event) => event.event === "model.call.completed");
    expect(started).toHaveLength(1);
    expect(completed).toHaveLength(1);
    expect(completed[0]!.call).toMatchObject({
      provider: "openai",
      requestedModel: "gpt-4o-mini",
      returnedModel: "gpt-4o-mini-2024-07-18",
      providerRequestId: "chatcmpl-pg-1",
      inputTokens: 11,
      outputTokens: 22,
    });
    expect(completed[0]!.call!.latencyMs).toEqual(expect.any(Number));
    expect(completed[0]!.stage).toBe("copy");
    expect(completed[0]!.status).toBe("completed");
    expect(started[0]!.call?.callId).toBe(completed[0]!.call?.callId);
  });

  it("persists null usage/request id when the provider returned none", async () => {
    const ids = scope("nousage");
    await withDiagnosticContext(testContext(ids), () =>
      observeModelCall(
        {
          callId: newModelCallId(),
          provider: "openai",
          requestedModel: "gpt-4o-mini",
          stage: "briefing",
        },
        () => Promise.resolve({ model: "gpt-4o-mini" }),
        summarizeChatCompletion,
      ),
    );
    await flushDiagnosticEvents();

    const { events } = await listDiagnosticEvents({ ...ids, limit: 10 });
    const completed = events.filter((event) => event.event === "model.call.completed");
    expect(completed).toHaveLength(1);
    expect(completed[0]!.call?.providerRequestId).toBeNull();
    expect(completed[0]!.call?.inputTokens).toBeUndefined();
    expect(completed[0]!.call?.outputTokens).toBeUndefined();
  });

  it("persists normalized failure fields on transport failure", async () => {
    const ids = scope("failed");
    const failure = Object.assign(new Error("Rate limit reached"), {
      name: "RateLimitError",
      status: 429,
    });
    await expect(
      withDiagnosticContext(testContext(ids), () =>
        observeModelCall(
          {
            callId: newModelCallId(),
            provider: "openai",
            requestedModel: "gpt-image-2",
            stage: "image",
          },
          () => Promise.reject(failure),
          summarizeChatCompletion,
        ),
      ),
    ).rejects.toBe(failure);
    await flushDiagnosticEvents();

    const { events } = await listDiagnosticEvents({ ...ids, limit: 10 });
    const failed = events.filter((event) => event.event === "model.call.failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]!.error).toMatchObject({
      errorClass: "RateLimitError",
      status: 429,
      reason: "Rate limit reached",
    });
    expect(failed[0]!.status).toBe("failed");
  });

  it("persists answered transport plus validation failure on invalid JSON", async () => {
    const ids = scope("validation");
    const callId = newModelCallId();
    await withDiagnosticContext(testContext(ids), async () => {
      await observeModelCall(
        { callId, provider: "openai", requestedModel: "gpt-4o-mini", stage: "copy" },
        () => Promise.resolve({ choices: [{ message: { content: "not-json{" } }] }),
        summarizeChatCompletion,
      );
      reportModelValidationFailed({
        callId,
        provider: "openai",
        requestedModel: "gpt-4o-mini",
        stage: "copy",
        reason: "invalid-json",
      });
    });
    await flushDiagnosticEvents();

    const { events } = await listDiagnosticEvents({ ...ids, limit: 10 });
    expect(events.filter((event) => event.event === "model.call.completed")).toHaveLength(1);
    expect(events.filter((event) => event.event === "model.call.failed")).toHaveLength(0);
    const validation = events.filter((event) => event.event === "model.validation.failed");
    expect(validation).toHaveLength(1);
    expect(validation[0]!.call?.callId).toBe(callId);
    expect(validation[0]!.error).toMatchObject({
      errorClass: "ContentValidationError",
      status: null,
    });
    expect(validation[0]!.error?.reason).toContain("invalid-json");
  });

  it("persists nothing without an ambient single-work context", async () => {
    const ids = scope("nocontext");
    await observeModelCall(
      {
        callId: newModelCallId(),
        provider: "openai",
        requestedModel: "gpt-4o-mini",
        stage: "copy",
      },
      () => Promise.resolve({ ok: true }),
      summarizeChatCompletion,
    );
    await flushDiagnosticEvents();

    const { events } = await listDiagnosticEvents({ ...ids, limit: 10 });
    expect(events).toHaveLength(0);
  });
});
