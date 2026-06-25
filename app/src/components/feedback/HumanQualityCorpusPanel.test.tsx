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

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="trend-chart">{children}</div>
  ),
  LineChart: ({
    children,
    data,
    onClick,
  }: {
    children: React.ReactNode;
    data?: Array<{ bucketKey: string }>;
    onClick?: (state: { activeLabel?: string }) => void;
  }) => (
    <div
      data-testid="line-chart"
      onClick={() =>
        onClick?.({
          activeLabel: data?.[0]?.bucketKey,
        })
      }
    >
      {children}
    </div>
  ),
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  CartesianGrid: () => null,
}));

import { apiFetch } from "@/lib/api-client";

const mockApiFetch = vi.mocked(apiFetch);

const WORKSPACE_ID = "550e8400-e29b-41d4-a716-446655440002";
const ITEM_ID = "550e8400-e29b-41d4-a716-446655440001";
const CAMPAIGN_ID = "550e8400-e29b-41d4-a716-446655440003";
const DERIVATION_ID = "550e8400-e29b-41d4-a716-446655440004";

const CLIENT_PROFILE_ID = "550e8400-e29b-41d4-a716-446655440010";

const pendingItem = {
  id: ITEM_ID,
  workspaceId: WORKSPACE_ID,
  clientProfileId: CLIENT_PROFILE_ID,
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
  sourceLabel: "operator_imported" as const,
};

