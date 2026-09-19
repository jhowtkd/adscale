import { describe, expect, it } from "vitest";
import {
  classifyEffectError,
  MAX_EFFECT_ATTEMPTS,
  planEffectRetry,
  PROCESSOR_BATCH_DEFAULT,
  PROCESSOR_BATCH_MAX,
  processSelectionEffects,
  RETRY_DELAYS_MS,
  runSelectionEffectsSweep,
  SELECTION_EFFECTS_SWEEP_CRON,
  SELECTION_EFFECTS_SWEEP_MAX_PAGES,
  SELECTION_EFFECTS_WAKEUP_EVENT,
  wakeSelectionEffectsProcessor,
  type ClaimedSelectionEffect,
  type EffectProcessorDeps,
  type EffectScope,
} from "./process-selection-effects";

function claimed(overrides: Partial<ClaimedSelectionEffect> = {}): ClaimedSelectionEffect {
  return {
    id: "effect-1",
    workspaceId: "ws-1",
    workItemId: "work-1",
    outputId: "out-1",
    kind: "library",
    effectVersion: 1,
    payload: { version: 1, kind: "library", outputKey: "key-1" } as never,
    attempts: 1,
    requestedAt: new Date("2026-09-12T10:00:00.000Z"),
    ...overrides,
  };
}

function scope(overrides: Partial<EffectScope> = {}): EffectScope {
  return {
    workspaceId: "ws-1",
    workItemId: "work-1",
    outputId: "out-1",
    outputKey: "key-1",
    ...overrides,
  };
}

function deps(overrides: Partial<EffectProcessorDeps> = {}): EffectProcessorDeps {
  const closed: Array<{ id: string; outcome: string }> = [];
  return {
    owner: "test-owner",
    claim: async () => [],
    loadScope: async () => scope(),
    sinks: {
      library: async () => undefined,
      value_event: async () => undefined,
      recipe: async () => undefined,
    },
    close: async (id, resolution) => {
      closed.push({ id, outcome: resolution.outcome });
      return { closed: true, observed: closed };
    },
    ...overrides,
  } as EffectProcessorDeps;
}

describe("classifyEffectError (ICE-03B)", () => {
  it("authorization, cross-association and ownership conflicts are never transient", () => {
    for (const code of [
      "unauthorized",
      "forbidden",
      "auth_expired",
      "invalid_campaign",
      "library_key_owned_elsewhere",
      "ownership_conflict",
      "cross_workspace",
    ]) {
      expect(classifyEffectError(Object.assign(new Error(code), { code })).transient).toBe(false);
    }
  });

  it("invalid payloads and settled domain states never retry", () => {
    for (const code of [
      "invalid_payload",
      "work_not_found",
      "output_not_found",
      "output_not_selected",
      "raster_only",
      "effect_canceled",
    ]) {
      expect(classifyEffectError(Object.assign(new Error(code), { code })).transient).toBe(false);
    }
  });

  it("timeouts, resets and 5xx are transient", () => {
    for (const code of [
      "timeout",
      "ETIMEDOUT",
      "ECONNRESET",
      "fetch_failed",
      "http_503",
      "pool_timeout",
      "deadlock_detected",
    ]) {
      expect(classifyEffectError(Object.assign(new Error(code), { code })).transient).toBe(true);
    }
  });

  it("sanitizes codes to short slugs without payloads", () => {
    const classified = classifyEffectError(new Error("boom"));
    expect(classified.code).toBe("effect_failed");
    const long = classifyEffectError(Object.assign(new Error("x"), { code: "y".repeat(500) }));
    expect(long.code.length).toBeLessThanOrEqual(120);
  });
});

describe("planEffectRetry (ICE-03B)", () => {
  it("immediate retry first, then 30s/2m/10m/30m/2h, then dead", () => {
    expect(RETRY_DELAYS_MS).toEqual([30_000, 120_000, 600_000, 1_800_000, 7_200_000]);
    expect(MAX_EFFECT_ATTEMPTS).toBe(7);
    expect(planEffectRetry(1)).toEqual({ state: "pending", delayMs: 0 });
    expect(planEffectRetry(2)).toEqual({ state: "retry_wait", delayMs: 30_000 });
    expect(planEffectRetry(3)).toEqual({ state: "retry_wait", delayMs: 120_000 });
    expect(planEffectRetry(6)).toEqual({ state: "retry_wait", delayMs: 7_200_000 });
    expect(planEffectRetry(7)).toEqual({ state: "dead" });
    expect(planEffectRetry(99)).toEqual({ state: "dead" });
  });

  it("batch limit defaults to 25 and caps at 100", () => {
    expect(PROCESSOR_BATCH_DEFAULT).toBe(25);
    expect(PROCESSOR_BATCH_MAX).toBe(100);
  });
});

