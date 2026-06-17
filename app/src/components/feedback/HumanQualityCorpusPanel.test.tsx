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

const CAMPAIGN_ID_2 = "550e8400-e29b-41d4-a716-446655440011";

const queueProgress = {
  workspaceId: WORKSPACE_ID,
  totalPending: 3,
  totalEvaluated: 12,
  byCohort: {
    baseline: { pending: 2, evaluated: 8 },
    post_learning: { pending: 1, evaluated: 4 },
  },
  byGenerationMode: {
    art_variation: { pending: 2, evaluated: 10 },
    restyling: { pending: 1, evaluated: 2 },
  },
  byFormat: {
    "1:1": { pending: 3, evaluated: 12 },
  },
  byCampaign: {
    [CAMPAIGN_ID]: { pending: 2, evaluated: 5 },
    [CAMPAIGN_ID_2]: { pending: 1, evaluated: 7 },
  },
  latestSelectedAt: "2026-06-17T10:00:00.000Z",
  latestEvaluatedAt: "2026-06-17T11:00:00.000Z",
};

const secondPendingItem = {
  ...pendingItem,
  id: "550e8400-e29b-41d4-a716-446655440099",
  derivationId: "550e8400-e29b-41d4-a716-446655440098",
  generationMode: "restyling",
};

function queueJson(items: typeof pendingItem[], progress = queueProgress) {
  return { items, progress };
}

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
    if (
      url.includes("score-calibration") ||
      url.includes("learning-impact") ||
      url.includes("quality-improvement")
    ) {
      return { ok: false, status: 403 } as Response;
    }
    if (url.includes("human-quality-corpus") && !init?.method) {
      return {
        ok: true,
        status: 200,
        json: async () => queueJson([pendingItem]),
      } as Response;
    }
    return { ok: false, status: 500 } as Response;
  });
}

