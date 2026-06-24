import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PerBrandEvidenceReport } from "@/server/brand-taste/calibration-evidence";
import { EVIDENCE_LEVEL_LABELS } from "./calibration-status-copy";
import { BrandEvidencePanel } from "./BrandEvidencePanel";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api-client";

const mockApiFetch = vi.mocked(apiFetch);

const CLIENT_PROFILE_ID = "550e8400-e29b-41d4-a716-446655440003";

const fixtureOnlyReport: PerBrandEvidenceReport = {
  schemaVersion: 1,
  capturedAt: "2026-06-24T00:00:00.000Z",
  clientProfileId: CLIENT_PROFILE_ID,
  workspaceId: "550e8400-e29b-41d4-a716-446655440002",
  evidenceLevel: "assisted",
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
  claimsAllowed: [
    "calibrated_from_operator_decisions",
    "system_applies_learned_brand_criteria",
  ],
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
  caveats: [],
};

const mixedSourceReport: PerBrandEvidenceReport = {
  ...fixtureOnlyReport,
  evidenceLevel: "evidence_backed",
  fixtureOnly: false,
  fixtureCaveat: null,
  sourceComposition: {
    synthetic_fixture: 9,
    operator_imported: 0,
    real_customer: 3,
  },
  claimsAllowed: [
    "calibrated_from_operator_decisions",
    "validated_against_customer_real",
    "system_applies_learned_brand_criteria",
    "agreement_rate_reported",
  ],
  claimsBlocked: ["customer_real_validation", "commercial_quality_claim"],
  withheldClaims: ["customer_real_validation", "commercial_quality_claim"],
  missingConditions: [],
};

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <BrandEvidencePanel clientProfileId={CLIENT_PROFILE_ID} />
    </QueryClientProvider>
  );
}

function mockEvidence(report: PerBrandEvidenceReport) {
  mockApiFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ report }),
  } as Response);
}

describe("BrandEvidencePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders evidence level label and source composition counts", async () => {
    mockEvidence(fixtureOnlyReport);
    renderPanel();

    expect(
      await screen.findByText(EVIDENCE_LEVEL_LABELS.assisted)
    ).toBeInTheDocument();
    expect(screen.getByText("Composição de fontes")).toBeInTheDocument();
    expect(screen.getByText("Fixture sintético")).toBeInTheDocument();
    expect(screen.getByText("15")).toBeInTheDocument();
  });

  it("shows fixtureCaveat banner for fixture-only report", async () => {
    mockEvidence(fixtureOnlyReport);
    renderPanel();

    const caveat = await screen.findByText(fixtureOnlyReport.fixtureCaveat!);
    expect(caveat.closest("div")).toHaveClass("border-amber-500/30");
  });

  it("lists claimsBlocked including validated_against_customer_real for fixture-only", async () => {
    mockEvidence(fixtureOnlyReport);
    renderPanel();

    expect(await screen.findByText("Afirmações bloqueadas")).toBeInTheDocument();
    expect(screen.getByText("Validado contra cliente real")).toBeInTheDocument();
    expect(screen.queryByText("Validado contra cliente real", { selector: "li" })).toBeTruthy();
  });

  it("does not show fixture caveat for mixed-source evidence_backed report", async () => {
    mockEvidence(mixedSourceReport);
    renderPanel();

    await screen.findByText(EVIDENCE_LEVEL_LABELS.evidence_backed);
    expect(
      screen.queryByText(fixtureOnlyReport.fixtureCaveat!)
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Validado contra cliente real")).not.toBeInTheDocument();
  });

  it("renders missingConditions as bullet list when non-empty", async () => {
    mockEvidence(fixtureOnlyReport);
    renderPanel();

    expect(await screen.findByText("Condições pendentes")).toBeInTheDocument();
    expect(
      screen.getByText(fixtureOnlyReport.missingConditions[0])
    ).toBeInTheDocument();
  });

  it("shows forbidden copy on 403", async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 403 } as Response);
    renderPanel();

    expect(
      await screen.findByText(/restrito a proprietários da plataforma/i)
    ).toBeInTheDocument();
  });
});
