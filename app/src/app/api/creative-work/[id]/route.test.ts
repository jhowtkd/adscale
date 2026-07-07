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

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: vi.fn(),
  setCreativeWorkCopy: vi.fn(),
  confirmCreativeWorkIdentity: vi.fn(),
}));

vi.mock("@/server/creative-work/identity", () => ({
  createIdentitySnapshot: vi.fn(),
}));

import { getCreativeWork, setCreativeWorkCopy, confirmCreativeWorkIdentity } from "@/server/repositories/creative-work";
import { createIdentitySnapshot } from "@/server/creative-work/identity";

const mockGetCreativeWork = vi.mocked(getCreativeWork);
const mockSetCreativeWorkCopy = vi.mocked(setCreativeWorkCopy);
const mockConfirmCreativeWorkIdentity = vi.mocked(confirmCreativeWorkIdentity);
const mockCreateIdentitySnapshot = vi.mocked(createIdentitySnapshot);

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
  createdAt: new Date(),
  updatedAt: new Date(),
};

const outputs = [
  { id: "o1", workItemId: "work-1", creativeLevel: "conservative", status: "queued" },
  { id: "o2", workItemId: "work-1", creativeLevel: "balanced", status: "queued" },
  { id: "o3", workItemId: "work-1", creativeLevel: "bold", status: "queued" },
];

const identitySnapshot = {
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

describe("GET /api/creative-work/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the work plus its outputs for the authenticated workspace", async () => {
    mockGetCreativeWork.mockResolvedValue({ work: workItem, outputs } as never);

    const res = await GET(
      new Request("http://localhost/api/creative-work/work-1"),
      { params: makeParams("work-1") }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.work.id).toBe("work-1");
    expect(body.outputs).toHaveLength(3);
    expect(mockGetCreativeWork).toHaveBeenCalledWith("workspace-1", "work-1");
  });

  it("returns 404 when the work does not belong to the workspace", async () => {
    mockGetCreativeWork.mockResolvedValue(null);

    const res = await GET(
      new Request("http://localhost/api/creative-work/work-1"),
      { params: makeParams("work-1") }
    );

    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/creative-work/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const confirmBody = {
    copy: {
      headline: "Headline",
      body: "Body content",
      cta: "CTA",
    },
    selectedReferenceIds: [refId1, refId2],
  };

  it("persists copy, builds the identity snapshot server-side, and transitions to ready", async () => {
    mockGetCreativeWork.mockResolvedValue({ work: workItem, outputs } as never);
    mockSetCreativeWorkCopy.mockResolvedValue({
      ...workItem,
      copy: confirmBody.copy,
    } as never);
    mockCreateIdentitySnapshot.mockResolvedValue(identitySnapshot);
    mockConfirmCreativeWorkIdentity.mockResolvedValue({
      ...workItem,
      copy: confirmBody.copy,
      identitySnapshot,
      status: "ready",
    } as never);

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
    expect(body.work.status).toBe("ready");
    expect(body.work.identitySnapshot).toEqual(identitySnapshot);
    expect(body.work.copy).toEqual(confirmBody.copy);

    // Snapshot is built server-side; the browser does not pick asset keys or
    // analysis — those values are reloaded from approved references.
    expect(mockCreateIdentitySnapshot).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      clientProfileId: profileId,
      selectedReferenceIds: [refId1, refId2],
    });
    // createIdentitySnapshot was called BEFORE confirm so the row carries the snapshot.
    const setOrder = mockSetCreativeWorkCopy.mock.invocationCallOrder[0];
    const snapshotOrder = mockCreateIdentitySnapshot.mock.invocationCallOrder[0];
    const confirmOrder = mockConfirmCreativeWorkIdentity.mock.invocationCallOrder[0];
    expect(snapshotOrder).toBeLessThan(confirmOrder);
  });

  it("returns 404 when the work does not exist for the workspace", async () => {
    mockGetCreativeWork.mockResolvedValue(null);

    const res = await PATCH(
      new Request("http://localhost/api/creative-work/work-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(confirmBody),
      }),
      { params: makeParams("work-1") }
    );

    expect(res.status).toBe(404);
    expect(mockCreateIdentitySnapshot).not.toHaveBeenCalled();
    expect(mockSetCreativeWorkCopy).not.toHaveBeenCalled();
    expect(mockConfirmCreativeWorkIdentity).not.toHaveBeenCalled();
  });

  it("returns 400 when selectedReferenceIds is empty", async () => {
    mockGetCreativeWork.mockResolvedValue({ work: workItem, outputs } as never);

    const res = await PATCH(
      new Request("http://localhost/api/creative-work/work-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          copy: confirmBody.copy,
          selectedReferenceIds: [],
        }),
      }),
      { params: makeParams("work-1") }
    );

    expect(res.status).toBe(400);
    expect(mockCreateIdentitySnapshot).not.toHaveBeenCalled();
  });

  it("returns 400 when more than 8 references are submitted", async () => {
    mockGetCreativeWork.mockResolvedValue({ work: workItem, outputs } as never);

    const ids = Array.from({ length: 9 }, (_, i) =>
      `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`
    );
    const res = await PATCH(
      new Request("http://localhost/api/creative-work/work-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ copy: confirmBody.copy, selectedReferenceIds: ids }),
      }),
      { params: makeParams("work-1") }
    );

    expect(res.status).toBe(400);
  });

  it("returns 400 when copy fields are missing", async () => {
    mockGetCreativeWork.mockResolvedValue({ work: workItem, outputs } as never);

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
  });

  it("returns 400 when the browser tries to send asset keys or analysis", async () => {
    mockGetCreativeWork.mockResolvedValue({ work: workItem, outputs } as never);

    const res = await PATCH(
      new Request("http://localhost/api/creative-work/work-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          copy: confirmBody.copy,
          selectedReferenceIds: [refId1],
          assetKeys: ["browser-supplied-key"],
          analysis: { foo: "bar" },
        }),
      }),
      { params: makeParams("work-1") }
    );

    expect(res.status).toBe(400);
  });
});