const impactReport = {
  schemaVersion: 1,
  learningImpactVersion: "1.0.0",
  capturedAt: "2026-06-17T12:00:00.000Z",
  status: "ok" as const,
  evaluatedItemCount: 6,
  insufficientReasons: [] as string[],
  truncated: false,
  totalRowCount: 1,
  learningImpactMetrics: {
    learnedCount: 3,
    nonLearnedCount: 3,
    unlabeledCount: 0,
    slices: [
      {
        sliceKey: "550e8400-e29b-41d4-a716-446655440010|art_variation|1:1",
        learned: {
          count: 3,
          meanVisualScore: 82,
          rejectIntentRate: 0,
          regenerateIntentRate: 0.33,
          factualPassRate: 1,
        },
        nonLearned: {
          count: 3,
          meanVisualScore: 68,
          rejectIntentRate: 0.33,
          regenerateIntentRate: 0,
          factualPassRate: 0.67,
        },
        visualScoreDelta: 14,
        comparability: "ok" as const,
      },
    ],
    globalVisualScoreDelta: 14,
  },
  intentMetrics: {
    learned: { rejectRate: 0, regenerateRate: 0.33 },
    nonLearned: { rejectRate: 0.33, regenerateRate: 0 },
  },
  visualMovementMetrics: {
    learnedMeanVisualScore: 82,
    nonLearnedMeanVisualScore: 68,
    deltaLearnedMinusNonLearned: 14,
  },
  factualMetrics: {
    learnedFactualPassRate: 1,
    nonLearnedFactualPassRate: 0.67,
  },
  rows: [
    {
      corpusItemId: ITEM_ID,
      learningApplied: true,
      visualScore: 85,
      factualPass: true,
      intent: "approve",
      generationMode: "art_variation",
      format: "1:1",
    },
  ],
};

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
    expect(await screen.findByLabelText("Queue progress")).toBeInTheDocument();
    expect(screen.getByText("3 pending · 12 evaluated")).toBeInTheDocument();
    expect(screen.getByText(/Reviewing 1 of 1 loaded pending/)).toBeInTheDocument();
    expect(screen.getByText("Current item")).toBeInTheDocument();
    expect(screen.getByText(/art_variation · 1:1 · baseline · v1/)).toBeInTheDocument();
    expect(screen.getByText("72")).toBeInTheDocument();
    expect(screen.getByText("improvable")).toBeInTheDocument();
    expect(screen.getByText("By cohort")).toBeInTheDocument();
    expect(screen.getByText("By campaign")).toBeInTheDocument();
    expect(screen.getByText("By mode")).toBeInTheDocument();
    expect(screen.getByText(CAMPAIGN_ID)).toBeInTheDocument();
    expect(screen.getByText("post_learning")).toBeInTheDocument();
    expect(screen.getByLabelText("Visual score (0–100)")).toBeInTheDocument();
    expect(screen.getByLabelText("Factual pass")).toBeInTheDocument();
    expect(screen.getByLabelText("Reviewer intent")).toBeInTheDocument();
    expect(screen.getByLabelText("Primary visible failure reason")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit & next" })).toBeDisabled();
  });

  it("submits structured evaluation and advances queue", async () => {
    let queueCall = 0;
    mockApiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("score-calibration") || url.includes("learning-impact")) {
        return { ok: false, status: 403 } as Response;
      }
      if (url.includes("human-quality-corpus") && !init?.method) {
        queueCall += 1;
        return {
          ok: true,
          status: 200,
          json: async () =>
            queueJson(
              queueCall === 1 ? [pendingItem, secondPendingItem] : [secondPendingItem],
              { ...queueProgress, totalPending: queueCall === 1 ? 2 : 1 }
            ),
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
    expect(screen.getByRole("button", { name: "Submit & next" })).toBeDisabled();

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

    expect(screen.getByRole("button", { name: "Submit & next" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Submit & next" }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        `/api/feedback/human-quality-corpus/${ITEM_ID}/evaluation`,
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"visualScore":68'),
        })
      );
    });

    expect(await screen.findByText(/restyling · 1:1 · baseline · v1/)).toBeInTheDocument();
    expect(screen.getByLabelText("Visual score (0–100)")).toHaveValue(null);
  });

  it("requests queue progress with includeProgress=true", async () => {
    mockQueueOnly();

    renderPanel();
    fireEvent.change(screen.getByLabelText("Workspace ID"), {
      target: { value: WORKSPACE_ID },
    });

    await screen.findByText("Queue progress");

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringMatching(/includeProgress=true/)
    );
  });

  it("does not post preview or artifact fields in evaluation payload", async () => {
    mockApiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("score-calibration") || url.includes("learning-impact")) {
        return { ok: false, status: 403 } as Response;
      }
      if (url.includes("human-quality-corpus") && !init?.method) {
        return {
          ok: true,
          status: 200,
          json: async () => queueJson([pendingItem]),
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

    await screen.findByLabelText("Visual score (0–100)");
    fireEvent.change(screen.getByLabelText("Visual score (0–100)"), {
      target: { value: "70" },
    });
    fireEvent.change(screen.getByLabelText("Factual pass"), {
      target: { value: "true" },
    });
    fireEvent.change(screen.getByLabelText("Reviewer intent"), {
      target: { value: "approve" },
    });
    fireEvent.change(screen.getByLabelText("Primary visible failure reason"), {
      target: { value: "other" },
    });
    fireEvent.change(screen.getByLabelText("Other reason"), {
      target: { value: "Minor spacing issue" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Submit & next" }));

    await waitFor(() => {
      const postCall = mockApiFetch.mock.calls.find(
        ([callUrl, callInit]) =>
          typeof callUrl === "string" &&
          callUrl.includes("/evaluation") &&
          callInit?.method === "POST"
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse(String(postCall?.[1]?.body));
      expect(body).toEqual({
        workspaceId: WORKSPACE_ID,
        visualScore: 70,
        factualPass: true,
        intent: "approve",
        primaryFailureReason: "other",
        otherReasonText: "Minor spacing issue",
        notes: null,
      });
      for (const forbidden of [
        "previewImageUrl",
        "signedUrl",
        "outputKey",
        "prompt",
        "model",
        "modelResponse",
        "imageBytes",
      ]) {
        expect(body).not.toHaveProperty(forbidden);
      }
    });
  });

  it("shows operational empty state with progress when queue is clear", async () => {
    mockApiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (
        url.includes("score-calibration") ||
        url.includes("learning-impact") ||
        url.includes("quality-improvement")
      ) {
        return { ok: false, status: 403 } as Response;
      }
      if (url.includes("human-quality-corpus") && !init?.method) {
        return {
          ok: true,
          status: 200,
          json: async () =>
            queueJson([], { ...queueProgress, totalPending: 0, byCohort: {}, byGenerationMode: {}, byFormat: {}, byCampaign: {} }),
        } as Response;
      }
      return { ok: false, status: 500 } as Response;
    });

    renderPanel();
    fireEvent.change(screen.getByLabelText("Workspace ID"), {
      target: { value: WORKSPACE_ID },
    });

    expect(await screen.findByText(/Queue is clear/)).toBeInTheDocument();
    expect(screen.getByText("0 pending · 12 evaluated")).toBeInTheDocument();
    expect(screen.getByText(/Reviewing 0 of 0 loaded pending/)).toBeInTheDocument();
  });

  it("shows queue forbidden message without hiding entire panel when other tabs are allowed", async () => {
    mockApiFetch.mockImplementation(async (url: string) => {
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
      if (url.includes("human-quality-corpus")) {
        return { ok: false, status: 403 } as Response;
      }
      return { ok: false, status: 403 } as Response;
    });

    renderPanel();
    fireEvent.change(screen.getByLabelText("Workspace ID"), {
      target: { value: WORKSPACE_ID },
    });

    expect(
      await screen.findByText(/Corpus evaluation queue is restricted to platform owners/)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Calibration" }));
    expect(await screen.findByText("Calibration report")).toBeInTheDocument();
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
      if (url.includes("learning-impact")) {
        return { ok: false, status: 403 } as Response;
      }
      if (url.includes("human-quality-corpus") && !init?.method) {
        return {
          ok: true,
          status: 200,
          json: async () => queueJson([pendingItem]),
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
      if (url.includes("learning-impact")) {
        return { ok: false, status: 403 } as Response;
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

describe("HumanQualityCorpusPanel impact tab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows separated intent, visual, and factual metric sections", async () => {
    mockApiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("learning-impact")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ report: impactReport }),
        } as Response;
      }
      if (url.includes("score-calibration")) {
        return { ok: false, status: 403 } as Response;
      }
      if (url.includes("human-quality-corpus") && !init?.method) {
        return {
          ok: true,
          status: 200,
          json: async () => queueJson([pendingItem]),
        } as Response;
      }
      return { ok: false, status: 500 } as Response;
    });

    renderPanel();
    fireEvent.change(screen.getByLabelText("Workspace ID"), {
      target: { value: WORKSPACE_ID },
    });

    await screen.findByText("Human quality corpus");
    fireEvent.click(screen.getByRole("button", { name: "Impact" }));

    expect(await screen.findByText("Learning impact report")).toBeInTheDocument();
    expect(screen.getByText("Intent metrics (per arm)")).toBeInTheDocument();
    expect(screen.getByText("Visual movement metrics")).toBeInTheDocument();
    expect(screen.getByText("Factual metrics (per arm)")).toBeInTheDocument();
    expect(screen.getAllByText("+14.00").length).toBeGreaterThan(0);
    expect(screen.getByText("Learned arm")).toBeInTheDocument();
    expect(screen.getByText("Non-learned arm")).toBeInTheDocument();
    expect(screen.getByText("learned")).toBeInTheDocument();
    expect(screen.getAllByText("33%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("67%").length).toBeGreaterThan(0);
  });

  it("shows honest insufficient_sample messaging without positive delta headline", async () => {
    mockApiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("learning-impact")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            report: {
              ...impactReport,
              status: "insufficient_sample",
              evaluatedItemCount: 2,
              insufficientReasons: ["global_below_minimum"],
              learningImpactMetrics: {
                ...impactReport.learningImpactMetrics,
                globalVisualScoreDelta: null,
                slices: [],
              },
              visualMovementMetrics: {
                ...impactReport.visualMovementMetrics,
                deltaLearnedMinusNonLearned: null,
              },
              rows: [],
            },
          }),
        } as Response;
      }
      if (url.includes("score-calibration")) {
        return { ok: false, status: 403 } as Response;
      }
      if (url.includes("human-quality-corpus") && !init?.method) {
        return { ok: false, status: 403 } as Response;
      }
      return { ok: false, status: 500 } as Response;
    });

    renderPanel();
    fireEvent.change(screen.getByLabelText("Workspace ID"), {
      target: { value: WORKSPACE_ID },
    });

    await screen.findByText("Human quality corpus");
    fireEvent.click(screen.getByRole("button", { name: "Impact" }));

    expect(
      await screen.findByText(/insufficient to claim learning impact improvement/)
    ).toBeInTheDocument();
    expect(screen.getByText("insufficient_sample")).toBeInTheDocument();
    expect(screen.getByText("global_below_minimum")).toBeInTheDocument();
    expect(screen.queryByText("Global visual delta (comparable slices):")).not.toBeInTheDocument();
  });
});

