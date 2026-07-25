import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

vi.mock("@/server/auth/require-platform-owner", () => ({
  requirePlatformOwner: vi.fn(),
}));

vi.mock("@/server/human-quality/ingestion/status", () => ({
  getCorpusIngestionStatus: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import { getCorpusIngestionStatus } from "@/server/human-quality/ingestion/status";
import { WorkspaceAuthError, AUTH_ERROR_CODES } from "@/server/auth/errors";

const mockRequireOwner = vi.mocked(requirePlatformOwner);
const mockGetStatus = vi.mocked(getCorpusIngestionStatus);

const statusFixture = {
  eligibleDerivations: 120,
  totalCandidates: 45,
  pendingQueue: 12,
  evaluated: 33,
  blockedMissingClientProfile: 2,
};

describe("GET /api/admin/quality/ingestion/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireOwner.mockResolvedValue({
      user: { id: "owner-1", email: "owner@test.com" },
    });
    mockGetStatus.mockResolvedValue(statusFixture);
  });

  it("returns ingestion status for platform owner", async () => {
    const res = await GET(new Request("http://localhost/api/admin/quality/ingestion/status"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(statusFixture);
    expect(mockGetStatus).toHaveBeenCalledOnce();
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireOwner.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.unauthorized, "Unauthorized")
    );

    const res = await GET(new Request("http://localhost/api/admin/quality/ingestion/status"));

    expect(res.status).toBe(401);
    expect(mockGetStatus).not.toHaveBeenCalled();
  });

  it("returns 403 when not platform owner", async () => {
    mockRequireOwner.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden")
    );

    const res = await GET(new Request("http://localhost/api/admin/quality/ingestion/status"));

    expect(res.status).toBe(403);
    expect(mockGetStatus).not.toHaveBeenCalled();
  });
});
