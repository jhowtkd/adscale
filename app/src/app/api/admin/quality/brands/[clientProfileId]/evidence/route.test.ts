import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

vi.mock("@/server/auth/require-platform-owner", () => ({
  requirePlatformOwner: vi.fn(),
}));

vi.mock("@/server/repositories/calibration-signal", () => ({
  listCalibrationSignalsForClientProfile: vi.fn(),
}));

vi.mock("@/server/brand-taste/calibration-evidence", () => ({
  buildPerBrandEvidenceReport: vi.fn(),
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
import { buildPerBrandEvidenceReport } from "@/server/brand-taste/calibration-evidence";
import { db } from "@/server/db";
import { WorkspaceAuthError, AUTH_ERROR_CODES } from "@/server/auth/errors";

const WORKSPACE_ID = "550e8400-e29b-41d4-a716-446655440002";
const CLIENT_PROFILE_ID = "550e8400-e29b-41d4-a716-446655440003";
const UNKNOWN_PROFILE_ID = "550e8400-e29b-41d4-a716-446655440099";

const mockRequireOwner = vi.mocked(requirePlatformOwner);
const mockListSignals = vi.mocked(listCalibrationSignalsForClientProfile);
const mockBuildReport = vi.mocked(buildPerBrandEvidenceReport);
const mockDbSelect = vi.mocked(db.select);

const evidenceReportFixture = {
  schemaVersion: 1 as const,
  capturedAt: "2026-06-24T00:00:00.000Z",
  clientProfileId: CLIENT_PROFILE_ID,
  workspaceId: WORKSPACE_ID,
  evidenceLevel: "assisted" as const,
  decisionCount: 15,
  comparableCount: 12,
  agreementRate: 0.85,
  sourceComposition: {
    synthetic_fixture: 15,
    operator_imported: 0,
    real_customer: 0,
  },
  fixtureOnly: true,
  fixtureCaveat:
    "Evidência apenas de fixture/operador — não validado com cliente real",
  claimsAllowed: ["calibrated_from_operator_decisions", "system_applies_learned_brand_criteria"],
  claimsBlocked: [
    "customer_real_validation",
    "commercial_quality_claim",
    "validated_against_customer_real",
  ],
  withheldClaims: [
    "customer_real_validation",
    "commercial_quality_claim",
    "validated_against_customer_real",
  ],
  missingConditions: [
    "Sinais apenas de fixture/operador — validação com cliente real bloqueada até amostra real.",
  ],
  caveats: ["All calibration signals are fixture or operator-imported — not customer-real validation."],
};

function mockProfileLookup(profile: { id: string; workspaceId: string } | null) {
  const limitMock = vi.fn().mockResolvedValue(profile ? [profile] : []);
  const whereMock = vi.fn(() => ({ limit: limitMock }));
  const fromMock = vi.fn(() => ({ where: whereMock }));
  mockDbSelect.mockReturnValue({ from: fromMock } as never);
}

async function callGet(clientProfileId: string) {
  return GET(new Request("http://localhost/api/admin/quality/brands/evidence"), {
    params: Promise.resolve({ clientProfileId }),
  });
}

describe("GET /api/admin/quality/brands/[clientProfileId]/evidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireOwner.mockResolvedValue({
      user: { id: "owner-1", email: "owner@test.com" },
    });
    mockProfileLookup({ id: CLIENT_PROFILE_ID, workspaceId: WORKSPACE_ID });
    mockListSignals.mockResolvedValue([]);
    mockBuildReport.mockReturnValue(evidenceReportFixture);
  });

  it("returns 200 with full per-brand evidence report for platform owner", async () => {
    const res = await callGet(CLIENT_PROFILE_ID);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.report.evidenceLevel).toBe("assisted");
    expect(body.report.claimsAllowed).toEqual(evidenceReportFixture.claimsAllowed);
    expect(body.report.claimsBlocked).toEqual(evidenceReportFixture.claimsBlocked);
    expect(body.report.missingConditions).toEqual(
      evidenceReportFixture.missingConditions
    );
    expect(body.report.fixtureCaveat).toBe(evidenceReportFixture.fixtureCaveat);
    expect(mockListSignals).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      clientProfileId: CLIENT_PROFILE_ID,
    });
    expect(mockBuildReport).toHaveBeenCalledWith({
      clientProfileId: CLIENT_PROFILE_ID,
      workspaceId: WORKSPACE_ID,
      signals: [],
    });
  });

  it("returns fixtureOnly true and non-null fixtureCaveat for fixture-only signals", async () => {
    mockBuildReport.mockReturnValue({
      ...evidenceReportFixture,
      fixtureOnly: true,
      fixtureCaveat: evidenceReportFixture.fixtureCaveat,
    });

    const res = await callGet(CLIENT_PROFILE_ID);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.report.fixtureOnly).toBe(true);
    expect(body.report.fixtureCaveat).not.toBeNull();
    expect(body.report.fixtureCaveat).toContain("fixture");
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
