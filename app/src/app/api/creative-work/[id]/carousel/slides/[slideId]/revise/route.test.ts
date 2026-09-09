import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceAuthError } from "@/server/auth/errors";

const reviseCarouselSlide = vi.hoisted(() => vi.fn());
vi.mock("@/server/application/revise-carousel", () => ({
  reviseCarouselSlide,
  toPublicCarouselSlide: (slide: Record<string, unknown>) => slide,
}));
const requireWorkspaceAccess = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/workspace", () => ({ requireWorkspaceAccess }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));

import { POST } from "./route";

const params = Promise.resolve({ id: "work-1", slideId: "slide-9" });

const request = (body: unknown) =>
  new Request("http://localhost/api/creative-work/work-1/carousel/slides/slide-9/revise", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const REVISION_KEY = "00000000-0000-4000-8000-000000000301";
const publicSlide = { id: "slide-9-v2", position: 2, status: "completed", versionNumber: 2, hasOutput: true };

beforeEach(() => {
  vi.clearAllMocks();
  requireWorkspaceAccess.mockResolvedValue({ user: { id: "user-1" }, workspace: { id: "ws-1" } });
  reviseCarouselSlide.mockResolvedValue({
    ok: true,
    value: { slide: publicSlide, slides: [publicSlide], replay: false },
  });
});

describe("POST /api/creative-work/[id]/carousel/slides/[slideId]/revise", () => {
  it("dispatches a strict copy revision to the workspace-scoped command and returns 200", async () => {
    const response = await POST(request({
      kind: "copy",
      expectedVersion: 2,
      revisionKey: REVISION_KEY,
      primaryText: "Novo gancho",
      secondaryText: null,
    }), { params });

    expect(response.status).toBe(200);
    expect(reviseCarouselSlide).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      workItemId: "work-1",
      slideId: "slide-9",
      userId: "user-1",
      expectedVersion: 2,
      revisionKey: REVISION_KEY,
      kind: "copy",
      primaryText: "Novo gancho",
      secondaryText: null,
    });
    const payload = await response.json();
    expect(payload.slide).toEqual(publicSlide);
    expect(JSON.stringify(payload)).not.toMatch(/outputKey|providerBaseKey|previewKey|anchorKey|generationOperationKey/);
  });

  it("returns 202 for a visual revision that settles one provider call", async () => {
    const response = await POST(request({
      kind: "visual",
      expectedVersion: 2,
      revisionKey: REVISION_KEY,
      instruction: "Fundo mais claro",
    }), { params });

    expect(response.status).toBe(202);
    expect(reviseCarouselSlide).toHaveBeenCalledWith(expect.objectContaining({ kind: "visual", instruction: "Fundo mais claro" }));
  });

  it("returns 202 for a retry of a failed slide", async () => {
    const response = await POST(request({
      kind: "retry",
      expectedVersion: 1,
      revisionKey: REVISION_KEY,
    }), { params });

    expect(response.status).toBe(202);
    expect(reviseCarouselSlide).toHaveBeenCalledWith(expect.objectContaining({ kind: "retry" }));
  });

  it("rejects bodies outside the strict union before any command runs", async () => {
    const extraField = await POST(request({
      kind: "retry", expectedVersion: 1, revisionKey: REVISION_KEY, outputKey: "private/key.png",
    }), { params });
    expect(extraField.status).toBe(400);

    const badKey = await POST(request({
      kind: "retry", expectedVersion: 1, revisionKey: "not-a-uuid",
    }), { params });
    expect(badKey.status).toBe(400);

    const unknownKind = await POST(request({ kind: "regenerate", expectedVersion: 1 }), { params });
    expect(unknownKind.status).toBe(400);

    expect(reviseCarouselSlide).not.toHaveBeenCalled();
  });

  it("isolates the command behind workspace authentication", async () => {
    requireWorkspaceAccess.mockRejectedValue(new WorkspaceAuthError("unauthorized", "no session"));
    const response = await POST(request({ kind: "retry", expectedVersion: 1, revisionKey: REVISION_KEY }), { params });

    expect(response.status).toBe(401);
    expect(reviseCarouselSlide).not.toHaveBeenCalled();
  });

  it.each([
    ["work_not_found", 404],
    ["slide_not_found", 404],
    ["work_not_carousel", 409],
    ["slide_version_conflict", 409],
    ["slide_not_completed", 409],
    ["slide_not_failed", 409],
    ["provider_base_missing", 409],
    ["stale_input", 409],
    ["generation_in_flight", 409],
    ["invalid_context", 422],
    ["composition_failed", 422],
    ["dispatch_failed", 502],
  ])("maps %s to %i", async (code, status) => {
    reviseCarouselSlide.mockResolvedValue({ ok: false, error: { code } });
    const response = await POST(request({ kind: "retry", expectedVersion: 1, revisionKey: REVISION_KEY }), { params });
    expect(response.status).toBe(status);
  });
});
