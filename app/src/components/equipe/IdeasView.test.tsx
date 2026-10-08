import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import IdeasView from "./IdeasView";
import { apiFetch } from "@/lib/api-client";
import { EquipeCommandError } from "@/lib/equipe/commands";

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

let railBrand: { id: string; name: string } | undefined;
vi.mock("@/lib/brands/active-brand-context", () => ({
  useActiveBrand: () => railBrand,
  useSwitchActiveBrand: () => vi.fn(),
}));

const { decideMock } = vi.hoisted(() => ({ decideMock: vi.fn() }));

vi.mock("@/lib/equipe/commands", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/equipe/commands")>();
  return { ...original, decideEquipeIdea: decideMock };
});

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
      versionHash: "hash-ideia-1",
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
      versionHash: null,
    },
  ],
};

function renderView() {
  mockedFetch.mockImplementation(async (input) => {
    const path = String(input);
    if (path === "/api/equipe/accounts") return json({ accounts: [ACCOUNT] });
    if (path === "/api/equipe/accounts/acc-1") {
      return json({
        workspaceId: "ws-1",
        accountId: "acc-1",
        status: "active",
        fronts: [],
        pendingSteps: [],
        activePauses: [],
      });
    }
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
    railBrand = undefined;
    decideMock.mockResolvedValue({});
  });

  it("lists proposals with kind and status", async () => {
    renderView();
    expect(await screen.findByTestId("ideas-list")).toBeInTheDocument();
    expect(screen.getByTestId("idea-row-idea-1")).toHaveTextContent("December gifts");
    expect(screen.getByTestId("idea-row-idea-1")).toHaveTextContent("kind_plan_change");
    expect(screen.getByTestId("idea-row-idea-2")).toHaveTextContent("status_accepted");
  });

  it("opens the detail through ?idea= with the approve/reject decision", async () => {
    searchString = "idea=idea-1";
    renderView();
    expect(await screen.findByTestId("idea-detail")).toBeInTheDocument();
    expect(screen.getByTestId("idea-detail-title")).toHaveTextContent("December gifts");
    expect(screen.getByTestId("idea-detail-summary")).toHaveTextContent("Gift kit focus");
    expect(screen.getByTestId("idea-decision")).toBeInTheDocument();
    expect(screen.getByTestId("idea-talk")).toHaveAttribute("href", "/assistant");
  });

  it("approves the open idea echoing the server hash", async () => {
    searchString = "idea=idea-1";
    renderView();
    fireEvent.click(await screen.findByTestId("idea-approve"));
    await waitFor(() => {
      expect(decideMock).toHaveBeenCalledWith("acc-1", {
        ideaId: "idea-1",
        decision: "approve",
        expectedVersionHash: "hash-ideia-1",
      });
    });
  });

  it("rejects with an optional reason", async () => {
    searchString = "idea=idea-1";
    renderView();
    fireEvent.click(await screen.findByTestId("idea-reject-toggle"));
    fireEvent.change(screen.getByTestId("idea-reject-reason"), {
      target: { value: "not this cycle" },
    });
    fireEvent.click(screen.getByTestId("idea-reject-send"));
    await waitFor(() => {
      expect(decideMock).toHaveBeenCalledWith("acc-1", {
        ideaId: "idea-1",
        decision: "reject",
        expectedVersionHash: "hash-ideia-1",
        reason: "not this cycle",
      });
    });
  });

  it("asks to review again when the idea went stale", async () => {
    decideMock.mockRejectedValueOnce(new EquipeCommandError("stale", 409, "stale_version"));
    searchString = "idea=idea-1";
    renderView();
    fireEvent.click(await screen.findByTestId("idea-approve"));
    await waitFor(() => {
      expect(screen.getByTestId("idea-decide-error")).toHaveTextContent("staleVersion");
    });
  });

  it("shows no decision controls for decided ideas", async () => {
    searchString = "idea=idea-2";
    renderView();
    expect(await screen.findByTestId("idea-detail")).toBeInTheDocument();
    expect(screen.queryByTestId("idea-decision")).not.toBeInTheDocument();
  });

  it("selects an idea by updating the search params", async () => {
    renderView();
    fireEvent.click(await screen.findByTestId("idea-row-idea-2"));
    expect(replaceMock).toHaveBeenCalledWith("/ideas?account=acc-1&idea=idea-2", {
      scroll: false,
    });
  });
});

// Spec 2026-10-07 §3: in the rail, a brand without an account shows the empty screen until the account exists.
describe("IdeasView in the rail: a brand with no account yet", () => {
  const OTHER_BRAND_ACCOUNT = { ...ACCOUNT, id: "acc-other", clientProfileId: "cp-other" };

  function renderWithAccounts(accounts: unknown[] | "pending") {
    mockedFetch.mockImplementation(async (input) => {
      const path = String(input);
      if (path === "/api/equipe/accounts") {
        return accounts === "pending" ? new Promise<Response>(() => {}) : json({ accounts });
      }
      throw new Error(`unexpected fetch ${path}`);
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <IdeasView />
      </QueryClientProvider>,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    searchString = "";
    railBrand = { id: "cp-new", name: "Studio Lume" };
  });

  it("shows the empty screen of ideas when other brands have accounts but the active one does not", async () => {
    renderWithAccounts([OTHER_BRAND_ACCOUNT]);
    expect(await screen.findByTestId("equipe-empty-screen")).toHaveAttribute("data-surface", "ideas");
    // Only the account list (read again by the screen that mounts on it, since it lacks this brand's account) and the
    // billing status (does the free plan pin the rail?) are read: nothing of the other brand's account.
    expect(new Set(mockedFetch.mock.calls.map((call) => String(call[0])))).toEqual(
      new Set(["/api/equipe/accounts", "/api/billing/status"]),
    );
  });

  it("shows it when the workspace has no account at all", async () => {
    renderWithAccounts([]);
    expect(await screen.findByTestId("equipe-empty-screen")).toHaveAttribute("data-surface", "ideas");
  });

  it("does not show it while the accounts load", async () => {
    renderWithAccounts("pending");
    expect(await screen.findByTestId("equipe-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("equipe-empty-screen")).not.toBeInTheDocument();
  });
});
