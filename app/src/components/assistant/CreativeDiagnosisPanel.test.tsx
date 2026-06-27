import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import CreativeDiagnosisPanel from "./CreativeDiagnosisPanel";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    if (values?.field) return `${key}:${values.field}`;
    if (values?.action) return `${key}:${values.action}`;
    return key;
  },
}));

vi.mock("@/lib/hooks/use-guided-flow-commands", () => ({
  useGuidedFlowCommand: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

const guidedFlow = {
  id: "flow-1",
  workspaceId: "ws-1",
  clientProfileId: "cp-1",
  threadId: "t-1",
  path: "existing_creative" as const,
  status: "active" as const,
  currentStep: "review_diagnosis",
  slots: {
    diagnosis: {
      detectedConcept: "Promo visual",
      elementsToPreserve: ["CTA"],
      variationOpportunities: ["More contrast"],
    },
    assumptions: ["Promo visual"],
    recommendedAction: "quick_restyle",
  },
  missingFields: ["audience"],
  assetIds: ["asset-1"],
  referenceIds: [],
  campaignId: "camp-1",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("CreativeDiagnosisPanel", () => {
  it("renders diagnosis content and confirm button", () => {
    render(<CreativeDiagnosisPanel threadId="t-1" guidedFlow={guidedFlow} />);

    expect(screen.getByTestId("creative-diagnosis-panel")).toBeInTheDocument();
    expect(screen.getAllByText("Promo visual").length).toBeGreaterThan(0);
    expect(screen.getByTestId("acknowledge-diagnosis")).toBeInTheDocument();
  });

  it("shows missing fields with correction affordance", () => {
    render(<CreativeDiagnosisPanel threadId="t-1" guidedFlow={guidedFlow} />);
    expect(screen.getByText("audience")).toBeInTheDocument();
    expect(screen.getByText("correct")).toBeInTheDocument();
  });
});
