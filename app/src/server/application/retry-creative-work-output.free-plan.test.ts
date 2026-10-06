/**
 * Ticket 11, part 2, PR 626 review F3: the retry of a historical failed output on the free plan.
 *
 * The chain under test is real: the retry route -> retryCreativeWorkOutput -> the settlement adapter
 * (reactivateCreativeWorkOutputRefund and the resolvers). Only the edges are fakes that COUNT calls: the repositories
 * (work/output rows, usage ledger), recordUsage, Inngest, the session and the free-plan rule itself.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({ user: { id: "user-1" }, workspace: { id: "ws-1" } }),
  ),
}));

const freePlan = vi.hoisted(() => ({ find: vi.fn() }));
vi.mock("@/server/equipe/module/free-plan", () => ({
  findFreePlanAccount: (...args: unknown[]) => freePlan.find(...args),
}));

// The fake database: one work, one failed initial output, a usage ledger. Every repository function counts.
const db = vi.hoisted(() => ({
  output: {} as Record<string, unknown>,
  ledger: new Map<string, { createdAt: Date }>(),
  calls: {} as Record<string, number>,
}));
const count = (name: string) => {
  db.calls[name] = (db.calls[name] ?? 0) + 1;
};

vi.mock("@/server/repositories/creative-work", () => ({
  CREATIVE_WORK_MAX_IMAGE_CALLS: 2,
  CREATIVE_WORK_GENERATION_FAILED_TERMINAL_REFUND_PENDING: "generation_failed_terminal_refund_pending",
  getCreativeWork: vi.fn(async () => {
    count("getCreativeWork");
    return {
      work: { id: "work-1", workspaceId: "ws-1", generationCorrelationId: "generation-1", brief: {} },
      outputs: [{ ...db.output }],
    };
  }),
  claimCreativeWorkOutputManualRetryAttempt: vi.fn(async (_w, _i, _o, _retryCount, _current, next: number) => {
    count("claim");
    db.output = { ...db.output, manualRetryAttempt: next };
    return { ...db.output };
  }),
  releaseCreativeWorkOutputManualRetryAttempt: vi.fn(async () => {
    count("release");
    return { ...db.output };
  }),
  requeueFailedCreativeWorkOutput: vi.fn(async () => {
    count("requeue");
    db.output = { ...db.output, status: "queued", failureCode: null, retryCount: Number(db.output.retryCount) + 1 };
    return { ...db.output };
  }),
  failQueuedCreativeWorkOutput: vi.fn(async () => {
    count("failQueued");
    return null;
  }),
  markCreativeWorkOutputFailureCode: vi.fn(async () => {
    count("markFailure");
    return null;
  }),
}));

vi.mock("@/server/repositories/usage", () => ({
  getUsageByIdempotencyKey: vi.fn(async (_workspaceId: string, key: string) => {
    count("getUsage");
    return db.ledger.get(key) ?? null;
  }),
  getUsageByIdempotencyKeys: vi.fn(async () => {
    count("getUsages");
    return new Map();
  }),
  trackUsage: vi.fn(async () => {
    count("trackUsage");
  }),
}));

// recordUsage is the only edge of credits.ts that the chain reaches; the rest of the module stays real.
vi.mock("@/server/billing/credits", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/billing/credits")>()),
  recordUsage: vi.fn(async (input: { idempotencyKey: string }) => {
    count("recordUsage");
    db.ledger.set(input.idempotencyKey, { createdAt: new Date() });
    return { status: "recorded" };
  }),
}));

const sendMock = vi.hoisted(() => vi.fn());
vi.mock("@/server/jobs/client", () => ({
  inngest: { send: (...args: unknown[]) => sendMock(...args) },
}));

vi.mock("@/server/generation/settlement", () => ({
  settleTerminalRefund: vi.fn(async () => {
    count("settleTerminalRefund");
    return { refunded: true, applied: true, reason: "test", status: "refunded" };
  }),
}));

import { POST } from "@/app/api/creative-work/[id]/outputs/[outputId]/retry/route";
import { retryCreativeWorkOutput } from "./retry-creative-work-output";
import {
  creativeWorkTerminalReactivationIdempotencyKey,
  creativeWorkTerminalRefundIdempotencyKey,
} from "@/server/generation/canonical/policies";

const WORK = "work-1";
const OUTPUT = "output-1";
const TERMINAL_REFUND_KEY = creativeWorkTerminalRefundIdempotencyKey(WORK, OUTPUT);
const REACTIVATION_1_KEY = creativeWorkTerminalReactivationIdempotencyKey(WORK, OUTPUT, 1);

/** The historical failed initial output: eligible for the free retry (imageCallCount < 2, no parent). */
function historicalFailedOutput(overrides: Record<string, unknown> = {}) {
  return {
    id: OUTPUT,
    workspaceId: "ws-1",
    workItemId: WORK,
    generationCorrelationId: "generation-1",
    creativeLevel: "balanced",
    status: "failed",
    outputKey: null,
    failureCode: "provider_failed",
    parentOutputId: null,
    revisionInstruction: null,
    isSelected: false,
    imageCallCount: 1,
    retryCount: 0,
    manualRetryAttempt: null,
    ...overrides,
  };
}

