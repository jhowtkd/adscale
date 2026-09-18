import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "./route";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

const guardMock = vi.hoisted(() => vi.fn());
const listMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth/require-platform-owner", () => ({
  requirePlatformOwner: (...args: unknown[]) => guardMock(...args),
}));

vi.mock("@/server/diagnostics/diagnostics-api", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/server/diagnostics/diagnostics-api")>();
  return {
    ...original,
    listDiagnosticWorks: (...args: unknown[]) => listMock(...args),
  };
});

import {
  AUTH_ERROR_CODES,
  WorkspaceAuthError,
} from "@/server/auth/errors";
import { DiagnosticApiError } from "@/server/diagnostics/diagnostics-api";

function get(url: string) {
  return GET(new Request(url));
}

describe("GET /api/feedback/diagnostics/works", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    guardMock.mockResolvedValue({ user: { id: "owner-1" } });
    listMock.mockResolvedValue({ works: [], nextCursor: null });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists works for the platform owner without shared caching", async () => {
    const response = await get(
      "http://test/api/feedback/diagnostics/works?workspaceId=ws-1&limit=10",
    );
    expect(response.status).toBe(200);
    expect(listMock).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      workItemId: undefined,
      from: undefined,
      to: undefined,
      stage: undefined,
      provider: undefined,
      model: undefined,
      state: undefined,
      sort: undefined,
      cursor: undefined,
      limit: 10,
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("returns 401/403 from the server guard, still private", async () => {
    guardMock.mockRejectedValueOnce(
      new WorkspaceAuthError(AUTH_ERROR_CODES.unauthorized, "Unauthorized"),
    );
    const unauthenticated = await get("http://test/api/feedback/diagnostics/works");
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers.get("Cache-Control")).toBe("private, no-store");

    guardMock.mockRejectedValueOnce(
      new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden"),
    );
    const forbidden = await get("http://test/api/feedback/diagnostics/works");
    expect(forbidden.status).toBe(403);
    expect(forbidden.headers.get("Cache-Control")).toBe("private, no-store");
    expect(listMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid query and module errors", async () => {
    const badQuery = await get(
      "http://test/api/feedback/diagnostics/works?limit=abc",
    );
    expect(badQuery.status).toBe(400);
    expect(badQuery.headers.get("Cache-Control")).toBe("private, no-store");

    listMock.mockRejectedValueOnce(
      new DiagnosticApiError("INVALID_FILTER", "diagnostics: nope"),
    );
    const badFilter = await get(
      "http://test/api/feedback/diagnostics/works?state=nope",
    );
    expect(badFilter.status).toBe(400);
    const body = (await badFilter.json()) as Record<string, unknown>;
    expect(body["code"]).toBe("validation_error");
    expect(JSON.stringify(body)).not.toContain("nope");
  });
});
