import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));
vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string) => `${ns}.${key}`,
  useLocale: () => "pt-BR",
}));

import { apiFetch } from "@/lib/api-client";
import RoundItemPanel from "./RoundItemPanel";
import type { RoundDetailItemView } from "./types";

const mockApiFetch = vi.mocked(apiFetch);

const ROUND_ID = "550e8400-e29b-41d4-a716-446655440010";
const WORKSPACE_ID = "550e8400-e29b-41d4-a716-446655440001";
const ACCOUNT_ID = "550e8400-e29b-41d4-a716-446655440002";
const ITEM_ID = "550e8400-e29b-41d4-a716-446655440020";

function detail(overrides: Partial<RoundDetailItemView> = {}): RoundDetailItemView {
  return {
    item: {
      id: ITEM_ID,
      frontId: "front-1",
      batchId: "batch-1",
      status: "awaiting_approval",
      scheduledFor: null,
      deadlineAt: null,
      destination: null,
      currentVersionHash: "hash-v1",
      createdAt: "2026-11-17T16:20:00.000Z",
    },
    versions: [],
    evaluatedAttempt: {
      id: "ver-1",
      itemId: ITEM_ID,
      versionHash: "hash-v1",
      creativeWorkOutputId: null,
      caption: "3 cafés especiais + caneca.",
      scheduledFor: null,
      destination: null,
      authorRole: "writer",
      authorId: null,
      reviewerFindings: ["Garanta já foge da voz aprovada"],
      createdAt: "2026-11-17T16:20:00.000Z",
    },
    score: null,
    quality: {
      returned: null,
      corrected: null,
      released: null,
      critical: null,
      withdrawn: null,
      classification: null,
    },
    client: { verdict: "none", clientCategory: null, effectiveCategory: null },
    ...overrides,
  };
}

function scored(rubric: Record<string, number>) {
  return {
    id: "score-1",
    roundId: ROUND_ID,
    itemId: ITEM_ID,
    versionHash: "hash-v1",
    rubric,
    verdict: "fail",
    feedback: null,
    relaxed: false,
    evidence: null,
    scoredBy: null,
    createdAt: "2026-11-18T14:30:00.000Z",
  };
}

function renderPanel(item: RoundDetailItemView) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RoundItemPanel
        roundId={ROUND_ID}
        workspaceId={WORKSPACE_ID}
        accountId={ACCOUNT_ID}
        detail={item}
        position={{ current: 2, total: 3 }}
        onChanged={() => {}}
      />
    </QueryClientProvider>,
  );
}

describe("RoundItemPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("disables release as-is when a dimension is below 3", () => {
    renderPanel(detail({ score: scored({ facts: 4, brand: 3, usefulness: 4, execution: 2 }) }));
    const release = screen.getByRole("button", { name: "equipe.round.releaseSubmit" });
    expect(release).toBeDisabled();
    expect(
      screen.getByText((_, element) => element?.textContent?.startsWith("13/16") === true),
    ).toBeInTheDocument();
  });

  it("enables release as-is once every dimension reaches 3", () => {
    renderPanel(detail({ score: scored({ facts: 4, brand: 3, usefulness: 4, execution: 3 }) }));
    const release = screen.getByRole("button", { name: "equipe.round.releaseSubmit" });
    expect(release).toBeEnabled();
  });

  it("requires evidence when loosening a fact rejection to taste", () => {
    renderPanel(
      detail({
        client: { verdict: "fact_brand_rejection", clientCategory: "fact", effectiveCategory: "fact" },
      }),
    );
    const evidence = screen.getByLabelText(/equipe\.round\.classifyEvidence/);
    expect(evidence).toBeRequired();
  });

  it("reads the attempt author translated, never the raw role", () => {
    renderPanel(detail());
    expect(
      screen.getByText(/equipe\.labels\.agentRole\.writer/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^writer · /)).not.toBeInTheDocument();
  });

  it("scores the attempt through score_attempt as quality", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    } as Response);

    renderPanel(detail());
    fireEvent.click(screen.getByRole("button", { name: "equipe.round.scoreSubmit" }));

    await waitFor(() => {
      expect(screen.getByText("equipe.round.scoreDone")).toBeInTheDocument();
    });
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockApiFetch.mock.calls[0]!;
    expect(url).toBe("/api/equipe/staff/commands");
    expect(JSON.parse(String(init?.body))).toEqual({
      type: "score_attempt",
      payload: {
        roundId: ROUND_ID,
        itemId: ITEM_ID,
        facts: 0,
        brand: 0,
        usefulness: 0,
        execution: 0,
      },
      role: "quality",
      workspaceId: WORKSPACE_ID,
      accountId: ACCOUNT_ID,
    });
  });
});
