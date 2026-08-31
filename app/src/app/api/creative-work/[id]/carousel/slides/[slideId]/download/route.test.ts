import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceAuthError } from "@/server/auth/errors";

const getWork = vi.hoisted(() => vi.fn());
const listSlides = vi.hoisted(() => vi.fn());
const signedDownloadUrl = vi.hoisted(() => vi.fn());
vi.mock("@/server/repositories/creative-work", () => ({ getCreativeWork: getWork }));
vi.mock("@/server/repositories/creative-work-carousel", () => ({ listCurrentCarouselSlides: listSlides }));
vi.mock("@/server/storage", () => ({ objectStorage: { signedDownloadUrl } }));
const requireWorkspaceAccess = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/workspace", () => ({ requireWorkspaceAccess }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));

import { GET } from "./route";

const params = Promise.resolve({ id: "work-1", slideId: "slide-3" });

beforeEach(() => {
  vi.clearAllMocks();
  requireWorkspaceAccess.mockResolvedValue({ user: { id: "user-1" }, workspace: { id: "ws-1" } });
  getWork.mockResolvedValue({ work: { id: "work-1", toolKind: "carousel" }, outputs: [], sources: [] });
  listSlides.mockResolvedValue([
    { id: "slide-1", position: 1, status: "completed", outputKey: "final-1" },
    { id: "slide-2", position: 2, status: "processing", outputKey: null },
    { id: "slide-3", position: 3, status: "completed", outputKey: "final-3" },
  ]);
  signedDownloadUrl.mockResolvedValue("https://storage.example/signed/final-3");
});

describe("GET /api/creative-work/[id]/carousel/slides/[slideId]/download", () => {
  it("redirects to a signed URL only for a current completed slide in the authenticated workspace", async () => {
    const response = await GET(new Request("http://localhost/x"), { params });

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("https://storage.example/signed/final-3");
    expect(signedDownloadUrl).toHaveBeenCalledTimes(1);
    expect(signedDownloadUrl).toHaveBeenCalledWith("final-3");
  });

  it("refuses a slide that is not a current completed slide", async () => {
    const processing = await GET(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: "work-1", slideId: "slide-2" }),
    });
    expect(processing.status).toBe(409);

    const missing = await GET(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: "work-1", slideId: "slide-404" }),
    });
    expect(missing.status).toBe(404);
    expect(signedDownloadUrl).not.toHaveBeenCalled();
  });

  it("refuses a work outside the workspace or outside the carousel protocol", async () => {
    getWork.mockResolvedValue(null);
    const missingWork = await GET(new Request("http://localhost/x"), { params });
    expect(missingWork.status).toBe(404);

    getWork.mockResolvedValue({ work: { id: "work-1", toolKind: "single" }, outputs: [], sources: [] });
    const notCarousel = await GET(new Request("http://localhost/x"), { params });
    expect(notCarousel.status).toBe(409);
    expect(signedDownloadUrl).not.toHaveBeenCalled();
  });

  it("is isolated behind workspace authentication", async () => {
    requireWorkspaceAccess.mockRejectedValue(new WorkspaceAuthError("unauthorized", "no session"));
    const response = await GET(new Request("http://localhost/x"), { params });

    expect(response.status).toBe(401);
    expect(signedDownloadUrl).not.toHaveBeenCalled();
  });
});
