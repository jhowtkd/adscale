import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET, PATCH } from "./route";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

const getWorkMock = vi.hoisted(() => vi.fn());
const failStaleOutputsMock = vi.hoisted(() => vi.fn());
const refreshStatusMock = vi.hoisted(() => vi.fn());
const confirmMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: (...args: unknown[]) => getWorkMock(...args),
  failStaleCreativeWorkOutputs: (...args: unknown[]) => failStaleOutputsMock(...args),
  refreshCreativeWorkStatus: (...args: unknown[]) => refreshStatusMock(...args),
}));

vi.mock("@/server/application/confirm-social-post-work", () => ({
  confirmSocialPostWork: (...args: unknown[]) => confirmMock(...args),
}));

function makeParams(id: string) {
  return Promise.resolve({ id });
}

const profileId = "00000000-0000-4000-8000-000000000001";
const refId1 = "00000000-0000-4000-8000-000000000010";
const refId2 = "00000000-0000-4000-8000-000000000011";

const workItem = {
  id: "work-1",
  workspaceId: "workspace-1",
  clientProfileId: profileId,
  createdByUserId: "user-1",
  toolKind: "social_post",
  status: "draft",
  brief: {
    theme: "Tema",
    objective: "Objetivo",
    audience: "Publico",
    offer: "Oferta",
  },
  format: "4:5",
  copy: null,
  identitySnapshot: null,
  createdAt: new Date("2026-07-13T12:00:00.000Z"),
  updatedAt: new Date("2026-07-13T12:00:00.000Z"),
};

const outputs = [
  {
    id: "o1",
    workItemId: "work-1",
    creativeLevel: "conservative",
    status: "queued",
    outputKey: null,
    isSelected: false,
    createdAt: new Date("2026-07-13T12:00:00.000Z"),
  },
];

const confirmBody = {
  copy: {
    headline: "Headline",
    body: "Body content",
    cta: "CTA",
  },
  selectedReferenceIds: [refId1, refId2],
};

describe("GET /api/creative-work/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    failStaleOutputsMock.mockResolvedValue([]);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns work, outputs, and canonical projection", async () => {
    getWorkMock.mockResolvedValue({ work: workItem, outputs });

    const res = await GET(
      new Request("http://localhost/api/creative-work/work-1"),
      { params: makeParams("work-1") }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.work.id).toBe("work-1");
    expect(body.outputs).toHaveLength(1);
    expect(body.canonical.id).toBe("creative_work:work-1");
    expect(body.canonical.intent.kind).toBe("social_post");
    expect(body.canonical.briefing.theme).toBe("Tema");
    expect(getWorkMock).toHaveBeenCalledWith("workspace-1", "work-1");
  });

  it("returns 404 when the work does not belong to the workspace", async () => {
    getWorkMock.mockResolvedValue(null);

    const res = await GET(
      new Request("http://localhost/api/creative-work/work-1"),
      { params: makeParams("work-1") }
    );

    expect(res.status).toBe(404);
  });

  it("turns stale generation into a terminal retryable failure", async () => {
    failStaleOutputsMock.mockResolvedValue([{ id: "o1", status: "failed" }]);
    refreshStatusMock.mockResolvedValue("failed");
    getWorkMock.mockResolvedValue({
      work: { ...workItem, status: "failed" },
      outputs: [{ ...outputs[0], status: "failed", failureCode: "generation_timeout" }],
    });

    const res = await GET(
      new Request("http://localhost/api/creative-work/work-1"),
      { params: makeParams("work-1") },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(failStaleOutputsMock).toHaveBeenCalledWith(
      "workspace-1",
      "work-1",
      expect.any(Date),
    );
    expect(refreshStatusMock).toHaveBeenCalledWith("workspace-1", "work-1");
    expect(body.outputs[0]).toEqual(
      expect.objectContaining({ status: "failed", failureCode: "generation_timeout" }),
    );
  });
});

describe("PATCH /api/creative-work/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    confirmMock.mockResolvedValue({
      ok: true,
      value: {
        work: {
          ...workItem,
          copy: confirmBody.copy,
          status: "ready",
          identitySnapshot: { clientProfileId: profileId },
        },
        canonical: {
          id: "creative_work:work-1",
          originKind: "creative_work",
          intent: {
            kind: "social_post",
            objective: "Objetivo",
            formatHint: "4:5",
            platforms: [],
          },
          briefing: {
            headline: confirmBody.copy.headline,
            body: confirmBody.copy.body,
            cta: confirmBody.copy.cta,
            theme: "Tema",
          },
        },
      },
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("delegates to confirmSocialPostWork and returns work + canonical", async () => {
    const res = await PATCH(
      new Request("http://localhost/api/creative-work/work-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(confirmBody),
      }),
      { params: makeParams("work-1") }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(confirmMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      workItemId: "work-1",
      copy: confirmBody.copy,
      selectedReferenceIds: [refId1, refId2],
    });
    expect(body.work.status).toBe("ready");
    expect(body.canonical.id).toBe("creative_work:work-1");
  });

  it("maps work_not_found → 404", async () => {
    confirmMock.mockResolvedValue({
      ok: false,
      error: { code: "work_not_found" },
    });

    const res = await PATCH(
      new Request("http://localhost/api/creative-work/work-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(confirmBody),
      }),
      { params: makeParams("work-1") }
    );

    expect(res.status).toBe(404);
  });

  it("returns 400 when copy fields are invalid", async () => {
    const res = await PATCH(
      new Request("http://localhost/api/creative-work/work-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          copy: { headline: "x", body: "", cta: "y" },
          selectedReferenceIds: [refId1],
        }),
      }),
      { params: makeParams("work-1") }
    );

    expect(res.status).toBe(400);
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the browser tries to send asset keys", async () => {
    const res = await PATCH(
      new Request("http://localhost/api/creative-work/work-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          copy: confirmBody.copy,
          selectedReferenceIds: [refId1],
          assetKeys: ["browser-supplied-key"],
        }),
      }),
      { params: makeParams("work-1") }
    );

    expect(res.status).toBe(400);
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it("maps identity_reference_not_approved → 422", async () => {
    confirmMock.mockResolvedValue({
      ok: false,
      error: {
        code: "identity_reference_not_approved",
        referenceId: refId1,
      },
    });

    const res = await PATCH(
      new Request("http://localhost/api/creative-work/work-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(confirmBody),
      }),
      { params: makeParams("work-1") }
    );

    expect(res.status).toBe(422);
  });
});
