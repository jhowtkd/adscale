import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HumanQualityCorpusPanel } from "./HumanQualityCorpusPanel";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("next/image", () => ({
  default: (props: { alt: string }) => <img alt={props.alt} />,
}));

import { apiFetch } from "@/lib/api-client";

const mockApiFetch = vi.mocked(apiFetch);

const WORKSPACE_ID = "550e8400-e29b-41d4-a716-446655440002";
const ITEM_ID = "550e8400-e29b-41d4-a716-446655440001";
const CAMPAIGN_ID = "550e8400-e29b-41d4-a716-446655440003";
const DERIVATION_ID = "550e8400-e29b-41d4-a716-446655440004";

const pendingItem = {
  id: ITEM_ID,
  workspaceId: WORKSPACE_ID,
  clientProfileId: "550e8400-e29b-41d4-a716-446655440010",
  campaignId: CAMPAIGN_ID,
  derivationId: DERIVATION_ID,
  generationMode: "art_variation",
  format: "1:1",
  cohort: "baseline",
  corpusVersion: 1,
  artifactRef: { derivationId: DERIVATION_ID },
  qualitySnapshot: {
    qualityScore: 72,
    qualityVerdict: "improvable",
    generationMode: "art_variation",
    format: "1:1",
    hardFailures: [{ code: "cta_drift", message: "CTA drift" }],
  },
  selectedByUserId: "owner-1",
  selectedAt: new Date().toISOString(),
  status: "pending",
  previewImageUrl: "https://cdn.example.com/preview.png",
};

const calibrationReport = {
  schemaVersion: 1,
  rubricCalibrationVersion: "1.0.0",
  capturedAt: "2026-06-17T12:00:00.000Z",
  snapshotCapturedAtNote: "Automatic scores use qualitySnapshot frozen at corpus selection time; not live re-scored.",
  status: "ok" as const,
  evaluatedItemCount: 5,
  truncated: false,
  totalComparisonCount: 5,
  visualMetrics: {
    meanAbsError: 12.4,
    meanSignedDelta: 8.2,
    overScoreCount: 2,
    underScoreCount: 1,
    divergenceByFailureReason: {
      weak_hierarchy: {
        count: 2,
        meanSignedDelta: 10,
        meanAbsError: 10,
        overScoreCount: 1,
        underScoreCount: 0,
      },
    },
    divergenceByMode: {
      art_variation: {
        count: 5,
        meanSignedDelta: 8.2,
        meanAbsError: 12.4,
        overScoreCount: 2,
        underScoreCount: 1,
      },
    },
    divergenceByFormat: {
      "1:1": {
        count: 5,
        meanSignedDelta: 8.2,
        meanAbsError: 12.4,
        overScoreCount: 2,
        underScoreCount: 1,
      },
    },
    comparisons: [
      {
        corpusItemId: ITEM_ID,
        derivationId: DERIVATION_ID,
        generationMode: "art_variation",
        format: "1:1",
        cohort: "baseline",
        automaticQualityScore: 80,
        humanVisualScore: 65,
        scoreDelta: 15,
        absError: 15,
        primaryFailureReason: "weak_hierarchy",
        factualPass: true,
        qualityVerdict: "improvable",
        hardFailureCodes: [],
      },
    ],
  },
  factualMetrics: {
    factualPassRate: 0.8,
    factualFailCount: 1,
    highVisualButFactualFail: [],
  },
  adjustments: [
    {
      adjustmentVersion: "1.0.0",
      targetModule: "score_ceiling",
      targetKey: "weak_hierarchy",
      status: "proposed" as const,
      evidenceCount: 3,
    },
  ],
};

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <HumanQualityCorpusPanel />
    </QueryClientProvider>
  );
}

function mockQueueOnly() {
  mockApiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.includes("score-calibration")) {
      return { ok: false, status: 403 } as Response;
    }
    if (url.includes("human-quality-corpus") && !init?.method) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ items: [pendingItem] }),
      } as Response;
    }
    return { ok: false, status: 500 } as Response;
  });
}

