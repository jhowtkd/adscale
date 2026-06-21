import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
      if (url.includes("funnel")) {
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
            totals: { events: 1, sessions: 1 },
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
    expect(screen.getByText("Credits and billing")).toBeInTheDocument();
  });

  it("returns null when owner is forbidden", async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 403 } as Response);

    const { container } = renderPanel();
    await vi.waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });
});
