import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PipelineView from "./PipelineView";
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
  usePathname: () => "/pipeline",
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

function itemView(id: string, displayState: string, status: string) {
  return {
    item: {
      id,
      frontId: "front-1",
      batchId: "batch-1",
      creativeWorkId: "work-1",
      status,
      scheduledFor: "2026-11-23T12:00:00.000Z",
      deadlineAt: null,
      destination: "@cafeaurora",
      currentVersionHash: `hash-${id}`,
      publishedOutputId: null,
      createdAt: "2026-11-16T00:00:00.000Z",
      updatedAt: "2026-11-16T00:00:00.000Z",
    },
    batch: {
      id: "batch-1",
      frontId: "front-1",
      title: "Batch 1",
      status: "delivered",
      approveByAt: "2026-11-19T17:00:00.000Z",
      deliveredAt: null,
      createdAt: "2026-11-16T00:00:00.000Z",
      updatedAt: "2026-11-16T00:00:00.000Z",
    },
    displayState,
    review: {
      flags: { blocked: false, editedInReview: false, editWarning: false, needsConfirmation: false },
      status: displayState,
      batchApprovable: displayState === "ready",
      triage: null,
    },
    preview: {
      versionHash: `hash-${id}`,
      caption: `Caption ${id}`,
      creativeWorkOutputId: "out-1",
    },
  };
}

const PIPELINE = {
  workspaceId: "ws-1",
  accountId: "acc-1",
  columns: [
    { key: "needs_you", itemIds: ["a", "b"] },
    { key: "in_progress", itemIds: ["c"] },
    { key: "scheduled", itemIds: ["d"] },
    { key: "finished", itemIds: ["e"] },
    { key: "missed", itemIds: ["f"] },
  ],
  items: [
    itemView("a", "ready", "awaiting_approval"),
    itemView("b", "blocked", "awaiting_approval"),
    itemView("c", "adjusting", "adjusting"),
    itemView("d", "scheduled", "scheduled"),
    itemView("e", "published", "published"),
    itemView("f", "missed_window", "missed_window"),
  ],
};

function detailFor(id: string) {
  const found = PIPELINE.items.find((entry) => entry.item.id === id)!;
  return {
    workspaceId: "ws-1",
    accountId: "acc-1",
    item: found.item,
    batch: found.batch,
    versions: [
      {
        id: `ver-${id}`,
        itemId: id,
        versionHash: `hash-${id}`,
        creativeWorkOutputId: "out-1",
        caption: `Caption ${id}`,
        scheduledFor: "2026-11-23T12:00:00.000Z",
        destination: "@cafeaurora",
        authorRole: "agent",
        authorId: null,
        reviewerFindings: null,
        createdAt: "2026-11-16T00:00:00.000Z",
      },
    ],
    receipts: [],
    review: found.review,
    destinationAccount: "@cafeaurora",
    findings: [],
    triage: [],
    activeIntent: null,
  };
}

function routeFetch(accountsStatus = 200) {
  mockedFetch.mockImplementation(async (input) => {
    const path = String(input);
    if (path === "/api/equipe/accounts") {
      return accountsStatus === 200 ? json({ accounts: [ACCOUNT] }) : json({ error: "x" }, 404);
    }
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
    if (path === "/api/equipe/accounts/acc-1/pipeline") return json(PIPELINE);
    const itemMatch = path.match(/\/api\/equipe\/accounts\/acc-1\/items\/(.+)$/);
    if (itemMatch) return json(detailFor(itemMatch[1]!));
    throw new Error(`unexpected fetch ${path}`);
  });
}

function renderView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PipelineView />
    </QueryClientProvider>,
  );
}

