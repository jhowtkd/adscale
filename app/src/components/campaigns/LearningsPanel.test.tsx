import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import LearningsPanel from "./LearningsPanel";
import messages from "../../../messages/pt-BR.json";

function renderWithIntl(node: ReactNode) {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      {node}
    </NextIntlClientProvider>
  );
}

vi.mock("@/lib/hooks/use-performance-learnings", () => ({
  CONFIDENCE_LABELS: { low: "Baixa", medium: "Média", high: "Alta" },
  useCampaignLearnings: vi.fn(),
  useRecomputeCampaignLearnings: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
}));

import {
  useCampaignLearnings,
  useRecomputeCampaignLearnings,
} from "@/lib/hooks/use-performance-learnings";

describe("LearningsPanel", () => {
  it("prompts for client profile when campaign has none", () => {
    vi.mocked(useCampaignLearnings).mockReturnValue({
      data: { source: "postgres", learnings: [], clientProfileId: null },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useCampaignLearnings>);

    renderWithIntl(<LearningsPanel campaignId="campaign-1" />);
    expect(
      screen.getByText(/Vincule um perfil de cliente à campanha/)
    ).toBeInTheDocument();
  });

  it("renders learning cards with confidence and evidence counts", () => {
    vi.mocked(useCampaignLearnings).mockReturnValue({
      data: {
        source: "postgres",
        clientProfileId: "client-1",
        learnings: [
          {
            id: "learning-1",
            clientProfileId: "client-1",
            variableKey: "cta",
            variableValue: "Comprar agora",
            primaryMetric: "ctr",
            expectedDirection: "increase",
            statement: "CTA tende a aumentar CTR",
            confidence: "medium",
            confidenceScore: "0.5000",
            sampleImpressions: 2500,
            sampleCampaignCount: 1,
            contextPlatforms: ["meta"],
            contextObjectives: ["conversions"],
            supportingEvidence: [{ comparisonId: "c1" } as never],
            contradictingEvidence: [],
            algorithmVersion: "1.0.0",
            status: "approved",
            lastEvidenceAt: "2026-06-01T00:00:00.000Z",
          },
        ],
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useCampaignLearnings>);

    vi.mocked(useRecomputeCampaignLearnings).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as ReturnType<typeof useRecomputeCampaignLearnings>);

    renderWithIntl(<LearningsPanel campaignId="campaign-1" />);
    expect(screen.getByText(/CTA tende a aumentar CTR/)).toBeInTheDocument();
    expect(screen.getByText(/Média/)).toBeInTheDocument();
    expect(screen.getByText(/1 favorável/)).toBeInTheDocument();
  });
});
