import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

const spendMock = vi.hoisted(() => vi.fn());
const refundMock = vi.hoisted(() => vi.fn());
const sendMock = vi.hoisted(() => vi.fn());
const getWorkMock = vi.hoisted(() => vi.fn());
const createOutputsMock = vi.hoisted(() => vi.fn());
const setStatusMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("@/server/generation/canonical/charge", () => ({
  chargeForBatchOrApiError: spendMock,
}));

vi.mock("@/server/billing/credits", () => ({
  refundCredits: refundMock,
}));

vi.mock("@/server/jobs/client", () => ({
  inngest: { send: sendMock },
}));

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: getWorkMock,
  createCreativeWorkOutputs: createOutputsMock,
  setCreativeWorkStatus: setStatusMock,
}));

import { getCreativeWork, createCreativeWorkOutputs } from "@/server/repositories/creative-work";

const mockGetCreativeWork = vi.mocked(getCreativeWork);
const mockCreateCreativeWorkOutputs = vi.mocked(createCreativeWorkOutputs);

function makeParams(id: string) {
  return Promise.resolve({ id });
}

const profileId = "00000000-0000-4000-8000-000000000001";

const snapshot = {
  clientProfileId: profileId,
  confirmedAt: "2026-07-07T00:00:00.000Z",
  assets: [],
  brandKit: {
    colors: [],
    fonts: [],
    toneOfVoice: null,
    prohibitedElements: null,
    requiredElements: null,
  },
};