const fixturePendingItem = {
  ...pendingItem,
  sourceLabel: "synthetic_fixture" as const,
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

function switchToWorkspaceScope() {
  fireEvent.click(screen.getByRole("button", { name: "workspace" }));
}

function enterWorkspaceId(id: string) {
  fireEvent.change(screen.getByLabelText("Workspace ID"), {
    target: { value: id },
  });
}

function useWorkspaceScope(id = WORKSPACE_ID) {
  switchToWorkspaceScope();
  enterWorkspaceId(id);
}

function mockQueueOnly() {
  mockApiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.includes("ingestion/status") || url.includes("learning/proposals")) {
      return { ok: false, status: 403 } as Response;
    }
    if (
      url.includes("score-calibration") ||
      url.includes("learning-impact") ||
      url.includes("quality-improvement") ||
      url.includes("sample-coverage") ||
      url.includes("quality-trend")
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

    await waitFor(() => {
      expect(container.querySelector("section")).toBeNull();
    });
  });

  it("loads global queue by default without workspace ID", async () => {
    mockQueueOnly();

    renderPanel();

    expect(await screen.findByText("Human quality corpus")).toBeInTheDocument();
    expect(await screen.findByLabelText("Queue progress")).toBeInTheDocument();
    expect(screen.queryByLabelText("Workspace ID")).not.toBeInTheDocument();
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/feedback\/human-quality-corpus\?.*limit=50/)
    );
    expect(mockApiFetch).toHaveBeenCalledWith(expect.not.stringContaining("workspaceId="));
  });

  it("shows global empty state when queue has no items", async () => {
    mockApiFetch.mockImplementation(async (url: string) => {
      if (url.includes("human-quality-corpus")) {
        return {
          ok: true,
          status: 200,
          json: async () => queueJson([], { ...queueProgress, totalPending: 0 }),
        } as Response;
      }
      return { ok: false, status: 403 } as Response;
    });

    renderPanel();

    expect(
      await screen.findByText(/Open the Candidates tab to promote captured creatives/)
    ).toBeInTheDocument();
  });

  it("renders one pending item with evaluation form and queue metadata", async () => {
    mockQueueOnly();

    renderPanel();
    useWorkspaceScope();

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

    await screen.findByText("Human quality corpus");
    await screen.findByLabelText("Visual score (0–100)");
    expect(screen.getByRole("button", { name: /Submit/ })).toBeDisabled();

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

    expect(screen.getByRole("button", { name: /Submit/ })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /Submit/ }));

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

  it("passes clientProfileId filter to corpus queue API", async () => {
    mockQueueOnly();

    renderPanel();

    const profileFilter = await screen.findByLabelText("Queue client profile ID filter");

    fireEvent.change(profileFilter, {
      target: { value: CLIENT_PROFILE_ID },
    });

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringMatching(
          new RegExp(`clientProfileId=${encodeURIComponent(CLIENT_PROFILE_ID)}`)
        )
      );
    });
  });

  it("shows client profile id in current item metadata", async () => {
    mockQueueOnly();

    renderPanel();
    useWorkspaceScope();

    await screen.findByText("Current item");
    expect(screen.getByText(CLIENT_PROFILE_ID)).toBeInTheDocument();
  });

  it("shows fixture-safe source copy without product-proof wording", async () => {
    mockApiFetch.mockImplementation(async (url: string) => {
      if (url.includes("human-quality-corpus")) {
        return {
          ok: true,
          status: 200,
          json: async () => queueJson([fixturePendingItem]),
        } as Response;
      }
      return { ok: false, status: 403 } as Response;
    });

    renderPanel();
    useWorkspaceScope();

    await screen.findByText("Current item");
    expect(screen.getByText("Fixture/seed evidence")).toBeInTheDocument();
    expect(
      screen.getByText(/Validates workflow only — not customer-real proof/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/product proof|customer-validated/i)).not.toBeInTheDocument();
  });

  async function submitMinimalEvaluation(
    evaluationResponse: Record<string, unknown>
  ) {
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
          json: async () => evaluationResponse,
        } as Response;
      }
      return { ok: false, status: 500 } as Response;
    });

    renderPanel();

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
      target: { value: "Spacing" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit & next" }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        `/api/feedback/human-quality-corpus/${ITEM_ID}/evaluation`,
        expect.objectContaining({ method: "POST" })
      );
    });
  }

  it("submits evaluation successfully with legacy response shape (no decisionEvidence)", async () => {
    await submitMinimalEvaluation({
      item: { ...pendingItem, status: "evaluated" },
      evaluation: { id: "eval-1" },
    });

    expect(await screen.findByText(/restyling · 1:1 · baseline · v1/)).toBeInTheDocument();
  });

  it("submits evaluation successfully when decisionEvidence is present", async () => {
    await submitMinimalEvaluation({
      item: { ...pendingItem, status: "evaluated" },
      evaluation: { id: "eval-1" },
      decisionEvidence: {
        outputDecisionEventId: "ode-1",
        calibrationSignalStatus: "recorded",
      },
    });

    expect(await screen.findByText(/restyling · 1:1 · baseline · v1/)).toBeInTheDocument();
  });

  it("requests queue progress with includeProgress=true", async () => {
    mockQueueOnly();

    renderPanel();
    useWorkspaceScope();

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
    useWorkspaceScope();

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
    useWorkspaceScope();

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
    useWorkspaceScope();

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
    useWorkspaceScope();

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

  it("shows honest insufficient_corpus messaging from sampleGuidance", async () => {
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
              sampleGuidance: [
                {
                  gate: "calibration_global",
                  currentCount: 2,
                  requiredCount: 5,
                  additionalNeeded: 3,
                  blockedClaim: "calibration visual divergence",
                },
              ],
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
      if (url.includes("learning-impact") || url.includes("sample-coverage")) {
        return { ok: false, status: 403 } as Response;
      }
      if (url.includes("human-quality-corpus")) {
        return { ok: false, status: 403 } as Response;
      }
      return { ok: false, status: 500 } as Response;
    });

    renderPanel();
    useWorkspaceScope();

    await screen.findByText("Human quality corpus");
    fireEvent.click(screen.getByRole("button", { name: "Calibration" }));

    expect(
      await screen.findByText(/Need 3 more for calibration visual divergence/)
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
    useWorkspaceScope();

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

  it("shows honest insufficient_sample messaging from sampleGuidance without positive delta headline", async () => {
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
              sampleGuidance: [
                {
                  gate: "impact_global",
                  currentCount: 2,
                  requiredCount: 5,
                  additionalNeeded: 3,
                  blockedClaim: "learning impact movement delta",
                },
              ],
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
      if (url.includes("score-calibration") || url.includes("sample-coverage")) {
        return { ok: false, status: 403 } as Response;
      }
      if (url.includes("human-quality-corpus") && !init?.method) {
        return { ok: false, status: 403 } as Response;
      }
      return { ok: false, status: 500 } as Response;
    });

    renderPanel();
    useWorkspaceScope();

    await screen.findByText("Human quality corpus");
    fireEvent.click(screen.getByRole("button", { name: "Impact" }));

    expect(
      await screen.findByText(/Need 3 more for learning impact movement delta/)
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
    useWorkspaceScope();

    await screen.findByText("Human quality corpus");
    fireEvent.click(screen.getByRole("button", { name: "Quality" }));

    expect(await screen.findByText("Quality improvement report")).toBeInTheDocument();
    expect(screen.getByText("Visual failure frequency (targeted reasons)")).toBeInTheDocument();
    expect(screen.getByText("Factual pass rates (separate from visual)")).toBeInTheDocument();
    expect(screen.getByText("Fixture gate detection")).toBeInTheDocument();
    expect(screen.getByText("Evidence source")).toBeInTheDocument();
    expect(screen.getByText("fixture")).toBeInTheDocument();
    expect(screen.getByText(/score_ceiling\/visual_overload/)).toBeInTheDocument();
    expect(screen.getAllByText("93%").length).toBeGreaterThan(0);
    expect(screen.getByText("95%")).toBeInTheDocument();
  });

  it("shows honest insufficient_sample messaging from sampleGuidance without positive delta headline", async () => {
    mockApiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("quality-improvement")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            report: {
              ...qualityReport,
              status: "insufficient_sample",
              sampleGuidance: [
                {
                  gate: "quality_improvement_reason",
                  dimension: "visual_overload",
                  arm: "after",
                  currentCount: 0,
                  requiredCount: 3,
                  additionalNeeded: 3,
                  blockedClaim: "targeted failure-frequency improvement",
                },
              ],
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
      if (
        url.includes("score-calibration") ||
        url.includes("learning-impact") ||
        url.includes("sample-coverage")
      ) {
        return { ok: false, status: 403 } as Response;
      }
      if (url.includes("human-quality-corpus") && !init?.method) {
        return { ok: false, status: 403 } as Response;
      }
      return { ok: false, status: 500 } as Response;
    });

    renderPanel();
    useWorkspaceScope();

    await screen.findByText("Human quality corpus");
    fireEvent.click(screen.getByRole("button", { name: "Quality" }));

    expect(
      await screen.findByText(/Need 3 more for targeted failure-frequency improvement/)
    ).toBeInTheDocument();
    expect(screen.getByText("insufficient_sample")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});

const coverageReport = {
  schemaVersion: 1,
  capturedAt: "2026-06-17T12:00:00.000Z",
  evaluatedItemCount: 2,
  gates: [
    { id: "calibration_global", status: "insufficient_sample", blockedClaims: ["calibration visual divergence"] },
    { id: "impact_global", status: "insufficient_sample", blockedClaims: ["learning impact movement delta"] },
    { id: "quality_improvement", status: "insufficient_sample", blockedClaims: ["targeted failure-frequency improvement"] },
    { id: "trend_global", status: "insufficient_sample", blockedClaims: ["quality trend direction (trend charts deferred to Phase 136)"] },
  ],
  sliceGaps: [
    {
      gate: "calibration_global",
      currentCount: 2,
      requiredCount: 5,
      additionalNeeded: 3,
      blockedClaim: "calibration visual divergence",
    },
    {
      gate: "impact_slice_arm",
      sliceKey: "550e8400-e29b-41d4-a716-446655440010|art_variation|1:1",
      arm: "learned",
      currentCount: 1,
      requiredCount: 3,
      additionalNeeded: 2,
      blockedClaim: "learning impact movement delta",
    },
  ],
  nextGate: "calibration",
  nextOperatorAction: "Evaluate corpus items in the human-quality queue.",
};

describe("HumanQualityCorpusPanel coverage tab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders cross-gate slice gaps from coverage API", async () => {
    mockApiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("sample-coverage")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ report: coverageReport }),
        } as Response;
      }
      if (url.includes("score-calibration") || url.includes("learning-impact") || url.includes("quality-improvement")) {
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
    useWorkspaceScope();

    await screen.findByText("Human quality corpus");
    fireEvent.click(screen.getByRole("button", { name: "Coverage" }));

    expect(await screen.findByText("Sample coverage")).toBeInTheDocument();
    expect(screen.getByText(coverageReport.nextOperatorAction)).toBeInTheDocument();
    expect(screen.getAllByText("calibration_global").length).toBeGreaterThan(0);
    expect(screen.getAllByText("learning impact movement delta").length).toBeGreaterThan(0);
    expect(screen.getByText("impact_slice_arm")).toBeInTheDocument();
  });
});

