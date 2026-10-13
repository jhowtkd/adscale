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
vi.mock("@/server/brand-taste/proposal-evidence", () => ({ loadProposalEvidence: vi.fn(), getProposalEvidencePieceKey: vi.fn() }));
vi.mock("@/server/storage", () => ({ objectStorage: { signedDownloadUrl: vi.fn() } }));

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
import { loadProposalEvidence, getProposalEvidencePieceKey } from "@/server/brand-taste/proposal-evidence";
import { objectStorage } from "@/server/storage";
import { WorkspaceAuthError, AUTH_ERROR_CODES } from "@/server/auth/errors";

const WORKSPACE_ID = "550e8400-e29b-41d4-a716-446655440002";
const CLIENT_PROFILE_ID = "550e8400-e29b-41d4-a716-446655440003";
const UNKNOWN_PROFILE_ID = "550e8400-e29b-41d4-a716-446655440099";
const PROPOSAL_ID = "550e8400-e29b-41d4-a716-446655440010";
const EVIDENCE_ID = "550e8400-e29b-41d4-a716-446655440011";

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
    vi.mocked(loadProposalEvidence).mockResolvedValue({ id: PROPOSAL_ID, kind: "rule", caveats: ["Amostra pequena"], support: [
      { kind: "feedback_artifact", id: EVIDENCE_ID, availability: "available", label: "Feedback do corpus", summary: "Regenerar", pieceHref: "/authenticated" },
    ] });
    vi.mocked(getProposalEvidencePieceKey).mockResolvedValue("test/owned-piece.png");
    vi.mocked(objectStorage.signedDownloadUrl).mockResolvedValue("https://storage.example.test/temporary-signature");
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

  async function proposalGet(query = `proposalKind=rule&proposalId=${PROPOSAL_ID}`) {
    return GET(new Request(`http://localhost/api/admin/quality/brands/${CLIENT_PROFILE_ID}/evidence?${query}`), {
      params: Promise.resolve({ clientProfileId: CLIENT_PROFILE_ID }),
    });
  }

  it.each(["rule", "corpus_quality"])("loads %s evidence under the brand's actual workspace", async proposalKind => {
    const response = await proposalGet(`proposalKind=${proposalKind}&proposalId=${PROPOSAL_ID}`);
    expect(response.status).toBe(200);
    expect((await response.json()).proposal.support[0]).toMatchObject({ kind: "feedback_artifact", availability: "available" });
    expect(loadProposalEvidence).toHaveBeenCalledWith({ workspaceId: WORKSPACE_ID, clientProfileId: CLIENT_PROFILE_ID, proposalKind, proposalId: PROPOSAL_ID });
    expect(mockListSignals).not.toHaveBeenCalled();
    expect(objectStorage.signedDownloadUrl).not.toHaveBeenCalled();
  });

  it("rejects unknown or out-of-scope proposals without claiming evidence was checked", async () => {
    vi.mocked(loadProposalEvidence).mockResolvedValue(null);
    const response = await proposalGet();
    expect(response.status).toBe(404);
    expect(getProposalEvidencePieceKey).not.toHaveBeenCalled();
  });

  it("returns missing and removed references unchanged, without signing them", async () => {
    vi.mocked(loadProposalEvidence).mockResolvedValue({ id: PROPOSAL_ID, kind: "rule", caveats: ["Evidência indisponível"], support: [
      { kind: "feedback_artifact", id: EVIDENCE_ID, availability: "removed", label: "Feedback do corpus", summary: null, pieceHref: null },
    ] });
    const response = await proposalGet();
    expect((await response.json()).proposal.support[0]).toMatchObject({ availability: "removed", summary: null, pieceHref: null });
    expect(objectStorage.signedDownloadUrl).not.toHaveBeenCalled();
    expect((await proposalGet(`proposalKind=rule&proposalId=${PROPOSAL_ID}&evidenceKind=feedback_artifact&evidenceId=${EVIDENCE_ID}&view=piece`)).status).toBe(404);
    expect(getProposalEvidencePieceKey).not.toHaveBeenCalled();
  });

  it("opens only an available proposal piece through a fresh authenticated redirect", async () => {
    const response = await proposalGet(`proposalKind=rule&proposalId=${PROPOSAL_ID}&evidenceKind=feedback_artifact&evidenceId=${EVIDENCE_ID}&view=piece`);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://storage.example.test/temporary-signature");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(getProposalEvidencePieceKey).toHaveBeenCalledWith({ workspaceId: WORKSPACE_ID, clientProfileId: CLIENT_PROFILE_ID }, { kind: "feedback_artifact", id: EVIDENCE_ID });
    expect(objectStorage.signedDownloadUrl).toHaveBeenCalledExactlyOnceWith("test/owned-piece.png");
  });

  it("does not open an arbitrary reference outside the selected proposal", async () => {
    const response = await proposalGet(`proposalKind=rule&proposalId=${PROPOSAL_ID}&evidenceKind=feedback_artifact&evidenceId=${UNKNOWN_PROFILE_ID}&view=piece`);
    expect(response.status).toBe(404);
    expect(getProposalEvidencePieceKey).not.toHaveBeenCalled();
    expect(objectStorage.signedDownloadUrl).not.toHaveBeenCalled();
  });

  it("does not resolve or sign proposal evidence without platform-owner authorization", async () => {
    mockRequireOwner.mockRejectedValue(new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden"));
    expect((await proposalGet()).status).toBe(403);
    expect(loadProposalEvidence).not.toHaveBeenCalled();
    expect(objectStorage.signedDownloadUrl).not.toHaveBeenCalled();
  });

  it.each([`proposalId=${PROPOSAL_ID}`, "proposalKind=rule&proposalId=invalid", `proposalKind=rule&proposalId=${PROPOSAL_ID}&view=piece`])("rejects incomplete proposal queries (%s)", async query => {
    expect((await proposalGet(query)).status).toBe(400);
    expect(loadProposalEvidence).not.toHaveBeenCalled();
  });
});
