import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import IdeasView from "./IdeasView";
import { apiFetch } from "@/lib/api-client";

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = ((key: string, values?: Record<string, unknown>) => {
      let out = key;
      for (const [k, v] of Object.entries(values ?? {})) out = out.replace(`{${k}}`, String(v));
      return out;
    }) as ((key: string, values?: Record<string, unknown>) => string) & {
      has: () => boolean;
    };
    t.has = () => true;
    return t;
  },
  useLocale: () => "pt-BR",
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const replaceMock = vi.fn();
let searchString = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => new URLSearchParams(searchString),
  usePathname: () => "/ideas",
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

const mockedFetch = vi.mocked(apiFetch);

function json(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const ACCOUNT = {
  id: "acc-1",
  workspaceId: "ws-1",
  clientProfileId: "cp-1",
  status: "active",
  launchedAt: null,
  closedAt: null,
  notes: null,
  createdAt: "2026-10-06T00:00:00.000Z",
  updatedAt: "2026-10-06T00:00:00.000Z",
};

const IDEAS = {
  workspaceId: "ws-1",
  accountId: "acc-1",
  ideas: [
    {
      id: "idea-1",
      kind: "plan_change",
      status: "proposed",
      payload: { title: "December gifts", summary: "Gift kit focus", theme: "gift" },
      resultingPlanVersion: null,
      resultingMandateVersion: null,
      decidedAt: null,
      receiptId: null,
      createdAt: "2026-11-17T00:00:00.000Z",
      updatedAt: "2026-11-17T00:00:00.000Z",
    },
    {
      id: "idea-2",
      kind: "mandate_change",
      status: "accepted",
      payload: { title: "Pause costly ads", summary: "Shadow mode first" },
      resultingPlanVersion: null,
      resultingMandateVersion: 2,
      decidedAt: "2026-11-16T00:00:00.000Z",
      receiptId: "rc-1",
      createdAt: "2026-11-15T00:00:00.000Z",
      updatedAt: "2026-11-16T00:00:00.000Z",
    },
  ],
};

function renderView() {
  mockedFetch.mockImplementation(async (input) => {
    const path = String(input);
    if (path === "/api/equipe/accounts") return json({ accounts: [ACCOUNT] });
    if (path === "/api/equipe/accounts/acc-1/ideas") return json(IDEAS);
    throw new Error(`unexpected fetch ${path}`);
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <IdeasView />
    </QueryClientProvider>,
  );
}

describe("IdeasView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchString = "";
  });

  it("lists proposals with kind and status, read-only", async () => {
    renderView();
    expect(await screen.findByTestId("ideas-list")).toBeInTheDocument();
    expect(screen.getByTestId("idea-row-idea-1")).toHaveTextContent("December gifts");
    expect(screen.getByTestId("idea-row-idea-1")).toHaveTextContent("kind_plan_change");
    expect(screen.getByTestId("idea-row-idea-2")).toHaveTextContent("status_accepted");
  });

  it("opens the detail through ?idea= with the read-only note and no approval", async () => {
    searchString = "idea=idea-1";
    renderView();
    expect(await screen.findByTestId("idea-detail")).toBeInTheDocument();
    expect(screen.getByTestId("idea-detail-title")).toHaveTextContent("December gifts");
    expect(screen.getByTestId("idea-detail-summary")).toHaveTextContent("Gift kit focus");
    expect(screen.getByTestId("idea-readonly-note")).toBeInTheDocument();
    expect(screen.getByTestId("idea-talk")).toHaveAttribute("href", "/assistant");
    // Only the dialog close button: no approve/reject controls (read-only).
    expect(within(screen.getByTestId("idea-detail")).queryAllByRole("button")).toHaveLength(1);
  });

  it("selects an idea by updating the search params", async () => {
    renderView();
    fireEvent.click(await screen.findByTestId("idea-row-idea-2"));
    expect(replaceMock).toHaveBeenCalledWith("/ideas?idea=idea-2", { scroll: false });
  });
});