const trendReport = {
  status: "ok" as const,
  evaluatedItemCount: 8,
  populatedBucketCount: 2,
  capturedAt: "2026-06-17T12:00:00.000Z",
  latestEvaluatedAt: "2026-06-17T11:00:00.000Z",
  truncated: false,
  evidenceSource: "live_human" as const,
  sampleGuidance: [] as Array<{
    gate: string;
    currentCount: number;
    requiredCount: number;
    additionalNeeded: number;
    blockedClaim: string;
  }>,
  alertFlags: {
    insufficientCoverage: false,
    staleEvidence: false,
    regressionDetected: false,
  },
  buckets: [
    {
      bucketKey: "2026-W23",
      periodStart: "2026-06-02T00:00:00.000Z",
      periodEnd: "2026-06-08T23:59:59.999Z",
      count: 4,
      meanHumanVisualScore: 72,
      factualPassRate: 0.75,
      learningImpactStatus: "ok" as const,
      evidenceRefs: {
        bucketKey: "2026-W23",
        corpusItemIds: [ITEM_ID],
        itemRefs: [
          {
            corpusItemId: ITEM_ID,
            visualScore: 72,
            factualPass: true,
            evaluatedAt: "2026-06-06T10:00:00.000Z",
          },
        ],
        truncated: false,
        totalCount: 1,
      },
    },
    {
      bucketKey: "2026-W24",
      periodStart: "2026-06-09T00:00:00.000Z",
      periodEnd: "2026-06-15T23:59:59.999Z",
      count: 4,
      meanHumanVisualScore: 68,
      factualPassRate: 0.5,
      learningImpactStatus: "insufficient_sample" as const,
      evidenceRefs: {
        bucketKey: "2026-W24",
        corpusItemIds: ["550e8400-e29b-41d4-a716-446655440099"],
        itemRefs: [
          {
            corpusItemId: "550e8400-e29b-41d4-a716-446655440099",
            visualScore: 68,
            factualPass: false,
            evaluatedAt: "2026-06-14T10:00:00.000Z",
          },
        ],
        truncated: true,
        totalCount: 120,
      },
    },
  ],
};

