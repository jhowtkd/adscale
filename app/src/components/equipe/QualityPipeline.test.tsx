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
import QualityPipeline from "./QualityPipeline";
import type { QualityPipelineView } from "./types";

const mockApiFetch = vi.mocked(apiFetch);

const WORKSPACE_ID = "550e8400-e29b-41d4-a716-446655440001";
const ACCOUNT_ID = "550e8400-e29b-41d4-a716-446655440002";
const FRONT_ID = "550e8400-e29b-41d4-a716-446655440003";
const ROUND_ID = "550e8400-e29b-41d4-a716-446655440010";

function view(): QualityPipelineView {
  return {
    staffId: "staff-1",
    open: [
      {
        workspaceId: WORKSPACE_ID,
        accountId: ACCOUNT_ID,
        brandName: "Café Aurora",
        workspaceName: "Agência Sul",
        frontId: FRONT_ID,
        frontKey: "social_instagram",
        roundId: ROUND_ID,
        sequence: 2,
        weekKey: "2026-W46",
        status: "open",
        openedAt: "2026-11-16T10:00:00.000Z",
        closedAt: null,
        outcome: null,
      },
    ],
    recentlyClosed: [],
  };
}

function renderPipeline() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <QualityPipeline />
    </QueryClientProvider>,
  );
}

describe("QualityPipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs time from a queue row through record_quality_effort", async () => {
    mockApiFetch.mockImplementation(async (url, init) => {
      if (String(url) === "/api/equipe/staff/commands" && init?.method === "POST") {
        return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
      }
      return { ok: true, status: 200, json: async () => view() } as Response;
    });

    renderPipeline();

    await waitFor(() => {
      expect(screen.getByText(/equipe\.quality\.openTitle/)).toBeInTheDocument();
    });
    expect(screen.getByText("equipe.labels.frontKey.social_instagram")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "equipe.quality.effortToggle" }));
    fireEvent.change(screen.getByLabelText("equipe.quality.effortMinutes"), {
      target: { value: "45" },
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
      payload: { frontId: FRONT_ID, roundId: ROUND_ID, minutes: 45 },
      role: "quality",
      workspaceId: WORKSPACE_ID,
      accountId: ACCOUNT_ID,
    });
  });
});
