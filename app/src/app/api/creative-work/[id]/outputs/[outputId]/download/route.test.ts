import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "./route";
import { AUTH_ERROR_CODES, WorkspaceAuthError } from "@/server/auth/errors";
import { traceExportServed } from "@/server/diagnostics/selection-export-tracing";

const mockTraceServed = vi.mocked(traceExportServed);
const TRACE_CONTEXT = { operationId: "op-trace-1" };

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

const resolveMock = vi.hoisted(() => vi.fn());
const requirePlatformOwnerMock = vi.hoisted(() => vi.fn());
const layerEditorAccessMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("@/server/auth/require-platform-owner", () => ({
  requirePlatformOwner: (...args: unknown[]) => requirePlatformOwnerMock(...args),
}));

vi.mock("@/server/application/resolve-creative-work-output-download", () => ({
  resolveCreativeWorkOutputDownload: (...args: unknown[]) => resolveMock(...args),
}));
vi.mock("@/server/layer-editor/quota", () => ({
  getLayerEditorAccess: (...args: unknown[]) => layerEditorAccessMock(...args),
}));
vi.mock("@/server/diagnostics/selection-export-tracing", () => ({
  traceExportServed: vi.fn(),
}));
vi.mock("@/server/storage/download-response", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/storage/download-response")>();
  return {
    ...original,
    objectDownloadResponse: vi.fn((url: string) =>
      import("next/server").then(({ NextResponse }) =>
        url.startsWith("e2e-storage://")
          ? new NextResponse("bytes", { status: 200 })
          : NextResponse.redirect(url, { status: 302 }),
      ),
    ),
  };
});

function makeParams(id: string, outputId: string) {
  return Promise.resolve({ id, outputId });
}

describe("GET /api/creative-work/[id]/outputs/[outputId]/download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePlatformOwnerMock.mockResolvedValue({ user: { id: "owner-1" } });
    layerEditorAccessMock.mockResolvedValue({ enabled: true });
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
      actorUserId: "user-1",
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
    expect(resolveMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      workItemId: "work-1",
      outputId: "output-1",
      actorUserId: "user-1",
    });
    expect(resolveMock.mock.calls[0]?.[0]).not.toHaveProperty("format");
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

  it("allows entitled members to download PSD and keeps ZIP owner-only", async () => {
    const psd = await GET(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-1/download?format=psd"),
      { params: makeParams("work-1", "output-1") },
    );
    expect(psd.status).toBe(302);
    expect(requirePlatformOwnerMock).not.toHaveBeenCalled();
    expect(layerEditorAccessMock).toHaveBeenCalledOnce();

    const zip = await GET(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-1/download?format=zip"),
      { params: makeParams("work-1", "output-1") },
    );
    expect(zip.status).toBe(302);
    expect(requirePlatformOwnerMock).toHaveBeenCalledOnce();
  });

  it("passes the scoped format to the resolver", async () => {
    const format = "psd";
    const res = await GET(
      new Request(`http://localhost/api/creative-work/work-1/outputs/output-1/download?format=${format}`),
      { params: makeParams("work-1", "output-1") },
    );

    expect(res.status).toBe(302);
    expect(requirePlatformOwnerMock).not.toHaveBeenCalled();
    expect(resolveMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      workItemId: "work-1",
      outputId: "output-1",
      actorUserId: "user-1",
      format,
    });
  });

  it("does not resolve a layered artifact without entitlement", async () => {
    layerEditorAccessMock.mockResolvedValue({ enabled: false });
    const res = await GET(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-1/download?format=psd"),
      { params: makeParams("work-1", "output-1") },
    );

    expect(res.status).toBe(403);
    expect(resolveMock).not.toHaveBeenCalled();
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

  it("journals export.served on the prepared operation for redirects", async () => {
    resolveMock.mockResolvedValue({
      ok: true,
      value: {
        url: "https://signed.example.com/asset.png",
        outputKey: "creative-work/output-1/out.png",
        traceContext: TRACE_CONTEXT,
      },
    });

    const res = await GET(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-1/download"),
      { params: makeParams("work-1", "output-1") }
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://signed.example.com/asset.png");
    expect(mockTraceServed).toHaveBeenCalledTimes(1);
    expect(mockTraceServed).toHaveBeenCalledWith({
      context: TRACE_CONTEXT,
      servedAs: "redirect",
    });
  });

  it("journals export.served as json for JSON responses", async () => {
    resolveMock.mockResolvedValue({
      ok: true,
      value: {
        url: "https://signed.example.com/asset.png",
        outputKey: "creative-work/output-1/out.png",
        traceContext: TRACE_CONTEXT,
      },
    });

    const res = await GET(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-1/download?format=json"),
      { params: makeParams("work-1", "output-1") }
    );

    expect(res.status).toBe(200);
    expect(mockTraceServed).toHaveBeenCalledWith({
      context: TRACE_CONTEXT,
      servedAs: "json",
    });
  });

  it("journals export.served as bytes for streamed downloads", async () => {
    resolveMock.mockResolvedValue({
      ok: true,
      value: {
        url: "e2e-storage://bucket/key",
        outputKey: "creative-work/output-1/out.png",
        traceContext: TRACE_CONTEXT,
      },
    });

    const res = await GET(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-1/download"),
      { params: makeParams("work-1", "output-1") }
    );

    expect(res.status).toBe(200);
    expect(mockTraceServed).toHaveBeenCalledWith({
      context: TRACE_CONTEXT,
      servedAs: "bytes",
    });
  });

  it("serves untraced downloads without journaling", async () => {
    const res = await GET(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-1/download"),
      { params: makeParams("work-1", "output-1") }
    );

    expect(res.status).toBe(302);
    expect(mockTraceServed).not.toHaveBeenCalled();
  });

  it("journals nothing when the download fails", async () => {
    resolveMock.mockResolvedValue({
      ok: false,
      error: { code: "output_not_found" },
    });

    const res = await GET(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-1/download"),
      { params: makeParams("work-1", "output-1") }
    );

    expect(res.status).toBe(404);
    expect(mockTraceServed).not.toHaveBeenCalled();
  });
});
