import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import HypothesesPanel from "./HypothesesPanel";

vi.mock("@/lib/hooks/use-hypotheses", () => ({
  useCampaignHypotheses: () => ({ data: { hypotheses: [] }, isLoading: false }),
  useCampaignComparisons: () => ({ data: { comparisons: [] } }),
  useCreateHypothesis: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCompareHypothesis: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteHypothesis: () => ({ mutate: vi.fn() }),
  useObservationalComparison: () => ({ mutateAsync: vi.fn(), isPending: false }),
  VERDICT_LABELS: {
    winner: "Vencedor",
    no_clear_winner: "Sem vencedor",
    insufficient_evidence: "Evidência insuficiente",
    not_comparable: "Não comparável",
  },
  OUTCOME_LABELS: {
    supported: "Suportada",
    contradicted: "Contrariada",
    inconclusive: "Inconclusiva",
  },
}));

describe("HypothesesPanel", () => {
  it("prompts for derivations when fewer than two", () => {
    render(
      <HypothesesPanel
        campaignId="camp-1"
        derivations={[{ id: "d1", label: "A" }]}
      />
    );
    expect(
      screen.getByText(/pelo menos duas derivações/i)
    ).toBeInTheDocument();
  });

  it("renders hypothesis section when derivations exist", () => {
    render(
      <HypothesesPanel
        campaignId="camp-1"
        derivations={[
          { id: "d1", label: "Controle" },
          { id: "d2", label: "Variação" },
        ]}
      />
    );
    expect(screen.getByText(/Hipóteses criativas/i)).toBeInTheDocument();
    expect(screen.getByText(/Comparação observacional/i)).toBeInTheDocument();
  });
});