describe("HumanQualityCorpusPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when owner is forbidden", async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 403 } as Response);

    const { container } = renderPanel();
    fireEvent.change(screen.getByLabelText("Workspace ID"), {
      target: { value: WORKSPACE_ID },
    });

    await waitFor(() => {
      expect(container.querySelector("section")).toBeNull();
    });
  });

  it("renders one pending item with evaluation form and queue metadata", async () => {
    mockQueueOnly();

    renderPanel();
    fireEvent.change(screen.getByLabelText("Workspace ID"), {
      target: { value: WORKSPACE_ID },
    });

    expect(await screen.findByText("Human quality corpus")).toBeInTheDocument();
    expect(await screen.findByText("1 pending")).toBeInTheDocument();
    expect(screen.getByText(/baseline/)).toBeInTheDocument();
    expect(screen.getByText(/v1/)).toBeInTheDocument();
    expect(screen.getByText("72")).toBeInTheDocument();
    expect(screen.getByText("improvable")).toBeInTheDocument();
    expect(screen.getByLabelText("Visual score (0–100)")).toBeInTheDocument();
    expect(screen.getByLabelText("Factual pass")).toBeInTheDocument();
    expect(screen.getByLabelText("Reviewer intent")).toBeInTheDocument();
    expect(screen.getByLabelText("Primary visible failure reason")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit evaluation" })).toBeDisabled();
  });

  it("submits structured evaluation and advances queue", async () => {
    mockApiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("score-calibration")) {
        return { ok: false, status: 403 } as Response;
      }
      if (url.includes("human-quality-corpus") && !init?.method) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ items: [pendingItem] }),
        } as Response;
      }
      if (url.includes("/evaluation") && init?.method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({ item: { ...pendingItem, status: "evaluated" }, evaluation: {} }),
        } as Response;
      }
      return { ok: false, status: 500 } as Response;
    });

    renderPanel();
    fireEvent.change(screen.getByLabelText("Workspace ID"), {
      target: { value: WORKSPACE_ID },
    });

    await screen.findByText("Human quality corpus");
    await screen.findByLabelText("Visual score (0–100)");

    fireEvent.change(screen.getByLabelText("Visual score (0–100)"), {
      target: { value: "68" },
    });
    fireEvent.change(screen.getByLabelText("Factual pass"), {
      target: { value: "true" },
    });
    fireEvent.change(screen.getByLabelText("Reviewer intent"), {
      target: { value: "reject" },
    });
    fireEvent.change(screen.getByLabelText("Primary visible failure reason"), {
      target: { value: "weak_hierarchy" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Submit evaluation" }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        `/api/feedback/human-quality-corpus/${ITEM_ID}/evaluation`,
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"visualScore":68'),
        })
      );
    });
  });
});

describe("HumanQualityCorpusPanel calibration tab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows calibration aggregates and per-item drill-down", async () => {
    mockApiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("score-calibration")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            report: calibrationReport,
            persistedAdjustmentCount: 0,
          }),
        } as Response;
      }
      if (url.includes("human-quality-corpus") && !init?.method) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ items: [pendingItem] }),
        } as Response;
      }
      return { ok: false, status: 500 } as Response;
    });

    renderPanel();
    fireEvent.change(screen.getByLabelText("Workspace ID"), {
      target: { value: WORKSPACE_ID },
    });

    await screen.findByText("Human quality corpus");
    fireEvent.click(screen.getByRole("button", { name: "Calibration" }));

    expect(await screen.findByText("Calibration report")).toBeInTheDocument();
    expect(screen.getByText("ok")).toBeInTheDocument();
    expect(screen.getAllByText("12.40").length).toBeGreaterThan(0);
    expect(screen.getAllByText("+8.20").length).toBeGreaterThan(0);
    expect(screen.getAllByText("weak_hierarchy").length).toBeGreaterThan(0);
    expect(screen.getByText("80")).toBeInTheDocument();
    expect(screen.getByText("65")).toBeInTheDocument();
    expect(screen.getByText("+15.00")).toBeInTheDocument();
    expect(screen.getByText(/score_ceiling/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Visual score (0–100)")).not.toBeInTheDocument();
  });

  it("shows honest insufficient_corpus messaging", async () => {
    mockApiFetch.mockImplementation(async (url: string) => {
      if (url.includes("score-calibration")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            report: {
              ...calibrationReport,
              status: "insufficient_corpus",
              evaluatedItemCount: 2,
              visualMetrics: {
                ...calibrationReport.visualMetrics,
                meanAbsError: null,
                meanSignedDelta: null,
                comparisons: [],
              },
            },
            persistedAdjustmentCount: 0,
          }),
        } as Response;
      }
      if (url.includes("human-quality-corpus")) {
        return { ok: false, status: 403 } as Response;
      }
      return { ok: false, status: 500 } as Response;
    });

    renderPanel();
    fireEvent.change(screen.getByLabelText("Workspace ID"), {
      target: { value: WORKSPACE_ID },
    });

    await screen.findByText("Human quality corpus");
    fireEvent.click(screen.getByRole("button", { name: "Calibration" }));

    expect(
      await screen.findByText(/At least 5 evaluated corpus items are required/)
    ).toBeInTheDocument();
    expect(screen.getByText("insufficient_corpus")).toBeInTheDocument();
  });
});