function mockTrendApis(overrides?: { trend?: typeof trendReport }) {
  mockApiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.includes("ingestion/status") || url.includes("learning/proposals")) {
      return { ok: false, status: 403 } as Response;
    }
    if (url.includes("quality-trend")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ report: overrides?.trend ?? trendReport }),
      } as Response;
    }
    if (
      url.includes("score-calibration") ||
      url.includes("learning-impact") ||
      url.includes("quality-improvement") ||
      url.includes("sample-coverage")
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

describe("HumanQualityCorpusPanel trend tab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows Trend tab in tab list", async () => {
    mockTrendApis();

    renderPanel();
    useWorkspaceScope();

    await screen.findByText("Human quality corpus");
    expect(screen.getByRole("button", { name: "Trend" })).toBeInTheDocument();
  });

  it("returns null when all six APIs return 403", async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 403 } as Response);

    const { container } = renderPanel();
    useWorkspaceScope();

    await waitFor(() => {
      expect(container.querySelector("section")).toBeNull();
    });

    const trendCalls = mockApiFetch.mock.calls.filter(
      ([url]) => typeof url === "string" && url.includes("quality-trend")
    );
    expect(trendCalls.length).toBeGreaterThan(0);
  });

  it("renders separate alert chips when flags are set", async () => {
    mockTrendApis({
      trend: {
        ...trendReport,
        alertFlags: {
          insufficientCoverage: true,
          staleEvidence: true,
          regressionDetected: true,
          reasons: {
            insufficientCoverage: "Global bucket count below minimum",
            staleEvidence: "Evidence captured before latest evaluation",
            regressionDetected: "2026-W23 → 2026-W24 visual drop",
          },
        },
        sampleGuidance: [
          {
            gate: "trend_global",
            currentCount: 2,
            requiredCount: 5,
            additionalNeeded: 3,
            blockedClaim: "quality trend direction",
          },
        ],
      },
    });

    renderPanel();
    useWorkspaceScope();

    await screen.findByText("Human quality corpus");
    fireEvent.click(screen.getByRole("button", { name: "Trend" }));

    expect(await screen.findByTestId("trend-alert-insufficient-coverage")).toBeInTheDocument();
    expect(screen.getByTestId("trend-alert-stale-evidence")).toBeInTheDocument();
    expect(screen.getByTestId("trend-alert-regression")).toBeInTheDocument();
    expect(screen.getByText(/Corpus refreshed — re-run evidence CLI/)).toBeInTheDocument();
    expect(screen.getByText(/2026-W23 → 2026-W24 visual drop/)).toBeInTheDocument();
    expect(screen.getByText(/Need 3 more for quality trend direction/)).toBeInTheDocument();
  });

  it("shows sample guidance without trend direction claim when insufficient_sample", async () => {
    mockTrendApis({
      trend: {
        ...trendReport,
        status: "insufficient_sample",
        sampleGuidance: [
          {
            gate: "trend_time_buckets",
            currentCount: 1,
            requiredCount: 2,
            additionalNeeded: 1,
            blockedClaim: "quality trend direction",
          },
        ],
      },
    });

    renderPanel();
    useWorkspaceScope();

    await screen.findByText("Human quality corpus");
    fireEvent.click(screen.getByRole("button", { name: "Trend" }));

    expect(
      await screen.findByText(/Need 1 more for quality trend direction/)
    ).toBeInTheDocument();
    expect(screen.getByText("insufficient_sample")).toBeInTheDocument();
    expect(screen.queryByText(/improved|declined|↑|↓/i)).not.toBeInTheDocument();
  });

  it("renders bucket evidence rows and truncated message", async () => {
    mockTrendApis();

    renderPanel();
    useWorkspaceScope();

    await screen.findByText("Human quality corpus");
    fireEvent.click(screen.getByRole("button", { name: "Trend" }));

    expect(await screen.findByText("Quality trend")).toBeInTheDocument();
    expect(screen.getByText("live_human")).toBeInTheDocument();
    expect(screen.getByTestId("trend-chart")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Trend evidence bucket"), {
      target: { value: "2026-W24" },
    });

    expect(await screen.findByText(/Showing 1 of 120/)).toBeInTheDocument();
    expect(screen.getByText("68")).toBeInTheDocument();
    expect(screen.getByText("fail")).toBeInTheDocument();
  });

  it("refetches trend when dimension filter changes", async () => {
    mockTrendApis();

    renderPanel();
    useWorkspaceScope();

    await screen.findByText("Human quality corpus");
    fireEvent.click(screen.getByRole("button", { name: "Trend" }));
    await screen.findByText("Quality trend");

    const initialTrendCalls = mockApiFetch.mock.calls.filter(
      ([url]) => typeof url === "string" && url.includes("quality-trend")
    ).length;

    fireEvent.change(screen.getByLabelText("Trend generation mode filter"), {
      target: { value: "art_variation" },
    });

    await waitFor(() => {
      const trendCalls = mockApiFetch.mock.calls.filter(
        ([url]) => typeof url === "string" && url.includes("quality-trend")
      );
      expect(trendCalls.length).toBeGreaterThan(initialTrendCalls);
      expect(String(trendCalls.at(-1)?.[0])).toContain("generationMode=art_variation");
    });
  });

  it("passes client profile filter to quality-trend API", async () => {
    mockTrendApis();

    renderPanel();
    useWorkspaceScope();

    await screen.findByText("Human quality corpus");
    fireEvent.click(screen.getByRole("button", { name: "Trend" }));
    await screen.findByText("Quality trend");

    fireEvent.change(screen.getByLabelText("Trend client profile ID filter"), {
      target: { value: CLIENT_PROFILE_ID },
    });

    await waitFor(() => {
      const trendCall = mockApiFetch.mock.calls.find(
        ([url]) =>
          typeof url === "string" &&
          url.includes("quality-trend") &&
          url.includes(encodeURIComponent(CLIENT_PROFILE_ID))
      );
      expect(trendCall).toBeDefined();
    });
  });
});

