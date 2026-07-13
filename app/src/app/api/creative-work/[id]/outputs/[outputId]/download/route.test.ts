import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "./route";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

const resolveMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("@/server/application/resolve-creative-work-output-download", () => ({
  resolveCreativeWorkOutputDownload: (...args: unknown[]) => resolveMock(...args),
}));

function makeParams(id: string, outputId: string) {
  return Promise.resolve({ id, outputId });
}

describe("GET /api/creative-work/[id]/outputs/[outputId]/download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveMock.mockResolvedValue({
      ok: true,
      value: {
        url: "https://signed.example.com/asset.png",
        outputKey: "creative-work/output-1/out.png",
      },
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redirects to the signed URL by default", async () => {
    const res = await GET(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-1/download"),
      { params: makeParams("work-1", "output-1") }
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://signed.example.com/asset.png");
    expect(resolveMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      workItemId: "work-1",
      outputId: "output-1",
    });
  });

  it("returns JSON when ?format=json is set", async () => {
    const res = await GET(
      new Request(
        "http://localhost/api/creative-work/work-1/outputs/output-1/download?format=json"
      ),
      { params: makeParams("work-1", "output-1") }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.url).toBe("https://signed.example.com/asset.png");
  });

  it("returns JSON when Accept: application/json", async () => {
    const res = await GET(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-1/download", {
        headers: { Accept: "application/json" },
      }),
      { params: makeParams("work-1", "output-1") }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.url).toBe("https://signed.example.com/asset.png");
  });

  it("maps work_not_found to 404", async () => {
    resolveMock.mockResolvedValue({
      ok: false,
      error: { code: "work_not_found" },
    });

    const res = await GET(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-1/download"),
      { params: makeParams("work-1", "output-1") }
    );

    expect(res.status).toBe(404);
  });

  it("maps output_not_found to 404", async () => {
    resolveMock.mockResolvedValue({
      ok: false,
      error: { code: "output_not_found" },
    });

    const res = await GET(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-1/download"),
      { params: makeParams("work-1", "output-1") }
    );

    expect(res.status).toBe(404);
  });

  it("maps output_not_ready to 409", async () => {
    resolveMock.mockResolvedValue({
      ok: false,
      error: { code: "output_not_ready", status: "failed" },
    });

    const res = await GET(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-1/download"),
      { params: makeParams("work-1", "output-1") }
    );

    expect(res.status).toBe(409);
  });
});
