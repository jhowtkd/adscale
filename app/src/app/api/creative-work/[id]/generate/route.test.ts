import { beforeEach, describe, expect, it, vi } from "vitest";

const generate = vi.hoisted(() => vi.fn());
const revise = vi.hoisted(() => vi.fn());
const generateCarousel = vi.hoisted(() => vi.fn());
const getWork = vi.hoisted(() => vi.fn());
vi.mock("@/server/application/generate-creative-work", () => ({ generateCreativeWork: generate }));
vi.mock("@/server/application/revise-creative-work-output", () => ({ reviseCreativeWorkOutput: revise }));
vi.mock("@/server/application/generate-carousel-work", () => ({ generateCarouselWork: generateCarousel }));
vi.mock("@/server/repositories/creative-work", () => ({ getCreativeWork: getWork }));
vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(async () => ({ user: { id: "user-1" }, workspace: { id: "ws-1" } })),
}));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));

import { POST } from "./route";

const request = (body: unknown = { action: "initial", preparedRevision: "2026-07-16T12:00:00.000Z" }) => new Request("http://localhost/api/creative-work/work-1/generate", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

describe("POST /api/creative-work/[id]/generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getWork.mockResolvedValue({ work: { id: "work-1", toolKind: "single" }, outputs: [], sources: [] });
    generate.mockResolvedValue({ ok: true, value: { work: { id: "work-1" }, outputs: [{ id: "output-1" }], billingKey: "creative-work:work-1:initial", brandTrainingSuggestion: null } });
    generateCarousel.mockResolvedValue({ ok: true, value: { work: { id: "work-1" }, carouselSlides: [{ id: "slide-1" }], preparedRevision: "prep-1" } });
    revise.mockResolvedValue({ ok: true, value: { output: { id: "output-v2", versionNumber: 2 } } });
  });

  it("delegates a strict revision command and returns only the new output", async () => {
    const body = {
      action: "revision",
      revisionKey: "00000000-0000-4000-8000-000000000101",
      outputId: "output-v1",
      instruction: "Use mais contraste",
      revisionAssetId: null,
    };
    const response = await POST(request(body), { params: Promise.resolve({ id: "work-1" }) });

    expect(response.status).toBe(202);
    expect(revise).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      workItemId: "work-1",
      userId: "user-1",
      revisionKey: "00000000-0000-4000-8000-000000000101",
      outputId: "output-v1",
      instruction: "Use mais contraste",
      revisionAssetId: null,
    });
    await expect(response.json()).resolves.toEqual({ output: { id: "output-v2", versionNumber: 2 } });
  });

  it("rejects a non-UUID revision key before it reaches the application command", async () => {
    const response = await POST(request({
      action: "revision",
      revisionKey: "balanced:4:5:1",
      outputId: "output-v1",
      instruction: "Use mais contraste",
      revisionAssetId: null,
    }), { params: Promise.resolve({ id: "work-1" }) });

    expect(response.status).toBe(400);
    expect(revise).not.toHaveBeenCalled();
  });

  it("is a thin adapter for the initial generation command", async () => {
    const response = await POST(request(), { params: Promise.resolve({ id: "work-1" }) });
    expect(response.status).toBe(202);
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "ws-1", workItemId: "work-1", userId: "user-1", preparedRevision: "2026-07-16T12:00:00.000Z" }));
    await expect(response.json()).resolves.toMatchObject({ outputs: [{ id: "output-1" }], billingKey: "creative-work:work-1:initial" });
  });

  it("rejects bodies other than the strict initial action", async () => {
    const response = await POST(request({}), { params: Promise.resolve({ id: "work-1" }) });
    expect(response.status).toBe(400);
    expect(generate).not.toHaveBeenCalled();
  });

  it.each([
    ["work_not_found", 404], ["work_not_draft", 409], ["work_not_prepared", 409],
    ["credit_blocked", 402], ["dispatch_failed", 502], ["offer_expired", 409],
  ])("maps %s", async (code, status) => {
    generate.mockResolvedValue({ ok: false, error: { code } });
    const response = await POST(request(), { params: Promise.resolve({ id: "work-1" }) });
    expect(response.status).toBe(status);
  });

  it("routes carousel works to generateCarouselWork and returns work, slides and revision with 202", async () => {
    getWork.mockResolvedValue({ work: { id: "work-1", toolKind: "carousel" }, outputs: [], sources: [] });
    const body = { action: "initial", preparedRevision: "prep-1", studioSessionId: "00000000-0000-4000-8000-000000000001", rolloutVariant: "progressive" };
    const response = await POST(request(body), { params: Promise.resolve({ id: "work-1" }) });

    expect(response.status).toBe(202);
    expect(generateCarousel).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      workItemId: "work-1",
      userId: "user-1",
      preparedRevision: "prep-1",
      studioSessionId: "00000000-0000-4000-8000-000000000001",
      rolloutVariant: "progressive",
    });
    expect(generate).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      work: { id: "work-1" },
      carouselSlides: [{ id: "slide-1" }],
      preparedRevision: "prep-1",
    });
  });

  it("ignores a client-supplied generationScope and authorizes from the frozen snapshot", async () => {
    getWork.mockResolvedValue({ work: { id: "work-1", toolKind: "carousel" }, outputs: [], sources: [] });
    const body = { action: "initial", preparedRevision: "prep-1", generationScope: "interiors" };
    const response = await POST(request(body), { params: Promise.resolve({ id: "work-1" }) });

    expect(response.status).toBe(202);
    expect(generateCarousel).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      workItemId: "work-1",
      userId: "user-1",
      preparedRevision: "prep-1",
    });
  });

  it("rejects a carousel request without preparedRevision before any command runs", async () => {
    getWork.mockResolvedValue({ work: { id: "work-1", toolKind: "carousel" }, outputs: [], sources: [] });
    const response = await POST(request({ action: "initial" }), { params: Promise.resolve({ id: "work-1" }) });

    expect(response.status).toBe(400);
    expect(generateCarousel).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it("rejects a non-carousel initial request without the datetime preparedRevision", async () => {
    const response = await POST(request({ action: "initial", preparedRevision: "prep-1" }), { params: Promise.resolve({ id: "work-1" }) });

    expect(response.status).toBe(400);
    expect(generate).not.toHaveBeenCalled();
  });

  it.each([
    ["stale_input", 409], ["credit_blocked", 402], ["dispatch_failed", 502], ["work_not_found", 404],
  ])("maps carousel %s to %i", async (code, status) => {
    getWork.mockResolvedValue({ work: { id: "work-1", toolKind: "carousel" }, outputs: [], sources: [] });
    generateCarousel.mockResolvedValue({ ok: false, error: { code } });
    const response = await POST(request({ action: "initial", preparedRevision: "prep-1" }), { params: Promise.resolve({ id: "work-1" }) });
    expect(response.status).toBe(status);
  });

  it("delegates a reviewed revision with only ids, revision, key and credits", async () => {
    const body = {
      action: "reviewed_revision",
      outputId: "00000000-0000-4000-8000-000000000002",
      reviewRevision: 2,
      revisionKey: "00000000-0000-4000-8000-000000000101",
      expectedCredits: 50,
    };
    const response = await POST(request(body), { params: Promise.resolve({ id: "work-1" }) });
    expect(response.status).toBe(202);
    expect(revise).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      workItemId: "work-1",
      userId: "user-1",
      outputId: "00000000-0000-4000-8000-000000000002",
      reviewRevision: 2,
      revisionKey: "00000000-0000-4000-8000-000000000101",
      expectedCredits: 50,
    });
    await expect(response.json()).resolves.toMatchObject({
      output: { id: "output-v2", versionNumber: 2 },
    });
  });

  it("projects reviewed revisions without private storage or layer internals", async () => {
    revise.mockResolvedValue({
      ok: true,
      value: {
        output: {
          id: "00000000-0000-4000-8000-000000000003",
          workItemId: "work-1",
          creativeLevel: "balanced",
          targetFormat: "9:16",
          versionNumber: 1,
          parentOutputId: "00000000-0000-4000-8000-000000000002",
          revisionInstruction: "Adapte",
          revisionAssetId: null,
          reviewDraft: null,
          revisionContext: {
            version: 1,
            reviewRevision: 2,
            sourceOutputId: "00000000-0000-4000-8000-000000000002",
            sourceOutputVersion: 1,
            action: "format",
            targetFormat: "9:16",
            instruction: "Preserve a pessoa.",
            annotations: [],
            revisionAssetId: null,
          },
          retryCount: 0,
          imageCallCount: 0,
          status: "queued",
          outputKey: "private/pieces/child.png",
          operationKey: "revision:00000000-0000-4000-8000-000000000101",
          storageKey: "private/storage.png",
          cost: 50,
          failureCode: null,
          quality: null,
          isSelected: false,
          directionId: null,
          directionSnapshot: null,
          layerization: { status: "queued", callbackTokenHash: "secret" },
          layerEditor: { revision: 1, publishedPsdKey: "private/published.psd" },
          createdAt: new Date("2026-09-10T12:00:00.000Z"),
          updatedAt: new Date("2026-09-10T12:00:00.000Z"),
        },
      },
    });
    const response = await POST(
      request({
        action: "reviewed_revision",
        outputId: "00000000-0000-4000-8000-000000000002",
        reviewRevision: 2,
        revisionKey: "00000000-0000-4000-8000-000000000101",
        expectedCredits: 50,
      }),
      { params: Promise.resolve({ id: "work-1" }) },
    );
    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.output.revisionContext).toMatchObject({ reviewRevision: 2 });
    expect(body.output.hasOutput).toBe(true);
    const serialized = JSON.stringify(body);
    for (const sentinel of [
      "private/pieces/child.png",
      "revision:00000000-0000-4000-8000-000000000101",
      "private/storage.png",
      "callbackTokenHash",
      "publishedPsdKey",
    ]) {
      expect(serialized).not.toContain(sentinel);
    }
  });

  it("maps stale reviewed revisions to 409 without a second charge", async () => {
    revise.mockResolvedValueOnce({ ok: false, error: { code: "stale_review" } });
    const body = {
      action: "reviewed_revision",
      outputId: "00000000-0000-4000-8000-000000000002",
      reviewRevision: 1,
      revisionKey: "00000000-0000-4000-8000-000000000101",
      expectedCredits: 50,
    };
    const response = await POST(request(body), { params: Promise.resolve({ id: "work-1" }) });
    expect(response.status).toBe(409);
  });
});
