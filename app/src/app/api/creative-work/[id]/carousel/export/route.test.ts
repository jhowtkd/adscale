import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceAuthError } from "@/server/auth/errors";

const exportCarouselWork = vi.hoisted(() => vi.fn());
vi.mock("@/server/application/export-carousel-work", () => ({ exportCarouselWork }));
const requireWorkspaceAccess = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/workspace", () => ({ requireWorkspaceAccess }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));

import { GET } from "./route";

const params = Promise.resolve({ id: "work-1" });

beforeEach(() => {
  vi.clearAllMocks();
  requireWorkspaceAccess.mockResolvedValue({ user: { id: "user-1" }, workspace: { id: "ws-1" } });
  exportCarouselWork.mockResolvedValue({
    ok: true,
    value: {
      manifest: { version: 1, workId: "work-1" },
      stream: Readable.from([Buffer.from("zip-bytes")]),
      fileName: "carousel-work-1.zip",
    },
  });
});

describe("GET /api/creative-work/[id]/carousel/export", () => {
  it("streams the ordered ZIP with attachment headers", async () => {
    const response = await GET(new Request("http://localhost/x"), { params });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/zip");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="carousel-work-1.zip"');
    expect(exportCarouselWork).toHaveBeenCalledWith({ workspaceId: "ws-1", workItemId: "work-1" });
    const body = await response.arrayBuffer();
    expect(new TextDecoder().decode(body)).toContain("zip-bytes");
  });

  it("returns 409 for an incomplete deck and for a deck that is not approved", async () => {
    exportCarouselWork.mockResolvedValue({ ok: false, error: { code: "deck_not_ready", details: { findings: [] } } });
    const incomplete = await GET(new Request("http://localhost/x"), { params });
    expect(incomplete.status).toBe(409);

    exportCarouselWork.mockResolvedValue({ ok: false, error: { code: "deck_not_approved" } });
    const notApproved = await GET(new Request("http://localhost/x"), { params });
    expect(notApproved.status).toBe(409);
  });

  it.each([
    ["work_not_found", 404],
    ["work_not_carousel", 409],
    ["stale_input", 409],
    ["export_failed", 500],
  ])("maps %s to %i", async (code, status) => {
    exportCarouselWork.mockResolvedValue({ ok: false, error: { code } });
    const response = await GET(new Request("http://localhost/x"), { params });
    expect(response.status).toBe(status);
  });

  it("is isolated behind workspace authentication", async () => {
    requireWorkspaceAccess.mockRejectedValue(new WorkspaceAuthError("unauthorized", "no session"));
    const response = await GET(new Request("http://localhost/x"), { params });

    expect(response.status).toBe(401);
    expect(exportCarouselWork).not.toHaveBeenCalled();
  });
});