describe("processSelectionEffects (ICE-03B)", () => {
  it("closes done when the sink applies", async () => {
    const seen: string[] = [];
    const testDeps = deps({
      claim: async () => [claimed()],
      sinks: {
        library: async (ctx) => {
          seen.push(`${ctx.effect.id}:${ctx.scope.outputKey}`);
        },
        value_event: async () => undefined,
        recipe: async () => undefined,
      },
    });
    const results = await processSelectionEffects(testDeps);
    expect(results).toEqual([{ effectId: "effect-1", status: "done" }]);
    expect(seen).toEqual(["effect-1:key-1"]);
  });

  it("threads the approval timestamp to the sink for cohort preservation", async () => {
    const approval = new Date("2026-09-01T10:00:00.000Z");
    const seen: Date[] = [];
    const testDeps = deps({
      claim: async () => [
        claimed({
          kind: "value_event",
          payload: {
            version: 1,
            kind: "value_event",
            eventKey: "creative_work_approved",
            userId: "user-1",
            protocol: "single",
            creativeWorkId: "work-1",
            outputKey: "key-1",
          } as never,
          requestedAt: approval,
        }),
      ],
      sinks: {
        library: async () => undefined,
        value_event: async (ctx) => {
          seen.push(ctx.effect.requestedAt);
        },
        recipe: async () => undefined,
      },
    });
    const results = await processSelectionEffects(testDeps);
    expect(results).toEqual([{ effectId: "effect-1", status: "done" }]);
    expect(seen).toEqual([approval]);
  });

  it("crash after sink before ack converges: lease lost means replay, not double done", async () => {
    const testDeps = deps({
      claim: async () => [claimed()],
      close: async () => ({ closed: false }),
    });
    const results = await processSelectionEffects(testDeps);
    // Sink applied but the lease moved on: replay the idempotent sink later.
    expect(results).toEqual([{ effectId: "effect-1", status: "lease_lost" }]);
  });

  it("transient failure schedules a retry, then dies after the last delay", async () => {
    const resolutions: string[] = [];
    const testDeps = deps({
      claim: async () => [claimed({ attempts: 2 })],
      sinks: {
        library: async () => {
          throw Object.assign(new Error("timeout"), { code: "ETIMEDOUT" });
        },
        value_event: async () => undefined,
        recipe: async () => undefined,
      },
      close: async (_id, resolution) => {
        resolutions.push(JSON.stringify(resolution));
        return { closed: true };
      },
    });
    const results = await processSelectionEffects(testDeps);
    expect(results).toEqual([{ effectId: "effect-1", status: "retry_scheduled" }]);
    expect(resolutions).toEqual([
      JSON.stringify({ outcome: "retry", delayMs: 30_000, code: "ETIMEDOUT" }),
    ]);

    const deadDeps = deps({
      claim: async () => [claimed({ attempts: 7 })],
      sinks: {
        library: async () => {
          throw Object.assign(new Error("timeout"), { code: "ETIMEDOUT" });
        },
        value_event: async () => undefined,
        recipe: async () => undefined,
      },
      close: async (_id, resolution) => {
        resolutions.push(JSON.stringify(resolution));
        return { closed: true };
      },
    });
    const dead = await processSelectionEffects(deadDeps);
    expect(dead).toEqual([{ effectId: "effect-1", status: "dead" }]);
    expect(resolutions[1]).toContain('"outcome":"dead"');
  });

  it("permanent failure goes dead without a retry", async () => {
    const resolutions: unknown[] = [];
    const testDeps = deps({
      claim: async () => [claimed({ attempts: 1 })],
      sinks: {
        library: async () => {
          throw Object.assign(new Error("owned"), { code: "library_key_owned_elsewhere" });
        },
        value_event: async () => undefined,
        recipe: async () => undefined,
      },
      close: async (_id, resolution) => {
        resolutions.push(resolution);
        return { closed: true };
      },
    });
    const results = await processSelectionEffects(testDeps);
    expect(results).toEqual([{ effectId: "effect-1", status: "dead" }]);
    expect(resolutions).toEqual([{ outcome: "dead", code: "library_key_owned_elsewhere" }]);
  });

  it("vanished scope cancels without resurrecting, ghost close stops silently", async () => {
    const resolutions: unknown[] = [];
    const testDeps = deps({
      claim: async () => [claimed(), claimed({ id: "effect-2" })],
      loadScope: async (effect) => (effect.id === "effect-1" ? null : scope()),
      close: async (id, resolution) => {
        resolutions.push([id, resolution]);
        return { closed: id !== "effect-2" };
      },
    });
    const results = await processSelectionEffects(testDeps);
    expect(results).toContainEqual({ effectId: "effect-1", status: "canceled" });
    expect(results).toContainEqual({ effectId: "effect-2", status: "lease_lost" });
    expect(resolutions[0]).toEqual(["effect-1", { outcome: "canceled", code: "scope_gone" }]);
  });

  it("stale payload key dies as ownership conflict", async () => {
    const resolutions: unknown[] = [];
    const testDeps = deps({
      claim: async () => [claimed()],
      loadScope: async () => scope({ outputKey: "key-rotated" }),
      close: async (_id, resolution) => {
        resolutions.push(resolution);
        return { closed: true };
      },
    });
    const results = await processSelectionEffects(testDeps);
    expect(results).toEqual([{ effectId: "effect-1", status: "dead" }]);
    expect(resolutions).toEqual([{ outcome: "dead", code: "ownership_conflict" }]);
  });

  it("ownership mismatch and invalid payload die without retry", async () => {
    const resolutions: unknown[] = [];
    const testDeps = deps({
      claim: async () => [
        claimed({ id: "effect-x" }),
        claimed({ id: "effect-y", payload: { version: 1, kind: "recipe" } as never }),
      ],
      loadScope: async (effect) =>
        effect.id === "effect-x" ? scope({ workspaceId: "ws-other" }) : scope(),
      close: async (_id, resolution) => {
        resolutions.push(resolution);
        return { closed: true };
      },
    });
    const results = await processSelectionEffects(testDeps);
    expect(results).toEqual([
      { effectId: "effect-x", status: "dead" },
      { effectId: "effect-y", status: "dead" },
    ]);
    expect(resolutions).toEqual([
      { outcome: "dead", code: "ownership_conflict" },
      { outcome: "dead", code: "invalid_payload" },
    ]);
  });
});

