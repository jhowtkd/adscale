import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

vi.mock("@/server/auth/require-platform-owner", () => ({
  requirePlatformOwner: vi.fn(),
}));

vi.mock("@/server/repositories/calibration-signal", () => ({
  listCalibrationSignalsForClientProfile: vi.fn(),
}));

vi.mock("@/server/brand-taste/taste-profile", () => ({
  buildBrandTasteProfile: vi.fn(),
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
import { listCalibrationSignalsForClientProfile } from "@/server/repositories/calibration-signal";
import { buildBrandTasteProfile } from "@/server/brand-taste/taste-profile";
import { db } from "@/server/db";
import { WorkspaceAuthError, AUTH_ERROR_CODES } from "@/server/auth/errors";

const WORKSPACE_ID = "550e8400-e29b-41d4-a716-446655440002";
const CLIENT_PROFILE_ID = "550e8400-e29b-41d4-a716-446655440003";
const UNKNOWN_PROFILE_ID = "550e8400-e29b-41d4-a716-446655440099";

const mockRequireOwner = vi.mocked(requirePlatformOwner);
const mockListSignals = vi.mocked(listCalibrationSignalsForClientProfile);
const mockBuildProfile = vi.mocked(buildBrandTasteProfile);
const mockDbSelect = vi.mocked(db.select);

const tasteProfileFixture = {
  clientProfileId: CLIENT_PROFILE_ID,
  workspaceId: WORKSPACE_ID,
  evidenceLevel: "seed_calibrated" as const,
  sourceComposition: {
    synthetic_fixture: 5,
    operator_imported: 0,
    real_customer: 0,
  },
  positivePatterns: [
    {
      verdict: "entra" as const,
      mismatchBucket: null,
      count: 3,
      sampleDerivationIds: ["d1"],
      rationale: "Pattern",
    },
  ],
  rejectionPatterns: [],
  quasePatterns: [],
  decisionCount: 5,
  comparableCount: 4,
  generatedAt: "2026-06-24T00:00:00.000Z",
  caveats: ["Fixture only"],
};

function mockProfileLookup(profile: { id: string; workspaceId: string } | null) {
  const limitMock = vi.fn().mockResolvedValue(profile ? [profile] : []);
  const whereMock = vi.fn(() => ({ limit: limitMock }));
  const fromMock = vi.fn(() => ({ where: whereMock }));
  mockDbSelect.mockReturnValue({ from: fromMock } as never);
}

async function callGet(clientProfileId: string) {
  return GET(new Request("http://localhost/api/admin/quality/brands/profile"), {
    params: Promise.resolve({ clientProfileId }),
  });
}

describe("GET /api/admin/quality/brands/[clientProfileId]/profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireOwner.mockResolvedValue({
      user: { id: "owner-1", email: "owner@test.com" },
    });
    mockProfileLookup({ id: CLIENT_PROFILE_ID, workspaceId: WORKSPACE_ID });
    mockListSignals.mockResolvedValue([]);
    mockBuildProfile.mockReturnValue(tasteProfileFixture);
  });

  it("returns taste profile with helper fields for platform owner", async () => {
    const res = await callGet(CLIENT_PROFILE_ID);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.evidenceLevel).toBe("seed_calibrated");
    expect(body.sourceComposition).toEqual(tasteProfileFixture.sourceComposition);
    expect(body.caveats).toEqual(["Fixture only"]);
    expect(body.positivePatterns).toHaveLength(1);
    expect(body.fixtureOnly).toBe(true);
    expect(body.corpusSignalsNote).toBeNull();
    expect(mockListSignals).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      clientProfileId: CLIENT_PROFILE_ID,
    });
    expect(mockBuildProfile).toHaveBeenCalledWith({
      clientProfileId: CLIENT_PROFILE_ID,
      workspaceId: WORKSPACE_ID,
      signals: [],
    });
  });

  it("sets corpusSignalsNote when decisionCount is zero", async () => {
    mockBuildProfile.mockReturnValue({
      ...tasteProfileFixture,
      decisionCount: 0,
      evidenceLevel: "uncalibrated",
      sourceComposition: {
        synthetic_fixture: 0,
        operator_imported: 0,
        real_customer: 0,
      },
      caveats: [],
    });

    const res = await callGet(CLIENT_PROFILE_ID);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fixtureOnly).toBe(false);
    expect(body.corpusSignalsNote).toContain("avaliações de corpus");
  });

  it("returns 403 when not platform owner", async () => {
    mockRequireOwner.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden")
    );

    const res = await callGet(CLIENT_PROFILE_ID);

    expect(res.status).toBe(403);
    expect(mockListSignals).not.toHaveBeenCalled();
  });

  it("returns 404 for unknown clientProfileId", async () => {
    mockProfileLookup(null);

    const res = await callGet(UNKNOWN_PROFILE_ID);

    expect(res.status).toBe(404);
    expect(mockListSignals).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid clientProfileId", async () => {
    const res = await callGet("not-a-uuid");

    expect(res.status).toBe(400);
    expect(mockListSignals).not.toHaveBeenCalled();
  });
});
