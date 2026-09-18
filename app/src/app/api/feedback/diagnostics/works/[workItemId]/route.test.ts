import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "./route";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

const guardMock = vi.hoisted(() => vi.fn());
const detailMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth/require-platform-owner", () => ({
  requirePlatformOwner: (...args: unknown[]) => guardMock(...args),
}));

vi.mock("@/server/diagnostics/diagnostics-api", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/server/diagnostics/diagnostics-api")>();
  return {
    ...original,
    getWorkDiagnostics: (...args: unknown[]) => detailMock(...args),
  };
});

import {
  AUTH_ERROR_CODES,
  WorkspaceAuthError,
} from "@/server/auth/errors";
import { DiagnosticApiError } from "@/server/diagnostics/diagnostics-api";

function get(url: string, workItemId = "work-1") {
  return GET(new Request(url), {
    params: Promise.resolve({ workItemId }),
  });
}

describe("GET /api/feedback/diagnostics/works/[workItemId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    guardMock.mockResolvedValue({ user: { id: "owner-1" } });
    detailMock.mockResolvedValue({ found: true, work: {}, telemetry: {} });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the detail for the platform owner without shared caching", async () => {
    const response = await get(
      "http://test/api/feedback/diagnostics/works/work-1?workspaceId=ws-1",
    );
    expect(response.status).toBe(200);
    expect(detailMock).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      workItemId: "work-1",
      cursor: undefined,
      limit: undefined,
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("returns 401/403 from the server guard", async () => {
    guardMock.mockRejectedValueOnce(
      new WorkspaceAuthError(AUTH_ERROR_CODES.unauthorized, "Unauthorized"),
    );
    expect(
      (await get("http://test/x?workspaceId=ws-1")).status,
    ).toBe(401);
    guardMock.mockRejectedValueOnce(
      new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden"),
    );
    expect(
      (await get("http://test/x?workspaceId=ws-1")).status,
    ).toBe(403);
    expect(detailMock).not.toHaveBeenCalled();
  });

  it("requires workspaceId and maps module errors to 400", async () => {
    const missing = await get("http://test/x");
    expect(missing.status).toBe(400);

    detailMock.mockRejectedValueOnce(
      new DiagnosticApiError("INVALID_CURSOR", "diagnostics: nope"),
    );
    const badCursor = await get("http://test/x?workspaceId=ws-1&cursor=c");
    expect(badCursor.status).toBe(400);
  });

  it("returns a generic 404 when the association yields no content", async () => {
    detailMock.mockResolvedValueOnce({ found: false });
    const response = await get("http://test/x?workspaceId=ws-1");
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["code"]).toBe("not_found");
  });
});