const learningProposal = {
  id: "550e8400-e29b-41d4-a716-446655440020",
  sliceKey: `${CLIENT_PROFILE_ID}|art_variation|1:1`,
  primaryFailureReason: "visual_overload",
  rationale: "Cap visual zones at three; one dominant hook",
  evidenceRefs: {
    corpusItemIds: [ITEM_ID],
    stats: { count: 3 },
  },
};

describe("HumanQualityCorpusPanel learning tab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists proposed client learning rules and can generate", async () => {
    mockApiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("ingestion/status")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            eligibleDerivations: 100,
            totalCandidates: 40,
            pendingQueue: 3,
            evaluated: 12,
            blockedMissingClientProfile: 2,
          }),
        } as Response;
      }
      if (url.includes("learning/proposals/generate") && init?.method === "POST") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            generated: 1,
            globalProposals: 2,
            proposals: [learningProposal],
          }),
        } as Response;
      }
      if (url.includes("learning/proposals") && !init?.method) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ proposals: [learningProposal] }),
        } as Response;
      }
      if (
        url.includes("score-calibration") ||
        url.includes("learning-impact") ||
        url.includes("quality-improvement") ||
        url.includes("sample-coverage") ||
        url.includes("quality-trend")
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

    renderPanel();
    useWorkspaceScope();

    await screen.findByText("Human quality corpus");
    expect(await screen.findByText("Eligible:")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Backfill batch" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Learning" }));

    expect(await screen.findByText("Client learning proposals")).toBeInTheDocument();
    expect(screen.getByText(learningProposal.sliceKey)).toBeInTheDocument();
    expect(screen.getByText(learningProposal.primaryFailureReason)).toBeInTheDocument();
    expect(screen.getByText(learningProposal.rationale)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Generate proposals" }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/admin/quality/learning/proposals/generate",
        expect.objectContaining({ method: "POST" })
      );
    });

    expect(
      await screen.findByText(/2 global proposal\(s\) saved to rubric calibration adjustments/)
    ).toBeInTheDocument();
  });
});