type HistoryState = {
  label: string;
  output: Record<string, unknown>;
  ledgerKeys: string[];
  /** What a PAID retry does in this state. */
  paid: { claim: number; recordUsage: number };
};

const STATES: HistoryState[] = [
  {
    label: "(a) no refund key on the ledger (reactivated: [])",
    output: historicalFailedOutput(),
    ledgerKeys: [],
    paid: { claim: 1, recordUsage: 0 },
  },
  {
    label: "(b) a reactivation debit already pending (charged, never refunded)",
    output: historicalFailedOutput({ manualRetryAttempt: 1 }),
    ledgerKeys: [REACTIVATION_1_KEY],
    paid: { claim: 0, recordUsage: 0 },
  },
  {
    label: "(c) the original debit was refunded (the reactivation charges again)",
    output: historicalFailedOutput(),
    ledgerKeys: [TERMINAL_REFUND_KEY],
    paid: { claim: 1, recordUsage: 1 },
  },
];

const retryRequest = () =>
  POST(new Request("http://localhost/api/creative-work/work-1/outputs/output-1/retry", { method: "POST" }), {
    params: Promise.resolve({ id: WORK, outputId: OUTPUT }),
  });

function arrange(state: HistoryState) {
  db.output = { ...state.output };
  db.ledger = new Map(state.ledgerKeys.map((key) => [key, { createdAt: new Date("2026-01-01T00:00:00Z") }]));
  db.calls = {};
}

beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockResolvedValue(undefined);
  freePlan.find.mockReset();
  freePlan.find.mockResolvedValue(null);
});

describe("retry route -> retryCreativeWorkOutput -> settlement adapter (real chain), free plan (F3)", () => {
  for (const state of STATES) {
    describe(state.label, () => {
      it("free plan: 402 free_plan with the plan request; no read, no reservation, no requeue, no job, no charge", async () => {
        freePlan.find.mockResolvedValue({ accountId: "acc-free" });
        arrange(state);

        const res = await retryRequest();

        expect(res.status).toBe(402);
        const body = await res.json();
        expect(body.code).toBe("free_plan");
        expect(body.details).toMatchObject({
          reason: "free_plan",
          recommendedAction: "plan_request",
          accountId: "acc-free",
        });
        expect(freePlan.find).toHaveBeenCalledWith("ws-1");
        // Zero of everything: the decision comes before the work is even read.
        expect(db.calls).toEqual({});
        expect(sendMock).not.toHaveBeenCalled();
        // The output is untouched, still the historical failed one.
        expect(db.output).toEqual(state.output);
        expect([...db.ledger.keys()].sort()).toEqual([...state.ledgerKeys].sort());
      });

      it("paid or classic (rule answers null): the previous behavior, 200 with one requeue and one job", async () => {
        arrange(state);

        const res = await retryRequest();

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.output.status).toBe("queued");
        expect(db.calls.getCreativeWork).toBe(1);
        expect(db.calls.claim ?? 0).toBe(state.paid.claim);
        expect(db.calls.recordUsage ?? 0).toBe(state.paid.recordUsage);
        expect(db.calls.requeue).toBe(1);
        expect(db.calls.release ?? 0).toBe(0);
        expect(db.calls.failQueued ?? 0).toBe(0);
        expect(sendMock).toHaveBeenCalledTimes(1);
        expect(sendMock.mock.calls[0][0][0]).toMatchObject({
          id: `creative-work-generate:${OUTPUT}:retry-1`,
          name: "creative-work.generate",
          data: { workspaceId: "ws-1", workItemId: WORK, outputId: OUTPUT },
        });
        if (state.paid.recordUsage === 1) expect(db.ledger.has(REACTIVATION_1_KEY)).toBe(true);
      });
    });
  }
});

describe("retryCreativeWorkOutput called directly (application layer, without the route guard), free plan (F3)", () => {
  for (const state of STATES) {
    it(`${state.label}: credit_blocked before any read or write`, async () => {
      freePlan.find.mockResolvedValue({ accountId: "acc-free" });
      arrange(state);

      const result = await retryCreativeWorkOutput({ workspaceId: "ws-1", workItemId: WORK, outputId: OUTPUT, userId: "user-1" });

      expect(result).toEqual({ ok: false, error: { code: "credit_blocked" } });
      expect(freePlan.find).toHaveBeenCalledWith("ws-1");
      expect(db.calls).toEqual({});
      expect(sendMock).not.toHaveBeenCalled();
      expect(db.output).toEqual(state.output);
    });
  }

  it("not on the free plan: the application goes on to read the work and requeue", async () => {
    arrange(STATES[0]);

    const result = await retryCreativeWorkOutput({ workspaceId: "ws-1", workItemId: WORK, outputId: OUTPUT });

    expect(result.ok).toBe(true);
    expect(db.calls.getCreativeWork).toBe(1);
    expect(db.calls.requeue).toBe(1);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});
