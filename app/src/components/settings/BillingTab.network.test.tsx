import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import BillingTab from "./BillingTab";

// The real hooks run here; only the network edge is mocked.
vi.mock("@/lib/api-client", () => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/equipe/use-equipe", () => ({ useFreePlanAccount: () => null }));
vi.mock("@/components/billing/FreePlanCta", () => ({ FreePlanCta: () => null }));
vi.mock("next-intl", () => ({
  useLocale: () => "pt-BR",
  useTranslations: (namespace: string) => {
    const t = ((key: string) => `${namespace}.${key}`) as ReturnType<typeof import("next-intl").useTranslations>;
    t.has = () => false;
    return t;
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ replace: vi.fn() })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));
vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import { apiFetch } from "@/lib/api-client";

const mockApiFetch = vi.mocked(apiFetch);

const billing = {
  hasCustomer: true,
  subscriptionStatus: "active",
  access: { kind: "paid", label: "Assinatura ativa", remainingAds: 24, hasSpendAccess: true, beta: null },
  pastDue: null,
  canceled: null,
  subscription: {
    status: "active",
    rawStatus: "active",
    planKey: "growth",
    currentPeriodEnd: "2026-07-01T00:00:00.000Z",
    cancelAtPeriodEnd: false,
  },
  creditBalance: 120,
};

function respond(body: unknown) {
  return { ok: true, json: () => Promise.resolve(body) } as unknown as Response;
}

describe("BillingTab network behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("never fetches transactions: every history request is view=grants, and pages chain by cursor", async () => {
    mockApiFetch.mockImplementation(async (input) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/billing/history") {
        return respond({
          grants: [
            {
              id: url.searchParams.get("cursor") ? "grant-2" : "grant-1",
              source: "stripe_invoice",
              amount: 10,
              remaining: 5,
              createdAt: "2026-05-01T12:00:00.000Z",
            },
          ],
          nextCursor: url.searchParams.get("cursor") ? null : "cursor-1",
        });
      }
      return respond({ billing });
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <BillingTab />
      </QueryClientProvider>
    );

    const button = await screen.findByRole("button", { name: "billing.account.grants.loadMore" });
    button.click();
    await waitFor(() => expect(screen.queryByText("billing.account.grants.loadMore")).not.toBeInTheDocument());

    const historyUrls = mockApiFetch.mock.calls
      .map(([input]) => new URL(String(input), "http://localhost"))
      .filter((url) => url.pathname === "/api/billing/history");
    expect(historyUrls).toHaveLength(2);
    for (const url of historyUrls) expect(url.searchParams.get("view")).toBe("grants");
    expect(historyUrls[0].searchParams.get("cursor")).toBeNull();
    expect(historyUrls[1].searchParams.get("cursor")).toBe("cursor-1");
  });
});