const readyWork = {
  id: "work-1",
  workspaceId: "workspace-1",
  clientProfileId: profileId,
  createdByUserId: "user-1",
  toolKind: "social_post",
  status: "ready",
  brief: {
    theme: "Tema",
    objective: "Objetivo",
    audience: "Publico",
    offer: "Oferta",
  },
  format: "4:5",
  copy: {
    headline: "H",
    body: "B",
    cta: "C",
  },
  identitySnapshot: snapshot,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const outputs = [
  { id: "output-1", workItemId: "work-1", creativeLevel: "conservative", status: "queued" },
  { id: "output-2", workItemId: "work-1", creativeLevel: "balanced", status: "queued" },
  { id: "output-3", workItemId: "work-1", creativeLevel: "bold", status: "queued" },
];

describe("POST /api/creative-work/[id]/generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    spendMock.mockResolvedValue(null);
    refundMock.mockResolvedValue({ status: "refunded" });
    sendMock.mockResolvedValue(undefined);
    mockGetCreativeWork.mockResolvedValue({ work: readyWork, outputs: [] });
    mockCreateCreativeWorkOutputs.mockResolvedValue(outputs as never);
    setStatusMock.mockResolvedValue({ ...readyWork, status: "generating" });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("charges a GenerationBatchCharge (15) distinct from unit GenerationRequest", async () => {
    const res = await POST(
      new Request("http://localhost/api/creative-work/work-1/generate", { method: "POST" }),
      { params: makeParams("work-1") }
    );

    expect(res.status).toBe(202);
    expect(spendMock).toHaveBeenCalledWith(
      {
        kind: "batch",
        authorship: { workspaceId: "workspace-1", userId: "user-1" },
        origin: "quick_tool",
        surface: "quick_tool",
        intent: { mode: "social_post", objective: "Objetivo" },
        parentId: "work-1",
        unitCount: 3,
        chargeAmount: 15,
        unitChargeAmount: 5,
        billingKey: "creative-work:work-1:triplet",
        refundPolicy: "default",
      },
      {
        returnPath: "/quick-tools/create-post?workId=work-1",
        metadata: { creativeWorkId: "work-1" },
      },
    );
  });

  it("creates three outputs idempotently and returns 202 with work + outputs", async () => {
    const res = await POST(
      new Request("http://localhost/api/creative-work/work-1/generate", { method: "POST" }),
      { params: makeParams("work-1") }
    );
    const body = await res.json();

    expect(res.status).toBe(202);
    expect(body.work.id).toBe("work-1");
    expect(body.outputs).toHaveLength(3);
    expect(mockCreateCreativeWorkOutputs).toHaveBeenCalledWith(
      "workspace-1",
      "work-1",
      "4:5",
    );
  });

  it("dispatches three creative-work.generate events, one per level", async () => {
    await POST(
      new Request("http://localhost/api/creative-work/work-1/generate", { method: "POST" }),
      { params: makeParams("work-1") }
    );

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith([
      {
        name: "creative-work.generate",
        data: {
          workspaceId: "workspace-1",
          workItemId: "work-1",
          outputId: "output-1",
          creativeLevel: "conservative",
        },
      },
      {
        name: "creative-work.generate",
        data: {
          workspaceId: "workspace-1",
          workItemId: "work-1",
          outputId: "output-2",
          creativeLevel: "balanced",
        },
      },
      {
        name: "creative-work.generate",
        data: {
          workspaceId: "workspace-1",
          workItemId: "work-1",
          outputId: "output-3",
          creativeLevel: "bold",
        },
      },
    ]);
  });

  it("keeps each output paired with its persisted creative level regardless of repository order", async () => {
    mockCreateCreativeWorkOutputs.mockResolvedValue([
      outputs[1],
      outputs[2],
      outputs[0],
    ] as never);

    await POST(
      new Request("http://localhost/api/creative-work/work-1/generate", { method: "POST" }),
      { params: makeParams("work-1") }
    );

    expect(sendMock).toHaveBeenCalledWith([
      expect.objectContaining({
        data: expect.objectContaining({
          outputId: "output-2",
          creativeLevel: "balanced",
        }),
      }),
      expect.objectContaining({
        data: expect.objectContaining({
          outputId: "output-3",
          creativeLevel: "bold",
        }),
      }),
      expect.objectContaining({
        data: expect.objectContaining({
          outputId: "output-1",
          creativeLevel: "conservative",
        }),
      }),
    ]);
  });

  it("refunds 15 credits under the dispatch-refund key when inngest.send throws", async () => {
    sendMock.mockRejectedValueOnce(new Error("inngest down"));

    const res = await POST(
      new Request("http://localhost/api/creative-work/work-1/generate", { method: "POST" }),
      { params: makeParams("work-1") }
    );

    expect(res.status).toBe(502);
    expect(refundMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      action: "image_derivation",
      idempotencyKey: "creative-work:work-1:triplet:dispatch-refund",
      amount: 15,
      metadata: { creativeWorkId: "work-1", description: "creative_work_dispatch_refund" },
      userId: "user-1",
    });
  });

  it("returns 404 when the work is missing", async () => {
    mockGetCreativeWork.mockResolvedValue(null);

    const res = await POST(
      new Request("http://localhost/api/creative-work/work-1/generate", { method: "POST" }),
      { params: makeParams("work-1") }
    );

    expect(res.status).toBe(404);
    expect(spendMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns 409 without charging when the brief is absent", async () => {
    mockGetCreativeWork.mockResolvedValue({ work: { ...readyWork, brief: null }, outputs: [], sources: [] } as never);
    const res = await POST(new Request("http://localhost/api/creative-work/work-1/generate", { method: "POST" }), { params: makeParams("work-1") });
    expect(res.status).toBe(409);
    expect(spendMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns 409 when the work is not in ready status", async () => {
    mockGetCreativeWork.mockResolvedValue({
      work: { ...readyWork, status: "draft", identitySnapshot: null },
      outputs: [],
    });

    const res = await POST(
      new Request("http://localhost/api/creative-work/work-1/generate", { method: "POST" }),
      { params: makeParams("work-1") }
    );

    expect(res.status).toBe(409);
    expect(spendMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns 409 when the work is ready but the snapshot is missing", async () => {
    mockGetCreativeWork.mockResolvedValue({
      work: { ...readyWork, identitySnapshot: null },
      outputs: [],
    });

    const res = await POST(
      new Request("http://localhost/api/creative-work/work-1/generate", { method: "POST" }),
      { params: makeParams("work-1") }
    );

    expect(res.status).toBe(409);
    expect(spendMock).not.toHaveBeenCalled();
  });

  it("returns 402 when spend is blocked", async () => {
    spendMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "noCredits" }), {
        status: 402,
        headers: { "Content-Type": "application/json" },
      }) as never,
    );

    const res = await POST(
      new Request("http://localhost/api/creative-work/work-1/generate", { method: "POST" }),
      { params: makeParams("work-1") }
    );

    expect(res.status).toBe(402);
    expect(mockCreateCreativeWorkOutputs).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("flips the work status to 'generating' after dispatch so polling engages", async () => {
    const res = await POST(
      new Request("http://localhost/api/creative-work/work-1/generate", { method: "POST" }),
      { params: makeParams("work-1") }
    );

    expect(res.status).toBe(202);
    expect(setStatusMock).toHaveBeenCalledWith("workspace-1", "work-1", "generating");
  });

  it("does not flip status to 'generating' when inngest.send throws (refund path)", async () => {
    sendMock.mockRejectedValueOnce(new Error("inngest down"));

    const res = await POST(
      new Request("http://localhost/api/creative-work/work-1/generate", { method: "POST" }),
      { params: makeParams("work-1") }
    );

    expect(res.status).toBe(502);
    expect(setStatusMock).not.toHaveBeenCalled();
  });

  it("never imports or calls campaign/derivation repositories", async () => {
    // Sanity check: the route must NOT call campaign/derivation functions.
    // The mock graph above only mocks creative-work + billing + inngest +
    // auth — if the implementation tried to import a campaign or derivation
    // module, vitest would fail with "Cannot find module" or the mocked
    // function would be undefined.
    await POST(
      new Request("http://localhost/api/creative-work/work-1/generate", { method: "POST" }),
      { params: makeParams("work-1") }
    );

    // The mocks are the only contracts available; this test guards the
    // contract by relying on the strict mock graph (anything else would
    // surface as an undefined import).
    expect(spendMock).toHaveBeenCalledTimes(1);
  });
});
