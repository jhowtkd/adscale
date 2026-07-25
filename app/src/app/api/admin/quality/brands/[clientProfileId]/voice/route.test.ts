import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

vi.mock("@/server/auth/require-platform-owner", () => ({
  requirePlatformOwner: vi.fn(),
}));

vi.mock("@/server/repositories/client-profile-olhar-config", () => ({
  getOlharVoiceConfigByClientProfileId: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import { getOlharVoiceConfigByClientProfileId } from "@/server/repositories/client-profile-olhar-config";
import { db } from "@/server/db";
import { WorkspaceAuthError, AUTH_ERROR_CODES } from "@/server/auth/errors";

const WORKSPACE_ID = "550e8400-e29b-41d4-a716-446655440002";
const CLIENT_PROFILE_ID = "550e8400-e29b-41d4-a716-446655440003";
const UNKNOWN_PROFILE_ID = "550e8400-e29b-41d4-a716-446655440099";

const mockRequireOwner = vi.mocked(requirePlatformOwner);
const mockGetVoiceConfig = vi.mocked(getOlharVoiceConfigByClientProfileId);
const mockDbSelect = vi.mocked(db.select);

const voiceConfigFixture = {
  clientProfileId: CLIENT_PROFILE_ID,
  workspaceId: WORKSPACE_ID,
  voiceId: "cenbrap",
  displayName: "Cenbrap",
  config: {
    principles: ["Principle one"],
    positiveSignals: ["Positive"],
    negativeSignals: ["Negative"],
    authorityAndClaims: ["Authority"],
    inviteRhythm: ["Invite"],
    correctButSoulless: ["Soulless"],
    matchTerms: ["cenbrap"],
  },
  reviewStatus: "approved" as const,
  source: "seeded",
  approvedAt: new Date("2026-06-23T00:00:00.000Z"),
  approvedBy: null,
  createdAt: new Date("2026-06-23T00:00:00.000Z"),
  updatedAt: new Date("2026-06-23T00:00:00.000Z"),
};

function mockProfileLookup(profile: { id: string; workspaceId: string } | null) {
  const limitMock = vi.fn().mockResolvedValue(profile ? [profile] : []);
  const whereMock = vi.fn(() => ({ limit: limitMock }));
  const fromMock = vi.fn(() => ({ where: whereMock }));
  mockDbSelect.mockReturnValue({ from: fromMock } as never);
}

async function callGet(clientProfileId: string) {
  return GET(new Request("http://localhost/api/admin/quality/brands/voice"), {
    params: Promise.resolve({ clientProfileId }),
  });
}

describe("GET /api/admin/quality/brands/[clientProfileId]/voice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireOwner.mockResolvedValue({
      user: { id: "owner-1", email: "owner@test.com" },
    });
    mockProfileLookup({ id: CLIENT_PROFILE_ID, workspaceId: WORKSPACE_ID });
    mockGetVoiceConfig.mockResolvedValue(voiceConfigFixture);
  });

  it("returns voice config for platform owner when config exists", async () => {
    const res = await callGet(CLIENT_PROFILE_ID);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clientProfileId).toBe(CLIENT_PROFILE_ID);
    expect(body.workspaceId).toBe(WORKSPACE_ID);
    expect(body.voiceId).toBe("cenbrap");
    expect(body.displayName).toBe("Cenbrap");
    expect(body.reviewStatus).toBe("approved");
    expect(body.source).toBe("seeded");
    expect(body.config.principles).toEqual(["Principle one"]);
    expect(body.approvedAt).toBe("2026-06-23T00:00:00.000Z");
    expect(mockGetVoiceConfig).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      clientProfileId: CLIENT_PROFILE_ID,
    });
  });

  it("returns 403 when not platform owner", async () => {
    mockRequireOwner.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden")
    );

    const res = await callGet(CLIENT_PROFILE_ID);

    expect(res.status).toBe(403);
    expect(mockGetVoiceConfig).not.toHaveBeenCalled();
  });

  it("returns 404 for unknown clientProfileId", async () => {
    mockProfileLookup(null);

    const res = await callGet(UNKNOWN_PROFILE_ID);

    expect(res.status).toBe(404);
    expect(mockGetVoiceConfig).not.toHaveBeenCalled();
  });

  it("returns 404 when voice config is missing", async () => {
    mockGetVoiceConfig.mockResolvedValue(null);

    const res = await callGet(CLIENT_PROFILE_ID);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("voice_config_not_found");
  });

  it("returns 400 for invalid clientProfileId", async () => {
    const res = await callGet("not-a-uuid");

    expect(res.status).toBe(400);
    expect(mockGetVoiceConfig).not.toHaveBeenCalled();
  });
});