describe("PipelineView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchString = "";
  });

  it("renders the four columns with the API state pill per card", async () => {
    routeFetch();
    renderView();
    expect(await screen.findByTestId("pipeline-column-needs_you")).toBeInTheDocument();
    expect(screen.getByTestId("pipeline-column-needs_you-count")).toHaveTextContent("2");
    expect(screen.getByTestId("pipeline-column-in_progress-count")).toHaveTextContent("1");
    expect(screen.getByTestId("pipeline-column-scheduled-count")).toHaveTextContent("1");
    expect(screen.getByTestId("pipeline-column-finished-count")).toHaveTextContent("1");
    expect(await screen.findByTestId("pipeline-card-a")).toHaveAttribute("data-state", "ready");
    expect(screen.getByTestId("pipeline-card-b")).toHaveAttribute("data-state", "blocked");
    // Misses stay visible below the four columns instead of vanishing.
    expect(screen.getByTestId("pipeline-column-missed")).toBeInTheDocument();
    expect(screen.getByTestId("pipeline-card-f")).toHaveAttribute("data-state", "missed_window");
    // Card links open the overlay through ?item=, keeping the account.
    expect(screen.getByTestId("pipeline-card-a")).toHaveAttribute(
      "href",
      "/pipeline?account=acc-1&item=a",
    );
  });

  it("renders card titles from the read model with no per-card detail fetch", async () => {
    routeFetch();
    renderView();
    expect(await screen.findByTestId("pipeline-card-a")).toHaveTextContent("Caption a");
    expect(screen.getByTestId("pipeline-card-f")).toHaveTextContent("Caption f");
    const itemFetches = mockedFetch.mock.calls.filter((call) =>
      String(call[0]).includes("/items/"),
    );
    expect(itemFetches).toHaveLength(0);
  });

  it("opens the batch review from the needs-you column", async () => {
    routeFetch();
    renderView();
    fireEvent.click(await screen.findByTestId("pipeline-review-batch"));
    expect(await screen.findByTestId("batch-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("batch-row-a")).toBeInTheDocument();
    expect(screen.getByTestId("batch-row-b")).toBeInTheDocument();
  });

  it("hides the pipeline when the workspace is not in the pilot", async () => {
    routeFetch(404);
    renderView();
    expect(await screen.findByTestId("equipe-disabled")).toBeInTheDocument();
    expect(screen.queryByTestId("pipeline-column-needs_you")).not.toBeInTheDocument();
  });

  it("defaults to the account with pending decisions and stamps it into the URL", async () => {
    const quiet = { ...ACCOUNT, id: "acc-quiet", pendingDecisions: false };
    const busy = {
      ...ACCOUNT,
      id: "acc-busy",
      clientProfileName: "Café Aurora",
      status: "calibrating",
      pendingDecisions: true,
    };
    mockedFetch.mockImplementation(async (input) => {
      const path = String(input);
      if (path === "/api/equipe/accounts") return json({ accounts: [quiet, busy] });
      if (path === "/api/equipe/accounts/acc-busy") {
        return json({
          workspaceId: "ws-1",
          accountId: "acc-busy",
          status: "calibrating",
          fronts: [],
          pendingSteps: [],
          activePauses: [],
        });
      }
      if (path === "/api/equipe/accounts/acc-busy/pipeline") return json(PIPELINE);
      throw new Error(`unexpected fetch ${path}`);
    });
    renderView();
    expect(await screen.findByTestId("pipeline-column-needs_you")).toBeInTheDocument();
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/pipeline?account=acc-busy", { scroll: false });
    });
    // The switcher shows the brand name through the named template.
    expect(screen.getByTestId("equipe-account-switcher")).toHaveTextContent("accountOptionNamed");
  });

  it("switches accounts through the URL param", async () => {
    searchString = "account=acc-1";
    const second = { ...ACCOUNT, id: "acc-2", pendingDecisions: false };
    mockedFetch.mockImplementation(async (input) => {
      const path = String(input);
      if (path === "/api/equipe/accounts") return json({ accounts: [ACCOUNT, second] });
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
      if (path === "/api/equipe/accounts/acc-1/pipeline") return json(PIPELINE);
      throw new Error(`unexpected fetch ${path}`);
    });
    renderView();
    fireEvent.change(await screen.findByTestId("equipe-account-switcher"), {
      target: { value: "acc-2" },
    });
    expect(replaceMock).toHaveBeenCalledWith("/pipeline?account=acc-2", { scroll: false });
  });

  it("opens a bare ?item= link on the item's account", async () => {
    searchString = "item=x-item";
    const second = { ...ACCOUNT, id: "acc-2", pendingDecisions: false };
    mockedFetch.mockImplementation(async (input) => {
      const path = String(input);
      if (path === "/api/equipe/accounts") return json({ accounts: [ACCOUNT, second] });
      if (path === "/api/equipe/accounts/acc-1/items/x-item") {
        return json({ error: "notFound" }, 404);
      }
      if (path === "/api/equipe/accounts/acc-2/items/x-item") {
        return json({ ...detailFor("a"), accountId: "acc-2" });
      }
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
      if (path === "/api/equipe/accounts/acc-2") {
        return json({
          workspaceId: "ws-1",
          accountId: "acc-2",
          status: "active",
          fronts: [],
          pendingSteps: [],
          activePauses: [],
        });
      }
      if (path === "/api/equipe/accounts/acc-2/pipeline") return json(PIPELINE);
      throw new Error(`unexpected fetch ${path}`);
    });
    renderView();
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/pipeline?item=x-item&account=acc-2", {
        scroll: false,
      });
    });
  });
});
