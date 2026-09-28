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
import RoundDetail from "./RoundDetail";
import type { RoundDetailView } from "./types";

const mockApiFetch = vi.mocked(apiFetch);

const WORKSPACE_ID = "550e8400-e29b-41d4-a716-446655440001";
const ACCOUNT_ID = "550e8400-e29b-41d4-a716-446655440002";
const FRONT_ID = "550e8400-e29b-41d4-a716-446655440003";
const ROUND_ID = "550e8400-e29b-41d4-a716-446655440010";
const ITEM_ID = "550e8400-e29b-41d4-a716-446655440020";

function view(): RoundDetailView {
  return {
    workspaceId: WORKSPACE_ID,
    accountId: ACCOUNT_ID,
    brandName: "Café Aurora",
    workspaceName: "Agência Sul",
    round: {
      id: ROUND_ID,
      frontId: FRONT_ID,
      batchId: "batch-1",
      weekKey: "2026-W46",
      sequence: 2,
      status: "closed",
      closedAt: "2026-11-18T12:00:00.000Z",
      decision: null,
      createdAt: "2026-11-16T10:00:00.000Z",
    },
    front: {
      id: FRONT_ID,
      key: "social_instagram",
      status: "calibrating",
      calibrationSequence: 2,
      roundsUsed: 2,
      releasedAt: null,
      calibrationStartedAt: "2026-11-01T10:00:00.000Z",
    },
    batch: null,
    items: [],
    summary: {
      outcome: "passed",
      requiredDecisions: 2,
      decisions: 2,
      failures: 0,
      consecutivePasses: 2,
      roundsCompleted: 2,
      items: [
        {
          itemId: ITEM_ID,
          attemptScore: 14,
          minDimension: 3,
          criticalFailure: false,
          withdrawn: false,
          clientVerdict: "approved",
          clientCategory: "fact",
          effectiveCategory: "taste",
        },
      ],
      loosenings: [],
      closedBy: "staff-quality-1",
    },
  };
}

function renderDetail() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RoundDetail roundId={ROUND_ID} workspaceId={WORKSPACE_ID} accountId={ACCOUNT_ID} />
    </QueryClientProvider>,
  );
}

describe("RoundDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs time for the round's front through record_quality_effort", async () => {
    mockApiFetch.mockImplementation(async (url, init) => {
      if (String(url) === "/api/equipe/staff/commands" && init?.method === "POST") {
        return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
      }
      return { ok: true, status: 200, json: async () => view() } as Response;
    });

    renderDetail();

    await waitFor(() => {
      expect(screen.getByText("equipe.quality.effortTitle")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText("equipe.quality.effortMinutes"), {
      target: { value: "60" },
    });
    fireEvent.change(screen.getByLabelText("equipe.quality.effortNote"), {
      target: { value: "conferência final" },
    });
    fireEvent.click(screen.getByRole("button", { name: "equipe.quality.effortSubmit" }));

    await waitFor(() => {
      expect(screen.getByText("equipe.quality.effortDone")).toBeInTheDocument();
    });
    const commandCall = mockApiFetch.mock.calls.find(
      ([url]) => String(url) === "/api/equipe/staff/commands",
    );
    expect(JSON.parse(String(commandCall![1]?.body))).toEqual({
      type: "record_quality_effort",
      payload: {
        frontId: FRONT_ID,
        roundId: ROUND_ID,
        minutes: 60,
        note: "conferência final",
      },
      role: "quality",
      workspaceId: WORKSPACE_ID,
      accountId: ACCOUNT_ID,
    });
  });

  it("reads the close summary in words, without raw JSON or uuids", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => view(),
    } as Response);

    renderDetail();

    await waitFor(() => {
      expect(screen.getByText("equipe.round.summaryTitle")).toBeInTheDocument();
    });
    expect(screen.getByText(/equipe\.labels\.roundOutcome\.passed/)).toBeInTheDocument();
    expect(screen.getByText(/equipe\.round\.summaryDecisions/)).toBeInTheDocument();
    expect(screen.getByText(/equipe\.labels\.clientVerdict\.approved/)).toBeInTheDocument();
    expect(screen.getByText(/equipe\.labels\.classification\.fact/)).toBeInTheDocument();
    expect(screen.getByText(/equipe\.labels\.classification\.taste/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(ITEM_ID);
    expect(document.body.textContent).not.toContain("attemptScore");
  });
});
