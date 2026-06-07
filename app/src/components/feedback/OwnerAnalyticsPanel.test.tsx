import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OwnerAnalyticsPanel } from "./OwnerAnalyticsPanel";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
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

    expect(await screen.findByText("Mission conversion")).toBeInTheDocument();
    expect(screen.getByText("Credit surprises by operation")).toBeInTheDocument();
    expect(screen.getByText("export")).toBeInTheDocument();
    expect(screen.getByText("Export CSV")).toBeInTheDocument();
  });

  it("returns null when owner is forbidden", async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 403 } as Response);

    const { container } = renderPanel();
    await vi.waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });
});
