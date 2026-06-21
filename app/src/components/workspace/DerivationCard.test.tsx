import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import DerivationCard from "./DerivationCard";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "pt-BR",
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
  it("does not pin generating progress at 52% for the first card", () => {
    render(
      <DerivationCard
        derivation={{
          ...baseDerivation,
          status: "generating",
          imageUrl: undefined,
        }}
        index={0}
        onPreview={vi.fn()}
      />
    );

    expect(screen.queryByText("52%")).not.toBeInTheDocument();
    expect(screen.getByText("8%")).toBeInTheDocument();
  });

  it("advances generating progress over time", () => {
    vi.useFakeTimers();
    try {
      render(
        <DerivationCard
          derivation={{
            ...baseDerivation,
            status: "generating",
            imageUrl: undefined,
          }}
          index={0}
          onPreview={vi.fn()}
        />
      );

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      const progressLabel = screen.getByText(/\d+%/);
      const progressValue = Number(progressLabel.textContent?.replace("%", ""));
      expect(progressValue).toBeGreaterThan(8);
      expect(progressValue).toBeLessThan(90);
    } finally {
      vi.useRealTimers();
    }
  });

  it("hides generating overlay when imageUrl is already available", () => {
    render(
      <DerivationCard
        derivation={{
          ...baseDerivation,
          status: "generating",
          imageUrl: "/preview-ready.png",
        }}
        index={0}
        onPreview={vi.fn()}
      />
    );

    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument();
  });

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

  it("shows disabled generate landing page for approved derivations with images", () => {
    render(
      <DerivationCard
        derivation={baseDerivation}
        index={0}
        onPreview={vi.fn()}
        onGenerateLandingPage={vi.fn()}
      />
    );

    const btn = screen.getByRole("button", { name: /generateLandingPage/i });
    expect(btn).toBeInTheDocument();
    expect(btn).toBeDisabled();
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

  it("does not call onGenerateLandingPage when clicked", () => {
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
    expect(onGenerateLandingPage).not.toHaveBeenCalled();
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
          hardFailures: [{ code: "cta_drift", message: "CTA not visible" }],
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
    expect(screen.getByText("hardFailureCodes.cta_drift")).toBeInTheDocument();
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

  it("shows Olhar and Exportacao badges before score", () => {
    render(
      <DerivationCard
        derivation={{
          ...baseDerivation,
          status: "completed",
          qualityScore: 82,
          olharVerdict: {
            value: "pronta",
            axes: { figura: 3, gestalt: 2, voz: 2, convite: 2 },
            whatWorks: ["Strong silhouette"],
            whatBlocks: [],
            directionNote: "Ready for export.",
            source: "quality_gate",
            evaluatedAt: "2026-06-19T00:00:00.000Z",
          },
          exportStatus: {
            value: "ok",
            issues: [],
            setupIssues: [],
            evaluatedAt: "2026-06-19T00:00:00.000Z",
          },
        }}
        index={0}
        onPreview={vi.fn()}
      />
    );

    const olhar = screen.getByText("olharVerdict.pronta");
    const exportacao = screen.getByText("exportStatus.ok");
    const score = screen.getByText("82");
    expect(olhar.compareDocumentPosition(score) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(exportacao.compareDocumentPosition(score) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows package blocked hint for sem_opiniao olhar verdict", () => {
    render(
      <DerivationCard
        derivation={{
          ...baseDerivation,
          status: "completed",
          olharVerdict: {
            value: "sem_opiniao",
            axes: { figura: 1, gestalt: 1, voz: 1, convite: 0 },
            whatWorks: [],
            whatBlocks: ["No dominant idea"],
            directionNote: "Rebuild around a clearer figure.",
            source: "quality_gate",
            evaluatedAt: "2026-06-19T00:00:00.000Z",
          },
        }}
        index={0}
        onPreview={vi.fn()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );

    expect(screen.getByText("packageBlockedOlhar")).toBeInTheDocument();
    expect(screen.getByText("olharVerdict.sem_opiniao")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /approve/i })).toBeDisabled();
  });

  it("shows blocked export badge and package hint", () => {
    render(
      <DerivationCard
        derivation={{
          ...baseDerivation,
          status: "completed",
          exportStatus: {
            value: "bloqueado",
            issues: [{ code: "cta_drift", message: "CTA missing" }],
            setupIssues: [],
            evaluatedAt: "2026-06-19T00:00:00.000Z",
          },
        }}
        index={0}
        onPreview={vi.fn()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );

    expect(screen.getByText("exportStatus.bloqueado")).toBeInTheDocument();
    expect(screen.getByText("packageBlockedExport")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /approve/i })).toBeDisabled();
  });

  it("stacks title and date above wrapping badges to avoid overlap", () => {
    const { container } = render(
      <DerivationCard
        derivation={{
          ...baseDerivation,
          status: "completed",
          name: "Peça 1",
          qualityVerdict: "improvable",
          qualityScore: 86,
          polishSuggestions: ["Needs a quick manual review."],
        }}
        index={0}
        onPreview={vi.fn()}
      />
    );

    const badgesRow = container.querySelector("[data-derivation-badges]");
    expect(badgesRow).toBeTruthy();
    expect(badgesRow).toHaveClass("flex-wrap");

    const title = screen.getByText("Peça 1");
    const date = screen.getByText(/generatedAt/);
    expect(title.closest(".min-w-0")).not.toContainElement(badgesRow);
    expect(date.closest(".min-w-0")).not.toContainElement(badgesRow);
    expect(screen.getByText("improvableOutputBadge")).toBeInTheDocument();
    expect(screen.getByText("86")).toBeInTheDocument();
  });

  it("falls back to legacy invalid badge when olhar verdict is missing", () => {
    render(
      <DerivationCard
        derivation={{
          ...baseDerivation,
          status: "completed",
          qualityVerdict: "invalid",
          hardFailures: [{ code: "cta_drift", message: "CTA not visible" }],
        }}
        index={0}
        onPreview={vi.fn()}
      />
    );

    expect(screen.getByText("invalidOutputBadge")).toBeInTheDocument();
    expect(screen.queryByText(/olharVerdict\./)).not.toBeInTheDocument();
  });
});
