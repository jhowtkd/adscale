import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FactualAlertsPanel } from "./FactualAlertsPanel";
import type { FactualIssueAlert } from "@/server/human-quality/calibration/types";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api-client";

const mockApiFetch = vi.mocked(apiFetch);

const WORKSPACE_ID = "550e8400-e29b-41d4-a716-446655440002";
const CLIENT_PROFILE_ID = "550e8400-e29b-41d4-a716-446655440003";

const alertFixture: FactualIssueAlert = {
  workspaceId: WORKSPACE_ID,
  clientProfileId: CLIENT_PROFILE_ID,
  sliceKey: "slice-factual-issue",
  rationale: "factual_guard_review_required",
  evidenceRefs: {
    corpusItemIds: ["corpus-item-aaa", "corpus-item-bbb"],
    artifactIds: ["artifact-1", "artifact-2", "artifact-3"],
    stats: {
      count: 4,
      meanSignedDelta: -0.5,
      meanAbsError: 1.2,
      overScoreCount: 1,
      underScoreCount: 3,
    },
  },
};

function renderPanel(
  props?: Partial<Parameters<typeof FactualAlertsPanel>[0]>
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FactualAlertsPanel workspaceId={WORKSPACE_ID} {...props} />
    </QueryClientProvider>
  );
}

function mockAlertsList(alerts: FactualIssueAlert[]) {
  mockApiFetch.mockImplementation(async (url: string | RequestInfo | URL) => {
    const path = String(url);
    if (path.includes("/learning/factual-alerts")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ alerts }),
      } as Response;
    }
    return { ok: false, status: 404 } as Response;
  });
}

describe("FactualAlertsPanel — fetch and section shell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading then alert list when API returns alerts fixture", async () => {
    mockAlertsList([alertFixture]);
    renderPanel();

    expect(screen.getByText(/loading factual issue alerts/i)).toBeInTheDocument();

    expect(await screen.findByTestId("factual-alerts-panel")).toBeInTheDocument();
    expect(screen.getByText("Factual issue alerts")).toBeInTheDocument();
    expect(screen.getByText(alertFixture.sliceKey)).toBeInTheDocument();
  });

  it("returns restricted message when apiFetch status is 403", async () => {
    mockApiFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({}),
    } as Response);

    renderPanel();

    expect(
      await screen.findByText(/factual issue alerts are restricted to platform owners/i)
    ).toBeInTheDocument();
    expect(screen.queryByTestId("factual-alerts-panel")).not.toBeInTheDocument();
  });

  it("shows empty state copy when alerts array is empty", async () => {
    mockAlertsList([]);
    renderPanel();

    expect(
      await screen.findByText(/no factual issue slices meet alert thresholds/i)
    ).toBeInTheDocument();
  });

  it("includes workspaceId and clientProfileId in fetch URL when props set", async () => {
    mockAlertsList([alertFixture]);
    renderPanel({ clientProfileId: CLIENT_PROFILE_ID });

    await screen.findByText(alertFixture.sliceKey);

    const listCall = mockApiFetch.mock.calls.find(([url]) =>
      String(url).includes("/learning/factual-alerts")
    );
    expect(listCall).toBeDefined();
    const fetchUrl = String(listCall![0]);
    expect(fetchUrl).toContain(`workspaceId=${WORKSPACE_ID}`);
    expect(fetchUrl).toContain(`clientProfileId=${CLIENT_PROFILE_ID}`);
  });
});

describe("FactualAlertsPanel — safe evidence links and stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows sliceKey, workspaceId, clientProfileId, rationale, and stats per alert", async () => {
    mockAlertsList([alertFixture]);
    renderPanel();

    await screen.findByText(alertFixture.sliceKey);

    expect(screen.getByText(alertFixture.workspaceId)).toBeInTheDocument();
    expect(screen.getByText(alertFixture.clientProfileId)).toBeInTheDocument();
    expect(screen.getByText("factual_guard_review_required")).toBeInTheDocument();
    expect(screen.getByText(String(alertFixture.evidenceRefs.stats.count))).toBeInTheDocument();
    expect(screen.getByText(String(alertFixture.evidenceRefs.stats.meanSignedDelta))).toBeInTheDocument();
    expect(screen.getByText(String(alertFixture.evidenceRefs.stats.meanAbsError))).toBeInTheDocument();
    expect(screen.getByText(String(alertFixture.evidenceRefs.stats.overScoreCount))).toBeInTheDocument();
    expect(screen.getByText(String(alertFixture.evidenceRefs.stats.underScoreCount))).toBeInTheDocument();
  });

  it("renders brand link to /admin/quality/brands/{clientProfileId}", async () => {
    mockAlertsList([alertFixture]);
    renderPanel();

    const brandLink = await screen.findByRole("link", {
      name: new RegExp(alertFixture.clientProfileId),
    });
    expect(brandLink).toHaveAttribute(
      "href",
      `/admin/quality/brands/${alertFixture.clientProfileId}`
    );
  });

  it("renders each corpusItemId as link to /feedback with visible id label", async () => {
    mockAlertsList([alertFixture]);
    renderPanel();

    for (const corpusItemId of alertFixture.evidenceRefs.corpusItemIds) {
      const link = await screen.findByRole("link", { name: corpusItemId });
      expect(link).toHaveAttribute("href", "/feedback");
    }
  });

  it("shows artifact count only when artifactIds present — no raw artifact links", async () => {
    mockAlertsList([alertFixture]);
    renderPanel();

    expect(
      await screen.findByText(/3 artifacts referenced/i)
    ).toBeInTheDocument();

    const artifactLinks = screen
      .queryAllByRole("link")
      .filter((link) => String(link.getAttribute("href")).includes("artifact"));
    expect(artifactLinks).toHaveLength(0);
  });

  it("does not render forbidden evidence fields in the DOM", async () => {
    mockAlertsList([alertFixture]);
    const { container } = renderPanel();

    await screen.findByText(alertFixture.sliceKey);

    const domText = container.textContent ?? "";
    expect(domText).not.toContain("artifactRef");
    expect(domText).not.toContain("storageKey");
    expect(domText).not.toContain("evaluationNotes");
  });

  it("has no Accept, Reject, or Generate action buttons", async () => {
    mockAlertsList([alertFixture]);
    renderPanel();

    await screen.findByText(alertFixture.sliceKey);

    expect(screen.queryByRole("button", { name: /^accept$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^reject$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /generate/i })).not.toBeInTheDocument();
  });
});
