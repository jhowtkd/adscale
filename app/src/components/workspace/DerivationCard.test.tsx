import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DerivationCard from "./DerivationCard";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/lib/hooks/use-export", () => ({
  useExport: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

vi.mock("@/lib/store", () => ({
  useAppStore: () => ({
    addToast: vi.fn(),
  }),
}));

const baseDerivation = {
  id: "derivation-1",
  campaignId: "campaign-1",
  name: "Test Derivation",
  status: "approved" as const,
  platform: "Meta" as const,
  prompt: "Test prompt",
  creditCost: 2.4,
  imageUrl: "/test.png",
  format: "1:1",
  createdAt: new Date(),
};

describe("DerivationCard", () => {
  it("shows package action only for approved derivations with output", () => {
    render(
      <DerivationCard
        derivation={baseDerivation}
        index={0}
        onPreview={vi.fn()}
        onCreateDeliveryPackage={vi.fn()}
      />
    );

    expect(
      screen.getByRole("button", { name: /generatePackage/i })
    ).toBeInTheDocument();
  });

  it("does not show package action for completed but not approved derivations", () => {
    render(
      <DerivationCard
        derivation={{ ...baseDerivation, status: "completed" }}
        index={0}
        onPreview={vi.fn()}
        onCreateDeliveryPackage={vi.fn()}
      />
    );

    expect(
      screen.queryByRole("button", { name: /generatePackage/i })
    ).not.toBeInTheDocument();
  });

  it("does not show package action when imageUrl is missing", () => {
    render(
      <DerivationCard
        derivation={{ ...baseDerivation, imageUrl: undefined }}
        index={0}
        onPreview={vi.fn()}
        onCreateDeliveryPackage={vi.fn()}
      />
    );

    expect(
      screen.queryByRole("button", { name: /generatePackage/i })
    ).not.toBeInTheDocument();
  });

  it("shows QA button for approved derivation with image", () => {
    render(
      <DerivationCard
        derivation={baseDerivation}
        index={0}
        onPreview={vi.fn()}
        onRunQa={vi.fn()}
      />
    );

    expect(
      screen.getByRole("button", { name: /runQa/i })
    ).toBeInTheDocument();
  });

  it("does not show QA button for non-approved derivation", () => {
    render(
      <DerivationCard
        derivation={{ ...baseDerivation, status: "completed" }}
        index={0}
        onPreview={vi.fn()}
        onRunQa={vi.fn()}
      />
    );

    expect(
      screen.queryByRole("button", { name: /runQa/i })
    ).not.toBeInTheDocument();
  });

  it("shows rerun label when QA result exists", () => {
    render(
      <DerivationCard
        derivation={{ ...baseDerivation, qaStatus: "warning", qaIssues: ["Issue 1"] }}
        index={0}
        onPreview={vi.fn()}
        onRunQa={vi.fn()}
      />
    );

    expect(
      screen.getByRole("button", { name: /rerunQa/i })
    ).toBeInTheDocument();
    expect(screen.getByText("Issue 1")).toBeInTheDocument();
  });

  it("calls onRunQa when QA button is clicked", () => {
    const onRunQa = vi.fn();
    render(
      <DerivationCard
        derivation={baseDerivation}
        index={0}
        onPreview={vi.fn()}
        onRunQa={onRunQa}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /runQa/i }));
    expect(onRunQa).toHaveBeenCalledTimes(1);
  });

  it("shows generate landing page for approved derivations with images", () => {
    render(
      <DerivationCard
        derivation={baseDerivation}
        index={0}
        onPreview={vi.fn()}
        onGenerateLandingPage={vi.fn()}
      />
    );

    expect(
      screen.getByRole("button", { name: /generateLandingPage/i })
    ).toBeInTheDocument();
  });

  it("does not show generate landing page for unapproved derivations", () => {
    render(
      <DerivationCard
        derivation={{ ...baseDerivation, status: "completed" }}
        index={0}
        onPreview={vi.fn()}
        onGenerateLandingPage={vi.fn()}
      />
    );

    expect(
      screen.queryByRole("button", { name: /generateLandingPage/i })
    ).not.toBeInTheDocument();
  });

  it("does not show generate landing page when imageUrl is missing", () => {
    render(
      <DerivationCard
        derivation={{ ...baseDerivation, imageUrl: undefined }}
        index={0}
        onPreview={vi.fn()}
        onGenerateLandingPage={vi.fn()}
      />
    );

    expect(
      screen.queryByRole("button", { name: /generateLandingPage/i })
    ).not.toBeInTheDocument();
  });

  it("calls onGenerateLandingPage when clicked", () => {
    const onGenerateLandingPage = vi.fn();
    render(
      <DerivationCard
        derivation={baseDerivation}
        index={0}
        onPreview={vi.fn()}
        onGenerateLandingPage={onGenerateLandingPage}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /generateLandingPage/i }));
    expect(onGenerateLandingPage).toHaveBeenCalledTimes(1);
  });

  it("disables generate landing page when active derivation matches", () => {
    render(
      <DerivationCard
        derivation={baseDerivation}
        index={0}
        onPreview={vi.fn()}
        onGenerateLandingPage={vi.fn()}
        landingPageGeneratingId={baseDerivation.id}
      />
    );

    const btn = screen.getByRole("button", { name: /generateLandingPage/i });
    expect(btn).toBeDisabled();
  });

  it("shows simulate personas button when callback is provided for approved derivation", () => {
    render(
      <DerivationCard
        derivation={baseDerivation}
        index={0}
        onPreview={vi.fn()}
        onSimulatePersonas={vi.fn()}
      />
    );

    expect(
      screen.getByRole("button", { name: /simulatePersonas/i })
    ).toBeInTheDocument();
  });

  it("does not show simulate personas button when callback is not provided", () => {
    render(
      <DerivationCard
        derivation={baseDerivation}
        index={0}
        onPreview={vi.fn()}
      />
    );

    expect(
      screen.queryByRole("button", { name: /simulatePersonas/i })
    ).not.toBeInTheDocument();
  });

  it("calls onSimulatePersonas when clicked", () => {
    const onSimulatePersonas = vi.fn();
    render(
      <DerivationCard
        derivation={baseDerivation}
        index={0}
        onPreview={vi.fn()}
        onSimulatePersonas={onSimulatePersonas}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /simulatePersonas/i }));
    expect(onSimulatePersonas).toHaveBeenCalledTimes(1);
  });

  it("disables simulate personas when active derivation matches", () => {
    render(
      <DerivationCard
        derivation={baseDerivation}
        index={0}
        onPreview={vi.fn()}
        onSimulatePersonas={vi.fn()}
        simulatingPersonasId={baseDerivation.id}
      />
    );

    const btn = screen.getByRole("button", { name: /simulatePersonas/i });
    expect(btn).toBeDisabled();
  });

  it("shows invalid verdict badge and hard failures", () => {
    render(
      <DerivationCard
        derivation={{
          ...baseDerivation,
          status: "completed",
          qualityVerdict: "invalid",
          hardFailures: [{ code: "cta_missing", message: "CTA not visible" }],
          qualityScore: 72,
        }}
        index={0}
        onPreview={vi.fn()}
        onRegenerate={vi.fn()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );

    expect(screen.getByText("invalidOutputBadge")).toBeInTheDocument();
    expect(screen.getByText("CTA not visible")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /regenerateWithFixes/i })).toBeInTheDocument();
  });

  it("shows improvable verdict badge and polish suggestion", () => {
    render(
      <DerivationCard
        derivation={{
          ...baseDerivation,
          status: "completed",
          qualityVerdict: "improvable",
          polishSuggestions: ["Increase CTA contrast"],
        }}
        index={0}
        onPreview={vi.fn()}
      />
    );

    expect(screen.getByText("improvableOutputBadge")).toBeInTheDocument();
    expect(screen.getByText("Increase CTA contrast")).toBeInTheDocument();
  });
});
