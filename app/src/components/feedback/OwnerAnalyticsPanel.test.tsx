import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OwnerAnalyticsPanel } from "./OwnerAnalyticsPanel";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => {
    const analytics: Record<string, string> = {
      title: "Beta analytics",
      description: "Mission and cockpit funnels, credit signals, readiness overrides.",
      exportCsv: "Export CSV",
      loading: "Loading analytics…",
      loadError: "Unable to load analytics.",
      retry: "Retry",
      lastUpdated: "Updated at {time}",
      noData: "No data for current filters.",
      "filters.toggle": "Filters",
      "filters.workspaceId": "Workspace",
      "filters.workspacePlaceholder": "All workspaces",
      "filters.session": "Session",
      "filters.allSessions": "All sessions",
      "filters.from": "From",
      "filters.to": "To",
      "filters.active": "Filters active",
      "metrics.events": "{count} events",
      "metrics.sessions": "{count} sessions",
      "metrics.creditBlocks": "{count} credit blocks",
      "metrics.creditSurprises": "{count} credit surprises",
      "groups.coreFunnels": "Core funnels",
      "groups.credits": "Credits and billing",
      "groups.sessions": "Sessions and timing",
      "groups.shareReadiness": "Share and readiness",
      "sections.missionConversion": "Mission conversion",
      "sections.cockpitStage": "Cockpit stage funnel",
      "sections.creditSurprisesByOperation": "Credit surprises by operation",
      "columns.mission": "Mission",
      "columns.stage": "Stage",
      "columns.entered": "Entered",
      "columns.completed": "Completed",
      "columns.abandoned": "Abandoned",
      "columns.rate": "Rate",
      "columns.operation": "Operation",
      "columns.count": "Count",
      "columns.totalDelta": "Total Δ",
      "columns.maxDelta": "Max |Δ|",
      "columns.estimate": "Estimate",
      "columns.actual": "Actual",
      "columns.delta": "Delta",
      "stages.preview": "Preview gate",
      "operations.preview": "Preview",
      "outcomes.proceed": "Proceeded",
      "outcomes.abandon": "Abandoned",
    };

    const missionItems: Record<string, string> = {
      "export.label": "Export for platforms",
    };

    const handler = (key: string, values?: Record<string, unknown>) => {
      if (namespace === "feedback.analytics") {
        const template = analytics[key] ?? key;
        return template.replace("{count}", String(values?.count ?? ""));
      }
      if (namespace === "dashboard.missions.items") {
        return missionItems[key] ?? key;
      }
      if (namespace === "strategy.recipes") return key;
      if (namespace === "guidedBriefing.steps") return key;
      if (namespace === "readiness.dimensions") return key;
      return key;
    };

    handler.has = (key: string) => {
      if (namespace === "feedback.analytics") return key in analytics;
      if (namespace === "dashboard.missions.items") return key in missionItems;
      return false;
    };

    return handler;
  },
}));

import { apiFetch } from "@/lib/api-client";

const mockApiFetch = vi.mocked(apiFetch);

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OwnerAnalyticsPanel />
    </QueryClientProvider>
  );
}

describe("OwnerAnalyticsPanel", () => {
  it("renders funnel tables when analytics load", async () => {
    mockApiFetch.mockImplementation(async (url: string) => {
      if (url.includes("funnel") && !url.includes("guided-flow")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            missionFunnel: [
              { missionKey: "export", entered: 0, completed: 1, conversionRate: null },
            ],
            cockpitStageFunnel: [
              { stage: "preview", entered: 1, completed: 0, abandoned: 1 },
            ],
            creditSurprises: [],
            creditSurprisesByOperation: [],
            sessionStageTimeline: [],
            readinessOverrides: [],
            studioFunnel: [
              {
                variant: "control", eligibleSessions: 1, confirmedGenerations: 1,
                completionsWithin24h: 1, completionRate: 1,
                abandonmentsBeforeGeneration: 0, abandonmentRate: 0,
                goalSwitches: 0, sourceRoleCorrections: 0, successfulResumesWithin30m: 0,
                refinementsStarted: 0, debitedGenerations: 1, compensatedGenerations: 0,
                failedGenerations: 0, failureRate: 0, refundedGenerations: 0, refundRate: 0,
                medianEntryToBriefingMs: 60_000, medianEntryToPlanMs: null,
                completionByInputMode: [],
              },
              {
                variant: "progressive", eligibleSessions: 1, confirmedGenerations: 1,
                completionsWithin24h: 0, completionRate: 0,
                abandonmentsBeforeGeneration: 1, abandonmentRate: 1,
                goalSwitches: 0, sourceRoleCorrections: 0, successfulResumesWithin30m: 0,
                refinementsStarted: 0, debitedGenerations: 1, compensatedGenerations: 0,
                failedGenerations: 1, failureRate: 1, refundedGenerations: 1, refundRate: 1,
                medianEntryToBriefingMs: 60_000, medianEntryToPlanMs: 120_000,
                completionByInputMode: [],
              },
            ],
            totals: { events: 1, sessions: 1 },
          }),
        } as Response;
      }
      if (url.includes("guided-flow-funnel")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            implementationCoverage: {
              telemetryEnabled: true,
              pathsCovered: [],
              eventKeysObserved: [],
            },
            operationalEvidence: {
              sampleSufficient: false,
              minSampleThreshold: 10,
              observedStarts: 0,
              note: "Insufficient guided-flow sample for this filter window.",
            },
            pathFunnel: [],
            stepDropoff: [],
            topBlockers: [],
            investigationLinks: [],
            totals: { events: 0 },
          }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          healthyCount: 0,
          frustrationCount: 0,
          creditFrictionCount: 0,
          eventSignals: {
            creditBlockedCount: 0,
            creditSpendCount: 0,
            surpriseCount: 0,
            recentSurprises: [],
          },
        }),
      } as Response;
    });

    renderPanel();

    expect(await screen.findByText("Beta analytics")).toBeInTheDocument();
    expect(await screen.findByText("Mission conversion")).toBeInTheDocument();
    expect(await screen.findByText("Export for platforms")).toBeInTheDocument();
    expect(await screen.findByText("Preview gate")).toBeInTheDocument();
    expect(screen.getByText("Export CSV")).toBeInTheDocument();
    expect(screen.getByText("Core funnels")).toBeInTheDocument();
    expect(screen.getByText("Estúdio progressivo")).toBeInTheDocument();
    expect(screen.getByText("Amostra insuficiente")).toBeInTheDocument();
    expect(screen.getByText("Credits and billing")).toBeInTheDocument();
    expect(
      mockApiFetch.mock.calls.some(([url]) =>
        String(url).includes("human-quality-corpus")
      )
    ).toBe(false);
  });

  it("returns null when owner is forbidden", async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 403 } as Response);

    const { container } = renderPanel();
    await vi.waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it("offers a retry when analytics loading fails", async () => {
    let calls = 0;
    mockApiFetch.mockImplementation(async () => {
      calls += 1;
      return { ok: false, status: 500 } as Response;
    });

    renderPanel();

    expect(await screen.findByText("Unable to load analytics.")).toBeInTheDocument();
    const retry = screen.getByRole("button", { name: "Retry" });
    const callsBeforeRetry = calls;
    fireEvent.click(retry);

    await waitFor(() => expect(calls).toBeGreaterThan(callsBeforeRetry));
  });
});
