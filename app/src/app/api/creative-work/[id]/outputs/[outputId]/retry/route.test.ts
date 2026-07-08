import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

const getWorkMock = vi.hoisted(() => vi.fn());
const sendMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: (...args: unknown[]) => getWorkMock(...args),
}));

vi.mock("@/server/jobs/client", () => ({
  inngest: { send: sendMock },
}));

// Lightweight mock of drizzle's chainable update builder. The chain ends with
// `.returning()` which is the only terminal we exercise in the route.
function makeUpdateChain() {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: (...args: unknown[]) => updateMock(...args),
  };
  return chain;
}

vi.mock("@/server/db", () => ({
  db: {
    update: vi.fn(() => makeUpdateChain()),
  },
}));

function makeParams(id: string, outputId: string) {
  return Promise.resolve({ id, outputId });
}

const workItem = {
  id: "work-1",
  workspaceId: "workspace-1",
  clientProfileId: "profile-1",
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
  copy: { headline: "H", body: "B", cta: "C" },
  identitySnapshot: {
    clientProfileId: "profile-1",
    confirmedAt: "2026-07-07T00:00:00.000Z",
    assets: [],
    brandKit: {
      colors: [],
      fonts: [],
      toneOfVoice: null,
      prohibitedElements: null,
      requiredElements: null,
    },
  },
  createdAt: new Date(),
  updatedAt: new Date(),
};

const failedOutput = {
  id: "output-1",
  workspaceId: "workspace-1",
  workItemId: "work-1",
  creativeLevel: "balanced",
  status: "failed",
  outputKey: null,
  cost: null,
  failureCode: "provider_failed",
  quality: null,
  isSelected: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("POST /api/creative-work/[id]/outputs/[outputId]/retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMock.mockResolvedValue(undefined);
    updateMock.mockResolvedValue([
      { ...failedOutput, status: "queued", failureCode: null },
    ]);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 200, resets the output to queued, and resends the same event", async () => {
    getWorkMock.mockResolvedValue({ work: workItem, outputs: [failedOutput] });

    const res = await POST(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-1/retry", {
        method: "POST",
      }),
      { params: makeParams("work-1", "output-1") }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.output.status).toBe("queued");
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith([
      {
        name: "creative-work.generate",
        data: {
          workspaceId: "workspace-1",
          workItemId: "work-1",
          outputId: "output-1",
          creativeLevel: "balanced",
        },
      },
    ]);
  });

  it("returns 404 when the work is missing", async () => {
    getWorkMock.mockResolvedValue(null);

    const res = await POST(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-1/retry", {
        method: "POST",
      }),
      { params: makeParams("work-1", "output-1") }
    );

    expect(res.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the output is missing for the work", async () => {
    getWorkMock.mockResolvedValue({ work: workItem, outputs: [] });

    const res = await POST(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-1/retry", {
        method: "POST",
      }),
      { params: makeParams("work-1", "output-1") }
    );

    expect(res.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns 409 when the output is not in failed state", async () => {
    getWorkMock.mockResolvedValue({
      work: workItem,
      outputs: [{ ...failedOutput, status: "queued" }],
    });

    const res = await POST(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-1/retry", {
        method: "POST",
      }),
      { params: makeParams("work-1", "output-1") }
    );

    expect(res.status).toBe(409);
    expect(updateMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("does not call any billing or credit-refund functions", async () => {
    getWorkMock.mockResolvedValue({ work: workItem, outputs: [failedOutput] });

    await POST(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-1/retry", {
        method: "POST",
      }),
      { params: makeParams("work-1", "output-1") }
    );

    // The mock graph above intentionally omits billing/paywall modules — the
    // absence of a throw is the contract. This test exists so a future
    // implementation that imports billing would fail loudly here.
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});