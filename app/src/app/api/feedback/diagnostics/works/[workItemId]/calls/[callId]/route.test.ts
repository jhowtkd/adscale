import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "./route";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

const guardMock = vi.hoisted(() => vi.fn());
const callMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth/require-platform-owner", () => ({
  requirePlatformOwner: (...args: unknown[]) => guardMock(...args),
}));

vi.mock("@/server/diagnostics/diagnostics-api", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/server/diagnostics/diagnostics-api")>();
  return {
    ...original,
    getDiagnosticCall: (...args: unknown[]) => callMock(...args),
  };
});

import {
  AUTH_ERROR_CODES,
  WorkspaceAuthError,
} from "@/server/auth/errors";

function get(url: string) {
  return GET(new Request(url), {
    params: Promise.resolve({ workItemId: "work-1", callId: "call-1" }),
  });
}

describe("GET /api/feedback/diagnostics/works/[workItemId]/calls/[callId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    guardMock.mockResolvedValue({
      user: { id: "owner-1", email: "owner@example.com" },
    });
    callMock.mockResolvedValue({ found: true, call: {}, content: {} });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes the session actor and the stated reason, never cached shared", async () => {
    const response = await get(
      "http://test/x?workspaceId=ws-1&reason=incident%20review",
    );
    expect(response.status).toBe(200);
    expect(callMock).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      workItemId: "work-1",
      callId: "call-1",
      actorId: "owner-1",
      reason: "incident review",
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("falls back to the session email when the id is missing", async () => {
    guardMock.mockResolvedValueOnce({
      user: { email: "owner@example.com" },
    });
    await get("http://test/x?workspaceId=ws-1&reason=r");
    expect(callMock).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "owner@example.com" }),
    );
  });

  it("returns 401/403 from the server guard", async () => {
    guardMock.mockRejectedValueOnce(
      new WorkspaceAuthError(AUTH_ERROR_CODES.unauthorized, "Unauthorized"),
    );
    expect(
      (await get("http://test/x?workspaceId=ws-1&reason=r")).status,
    ).toBe(401);
    guardMock.mockRejectedValueOnce(
      new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden"),
    );
    expect(
      (await get("http://test/x?workspaceId=ws-1&reason=r")).status,
    ).toBe(403);
    expect(callMock).not.toHaveBeenCalled();
  });

  it("requires workspaceId and reason", async () => {
    expect((await get("http://test/x?workspaceId=ws-1")).status).toBe(400);
    expect((await get("http://test/x?reason=r")).status).toBe(400);
  });

  it("returns a generic 404 when the call yields no content", async () => {
    callMock.mockResolvedValueOnce({ found: false });
    const response = await get("http://test/x?workspaceId=ws-1&reason=r");
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