const qualityReport = {
  schemaVersion: 1,
  rubricCalibrationVersion: "1.1.0",
  capturedAt: "2026-06-17T12:00:00.000Z",
  status: "ok" as const,
  targetedFailureReasons: [
    "visual_overload",
    "weak_hierarchy",
    "generic_template_feel",
    "illegible_cta",
    "unfocused_composition",
  ],
  visualMetrics: {
    failureFrequencyBefore: {
      visual_overload: { count: 3, rate: 0.2 },
      weak_hierarchy: { count: 3, rate: 0.2 },
      generic_template_feel: { count: 3, rate: 0.2 },
      illegible_cta: { count: 3, rate: 0.2 },
      unfocused_composition: { count: 3, rate: 0.2 },
    },
    failureFrequencyAfter: {
      visual_overload: { count: 2, rate: 0.13 },
      weak_hierarchy: { count: 3, rate: 0.2 },
      generic_template_feel: { count: 3, rate: 0.2 },
      illegible_cta: { count: 3, rate: 0.2 },
      unfocused_composition: { count: 3, rate: 0.2 },
    },
    deltaRateByReason: {
      visual_overload: -0.07,
      weak_hierarchy: 0,
      generic_template_feel: 0,
      illegible_cta: 0,
      unfocused_composition: 0,
    },
  },
  factualMetrics: {
    factualPassRateBefore: 0.93,
    factualPassRateAfter: 0.95,
  },
  fixtureMetrics: {
    targetedArchetypePassRateBefore: 1,
    targetedArchetypePassRateAfter: 1,
  },
  acceptedAdjustments: [
    {
      adjustmentId: "634f9104-0000-4000-8000-000000000001",
      targetModule: "score_ceiling",
      targetKey: "visual_overload",
    },
  ],
};

