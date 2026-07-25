import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

vi.mock("@/server/auth/require-platform-owner", () => ({
  requirePlatformOwner: vi.fn(),
}));

vi.mock("@/server/human-quality/ingestion/backfill", () => ({
  runCorpusBackfillBatch: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import { runCorpusBackfillBatch } from "@/server/human-quality/ingestion/backfill";
import { WorkspaceAuthError, AUTH_ERROR_CODES } from "@/server/auth/errors";

const WORKSPACE_ID = "550e8400-e29b-41d4-a716-446655440002";
const DERIVATION_ID = "550e8400-e29b-41d4-a716-446655440004";

const mockRequireOwner = vi.mocked(requirePlatformOwner);
const mockRunBackfill = vi.mocked(runCorpusBackfillBatch);

const backfillResult = {
  processed: 10,
  created: 8,
  promoted: 5,
  skipped: 2,
  blocked: 1,
  nextCursor: { createdAt: "2026-06-17T10:00:00.000Z", id: DERIVATION_ID },
};

describe("POST /api/admin/quality/ingestion/backfill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireOwner.mockResolvedValue({
      user: { id: "owner-1", email: "owner@test.com" },
    });
    mockRunBackfill.mockResolvedValue(backfillResult);
  });

  it("runs backfill batch for platform owner", async () => {
    const res = await POST(
      new Request("http://localhost/api/admin/quality/ingestion/backfill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          batchSize: 100,
          workspaceId: WORKSPACE_ID,
          cursor: { createdAt: "2026-06-16T10:00:00.000Z", id: DERIVATION_ID },
        }),
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(backfillResult);
    expect(mockRunBackfill).toHaveBeenCalledWith({
      batchSize: 100,
      workspaceId: WORKSPACE_ID,
      cursor: { createdAt: "2026-06-16T10:00:00.000Z", id: DERIVATION_ID },
    });
  });

  it("accepts empty body and uses backfill defaults", async () => {
    const res = await POST(
      new Request("http://localhost/api/admin/quality/ingestion/backfill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      })
    );

    expect(res.status).toBe(200);
    expect(mockRunBackfill).toHaveBeenCalledWith({});
  });

  it("returns 400 for invalid payload", async () => {
    const res = await POST(
      new Request("http://localhost/api/admin/quality/ingestion/backfill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ batchSize: 5000 }),
      })
    );

    expect(res.status).toBe(400);
    expect(mockRunBackfill).not.toHaveBeenCalled();
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireOwner.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.unauthorized, "Unauthorized")
    );

    const res = await POST(
      new Request("http://localhost/api/admin/quality/ingestion/backfill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      })
    );

    expect(res.status).toBe(401);
    expect(mockRunBackfill).not.toHaveBeenCalled();
  });

  it("returns 403 when not platform owner", async () => {
    mockRequireOwner.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden")
    );

    const res = await POST(
      new Request("http://localhost/api/admin/quality/ingestion/backfill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      })
    );

    expect(res.status).toBe(403);
    expect(mockRunBackfill).not.toHaveBeenCalled();
  });
});
