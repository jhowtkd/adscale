import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import DerivationReviewSheet from "./DerivationReviewSheet";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    if (values?.name) return `${key}:${values.name}`;
    return key;
  },
}));

vi.mock("next/image", () => ({
  default: (props: { alt: string }) => <img alt={props.alt} />,
}));

vi.mock("@/components/feedback/ContextualFeedbackButton", () => ({
  default: () => null,
}));

const derivation = {
  id: "derivation-1",
  campaignId: "campaign-1",
  name: "Test Derivation",
  status: "completed" as const,
  platform: "Meta" as const,
  prompt: "Test prompt",
  creditCost: 2.4,
  imageUrl: "/test.png",
  format: "4:5",
  generationMode: "format_adaptation" as const,
  qualityVerdict: "invalid" as const,
  hardFailures: [{ code: "cta_drift", message: "CTA not visible" }],
  createdAt: new Date(),
};

describe("DerivationReviewSheet", () => {
  it("renders contract and quality panels for a derivation", () => {
    render(
      <DerivationReviewSheet
        open
        derivation={derivation}
        onOpenChange={vi.fn()}
        onRegenerateWithFixes={vi.fn()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );

    expect(screen.getByText("reviewTitle:Test Derivation")).toBeInTheDocument();
    expect(screen.getByText("contractPanelTitle")).toBeInTheDocument();
    expect(screen.getByText("qualityPanelTitle")).toBeInTheDocument();
    expect(screen.getByText("hardFailureCodes.cta_drift")).toBeInTheDocument();
    expect(screen.getByText("CTA not visible")).toBeInTheDocument();
    expect(screen.getByText("blockingFailureHint")).toBeInTheDocument();
    expect(screen.getByText("generationMode.format_adaptation")).toBeInTheDocument();
  });
});