describe("sweep and wake-up (ICE-03B)", () => {
  it("pins the wake-up event and sweep cadence", () => {
    expect(SELECTION_EFFECTS_WAKEUP_EVENT).toBe("creative-work.selection.effects.wakeup");
    expect(SELECTION_EFFECTS_SWEEP_CRON).toBe("*/5 * * * *");
    expect(SELECTION_EFFECTS_SWEEP_MAX_PAGES).toBe(4);
  });

  it("sweeps pages until a short batch", async () => {
    const batches = [
      [{ effectId: "a", status: "done" }],
      [{ effectId: "b", status: "done" }],
      [],
    ] as const;
    let calls = 0;
    const result = await runSelectionEffectsSweep({
      owner: "sweep-test",
      limit: 1,
      runBatch: async () => batches[Math.min(calls++, batches.length - 1)] as never,
    });
    expect(result).toEqual({ processed: 2, pages: 3 });
    expect(calls).toBe(3);
  });

  it("caps pages even when batches stay full", async () => {
    let calls = 0;
    const result = await runSelectionEffectsSweep({
      owner: "sweep-test",
      limit: 1,
      maxPages: 2,
      runBatch: async () => {
        calls += 1;
        return [{ effectId: `e${calls}`, status: "done" }] as never;
      },
    });
    expect(result).toEqual({ processed: 2, pages: 2 });
  });

  it("wake-up without an event key is a silent no-op", async () => {
    const previous = process.env.INNGEST_EVENT_KEY;
    delete process.env.INNGEST_EVENT_KEY;
    try {
      await expect(
        wakeSelectionEffectsProcessor({ workspaceId: "ws", workItemId: "w", outputId: "o" }),
      ).resolves.toBeUndefined();
    } finally {
      if (previous !== undefined) process.env.INNGEST_EVENT_KEY = previous;
    }
  });
});