const GLOBAL_ADJUSTMENT_ID = "634f9104-0000-4000-8000-000000000002";
const SUPPORTING_RULE_A = "rule-profile-a-corpus-1";
const SUPPORTING_RULE_B = "rule-profile-b-corpus-1";

const crossClientCalibrationReport = {
  ...calibrationReport,
  adjustments: [
    {
      id: GLOBAL_ADJUSTMENT_ID,
      adjustmentVersion: "1.1.0",
      targetModule: "score_ceiling",
      targetKey: "weak_hierarchy",
      status: "proposed" as const,
      evidenceCount: 6,
      evidenceRefs: {
        fixtureOnly: true,
        supportingClientRuleIds: [SUPPORTING_RULE_A, SUPPORTING_RULE_B],
        promotionSource: "cross_client" as const,
        primaryFailureReason: "weak_hierarchy",
        corpusItemIds: ["item-1", "item-2", "item-3", "item-4", "item-5", "item-6"],
        sliceStats: { count: 6, meanSignedDelta: 18, meanAbsError: 18 },
        itemRefs: [],
      },
    },
  ],
};

function mockCalibrationTabApis(
  report: typeof calibrationReport = crossClientCalibrationReport
) {
  mockApiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.includes("score-calibration")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          report,
          persistedAdjustmentCount: report.adjustments.length,
        }),
      } as Response;
    }
    if (url.includes("learning-impact") || url.includes("sample-coverage")) {
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

async function openCalibrationTab() {
  renderPanel();
  useWorkspaceScope();
  await screen.findByText("Human quality corpus");
  fireEvent.click(screen.getByRole("button", { name: "Calibration" }));
  await screen.findByText("Calibration report");
}

describe("HumanQualityCorpusPanel cross-client calibration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows Cross-client badge and supporting rule count for cross_client proposals", async () => {
    mockCalibrationTabApis();

    await openCalibrationTab();

    expect(screen.getByText("Cross-client")).toBeInTheDocument();
    expect(screen.getByText(/2 supporting client rules/)).toBeInTheDocument();
    expect(screen.getByText(SUPPORTING_RULE_A)).toBeInTheDocument();
    expect(screen.getByText(SUPPORTING_RULE_B)).toBeInTheDocument();
  });

  it("shows fixture-only warning and requires acknowledgment before accept", async () => {
    mockCalibrationTabApis();

    await openCalibrationTab();

    expect(
      screen.getByText(/uses only fixture evidence/i)
    ).toBeInTheDocument();

    const acceptButton = screen.getByRole("button", { name: "Accept" });
    expect(acceptButton).toBeDisabled();

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /fixture evidence/i,
      })
    );

    expect(acceptButton).toBeEnabled();
  });

  it("accept calls PATCH calibration-adjustments with acknowledgeFixtureOnly when fixtureOnly", async () => {
    mockCalibrationTabApis();

    mockApiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (
        url.includes(`/calibration-adjustments/${GLOBAL_ADJUSTMENT_ID}/accept`) &&
        init?.method === "PATCH"
      ) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ adjustment: { id: GLOBAL_ADJUSTMENT_ID } }),
        } as Response;
      }
      if (url.includes("score-calibration")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            report: crossClientCalibrationReport,
            persistedAdjustmentCount: 1,
          }),
        } as Response;
      }
      if (url.includes("learning-impact") || url.includes("sample-coverage")) {
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

    await openCalibrationTab();

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /fixture evidence/i,
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        `/api/feedback/calibration-adjustments/${GLOBAL_ADJUSTMENT_ID}/accept`,
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ acknowledgeFixtureOnly: true }),
        })
      );
    });
  });

  it("reject calls PATCH reject with reason text", async () => {
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("Not enough real customer evidence");

    mockApiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (
        url.includes(`/calibration-adjustments/${GLOBAL_ADJUSTMENT_ID}/reject`) &&
        init?.method === "PATCH"
      ) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ adjustment: { id: GLOBAL_ADJUSTMENT_ID, status: "rejected" } }),
        } as Response;
      }
      if (url.includes("score-calibration")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            report: crossClientCalibrationReport,
            persistedAdjustmentCount: 1,
          }),
        } as Response;
      }
      if (url.includes("learning-impact") || url.includes("sample-coverage")) {
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

    await openCalibrationTab();

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        `/api/feedback/calibration-adjustments/${GLOBAL_ADJUSTMENT_ID}/reject`,
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            reason: "Not enough real customer evidence",
          }),
        })
      );
    });

    promptSpy.mockRestore();
  });
});