describe("HumanQualityCorpusPanel quality tab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows failure frequency table and separated factual metrics", async () => {
    mockApiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("quality-improvement")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ report: qualityReport }),
        } as Response;
      }
      if (url.includes("score-calibration") || url.includes("learning-impact")) {
        return { ok: false, status: 403 } as Response;
      }
      if (url.includes("human-quality-corpus") && !init?.method) {
        return {
          ok: true,
          status: 200,
          json: async () => queueJson([pendingItem]),
        } as Response;
      }
      return { ok: false, status: 500 } as Response;
    });

    renderPanel();
    fireEvent.change(screen.getByLabelText("Workspace ID"), {
      target: { value: WORKSPACE_ID },
    });

    await screen.findByText("Human quality corpus");
    fireEvent.click(screen.getByRole("button", { name: "Quality" }));

    expect(await screen.findByText("Quality improvement report")).toBeInTheDocument();
    expect(screen.getByText("Visual failure frequency (targeted reasons)")).toBeInTheDocument();
    expect(screen.getByText("Factual pass rates (separate from visual)")).toBeInTheDocument();
    expect(screen.getByText("Fixture gate detection")).toBeInTheDocument();
    expect(screen.getByText(/score_ceiling\/visual_overload/)).toBeInTheDocument();
    expect(screen.getAllByText("93%").length).toBeGreaterThan(0);
    expect(screen.getByText("95%")).toBeInTheDocument();
  });

  it("shows honest insufficient_sample messaging without positive delta headline", async () => {
    mockApiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("quality-improvement")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            report: {
              ...qualityReport,
              status: "insufficient_sample",
              visualMetrics: {
                ...qualityReport.visualMetrics,
                failureFrequencyAfter: {
                  visual_overload: { count: 0, rate: null },
                  weak_hierarchy: { count: 0, rate: null },
                  generic_template_feel: { count: 0, rate: null },
                  illegible_cta: { count: 0, rate: null },
                  unfocused_composition: { count: 0, rate: null },
                },
                deltaRateByReason: {
                  visual_overload: null,
                  weak_hierarchy: null,
                  generic_template_feel: null,
                  illegible_cta: null,
                  unfocused_composition: null,
                },
              },
              factualMetrics: {
                factualPassRateBefore: 0.93,
                factualPassRateAfter: null,
              },
            },
          }),
        } as Response;
      }
      if (url.includes("score-calibration") || url.includes("learning-impact")) {
        return { ok: false, status: 403 } as Response;
      }
      if (url.includes("human-quality-corpus") && !init?.method) {
        return { ok: false, status: 403 } as Response;
      }
      return { ok: false, status: 500 } as Response;
    });

    renderPanel();
    fireEvent.change(screen.getByLabelText("Workspace ID"), {
      target: { value: WORKSPACE_ID },
    });

    await screen.findByText("Human quality corpus");
    fireEvent.click(screen.getByRole("button", { name: "Quality" }));

    expect(
      await screen.findByText(/insufficient to claim targeted failure-frequency improvement/)
    ).toBeInTheDocument();
    expect(screen.getByText("insufficient_sample")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
