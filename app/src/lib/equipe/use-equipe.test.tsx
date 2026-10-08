import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { defaultEquipeAccountId, useEquipeAccounts, useEquipeAccountSelection, useEquipeAccountState, useFreePlanAccount } from "./use-equipe";
import type { AccountStateJson } from "./api";

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return { ...actual, fetchAccountState: vi.fn(), fetchEquipeAccounts: vi.fn() };
});

import { fetchAccountState, fetchEquipeAccounts } from "./api";
const mockFetchAccountState = vi.mocked(fetchAccountState);
const mockFetchEquipeAccounts = vi.mocked(fetchEquipeAccounts);

// The rail's provider and the router, for the account selection (spec 2026-10-07 §3).
let railBrand: { id: string; name: string } | null | undefined;
const switchBrand = vi.fn();
vi.mock("@/lib/brands/active-brand-context", () => ({
  useActiveBrand: () => railBrand,
  useSwitchActiveBrand: () => switchBrand,
}));
const routerReplace = vi.fn();
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplace }),
  useSearchParams: () => search,
}));

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function state(reading: NonNullable<AccountStateJson["handoff"]>["reading"]): AccountStateJson {
  return {
    workspaceId: "ws-1", accountId: "acc-1", status: "free", fronts: [], pendingSteps: [], activePauses: [],
    handoff: { id: "h1", step: "reading", version: 1, source: null, readingId: "r1", readsUsed: 1,
      reading, captured: {}, decisions: {} },
  };
}

// Real timers: the polling interval is a real 1.5s, exercised end to end
// against the actual refetchInterval config in useEquipeAccountState rather
// than a re-implementation of it.
describe("useEquipeAccountState: H2 progress polling (ticket 04)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("polls again ~1.5s after the first fetch while a group is pending or running", async () => {
    mockFetchAccountState.mockResolvedValue(state({ name: { runId: "r", taskIntentId: "t", status: "running" } }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useEquipeAccountState("acc-1"), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetchAccountState).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockFetchAccountState.mock.calls.length).toBeGreaterThanOrEqual(2), { timeout: 3000 });
  }, 10_000);

  it("never polls once every group has finished reading", async () => {
    mockFetchAccountState.mockResolvedValue(state({
      name: { runId: "r", taskIntentId: "t", status: "found" },
      logo: { runId: "r", taskIntentId: "t", status: "not_found" },
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useEquipeAccountState("acc-1"), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetchAccountState).toHaveBeenCalledTimes(1);
    // No interval fires: still exactly one call well past 1.5s.
    await new Promise((resolve) => setTimeout(resolve, 2000));
    expect(mockFetchAccountState).toHaveBeenCalledTimes(1);
  }, 10_000);
});

// Ticket 11, part 2 (review F8): the free plan is read from the billing status, the server's one rule, and FAILS CLOSED.
const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

describe("useFreePlanAccount (from the billing status)", () => {
  const billing = (freePlan?: { accountId: string | null } | null) => ({
    ok: true,
    json: async () => ({ billing: { access: {}, ...(freePlan === undefined ? {} : { freePlan }) } }),
  });
  const failed = { ok: false, json: async () => ({ error: "boom" }) };

  function setup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = renderHook(() => useFreePlanAccount(), { wrapper: wrapper(client) });
    return { client, ...view };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    apiFetch.mockReset();
  });

  it("is undefined while the billing status loads (no checkout, no classic panel yet)", async () => {
    apiFetch.mockReturnValue(new Promise(() => {}));
    const { result } = setup();

    expect(result.current).toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current).toBeUndefined();
  });

  it("is the free plan's account when the server says so", async () => {
    apiFetch.mockResolvedValue(billing({ accountId: "acc-free" }));
    const { result } = setup();

    await waitFor(() => expect(result.current).toEqual({ accountId: "acc-free" }));
  });

  it("keeps accountId null for a sign-up with no Equipe account yet (still the free plan)", async () => {
    apiFetch.mockResolvedValue(billing({ accountId: null }));
    const { result } = setup();

    await waitFor(() => expect(result.current).toEqual({ accountId: null }));
  });

  it("is null ONLY when the server said the workspace is not on the free plan (freePlan: null)", async () => {
    apiFetch.mockResolvedValue(billing(null));
    const { result } = setup();

    await waitFor(() => expect(result.current).toBeNull());
  });

  it("is undefined for a payload WITHOUT the field (unknown, not classic)", async () => {
    apiFetch.mockResolvedValue(billing(undefined));
    const { result } = setup();

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current).toBeUndefined();
  });

  it("is undefined on the FIRST failed read (any error: network, 500, 401): it never turns into classic", async () => {
    apiFetch.mockRejectedValue(new Error("network"));
    const { result } = setup();

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current).toBeUndefined();
  });

  it("is undefined on an error response too (a 5xx body)", async () => {
    apiFetch.mockResolvedValue(failed);
    const { result } = setup();

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current).toBeUndefined();
  });

  it("a free plan already known SURVIVES a failed refetch (the error does not reopen the checkout)", async () => {
    apiFetch.mockResolvedValueOnce(billing({ accountId: "acc-free" }));
    const { result, client } = setup();
    await waitFor(() => expect(result.current).toEqual({ accountId: "acc-free" }));

    apiFetch.mockRejectedValue(new Error("network"));
    await client.refetchQueries({ queryKey: ["billing", "status"] });

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    expect(client.getQueryState(["billing", "status"])?.status).toBe("error");
    expect(result.current).toEqual({ accountId: "acc-free" });
  });

  it("a classic answer already known does NOT survive a failed refetch: it goes back to unknown (fails closed, recovers with the next good read)", async () => {
    apiFetch.mockResolvedValueOnce(billing(null));
    const { result, client } = setup();
    await waitFor(() => expect(result.current).toBeNull());

    apiFetch.mockRejectedValue(new Error("network"));
    await client.refetchQueries({ queryKey: ["billing", "status"] });

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    expect(result.current).toBeUndefined();
    apiFetch.mockResolvedValue(billing(null));
    await client.refetchQueries({ queryKey: ["billing", "status"] });
    await waitFor(() => expect(result.current).toBeNull());
  });
});

describe("useEquipeAccounts: a brand's new account reaches the next screen (spec 2026-10-07 §3)", () => {
  const livraria = { id: "acc-livraria", clientProfileId: "b-livraria" } as never;
  const studio = { id: "acc-studio", clientProfileId: "b-studio" } as never;
  const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // One screen reads the list, the person goes elsewhere, and the next screen mounts on the same cache.
  async function twoScreens(queryClient: QueryClient) {
    const first = renderHook(() => useEquipeAccounts(), { wrapper: wrapper(queryClient) });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    first.unmount();
    const next = renderHook(() => useEquipeAccounts(), { wrapper: wrapper(queryClient) });
    await waitFor(() => expect(next.result.current.isFetching).toBe(false));
    return next.result.current.data?.accounts;
  }

  beforeEach(() => {
    mockFetchEquipeAccounts.mockReset();
    railBrand = undefined;
  });

  // An empty screen sends the person to `/`, which opens the brand's account; the cached list (kept for a minute) did not
  // have it, so the screen they came back to stayed empty with its actions off.
  it("reads the list again when it has no account of the rail's brand", async () => {
    railBrand = { id: "b-studio", name: "Studio Lume" };
    mockFetchEquipeAccounts.mockResolvedValueOnce({ accounts: [livraria] }).mockResolvedValueOnce({ accounts: [livraria, studio] });
    expect(await twoScreens(client())).toEqual([livraria, studio]);
    expect(mockFetchEquipeAccounts).toHaveBeenCalledTimes(2);
  });

  it("keeps the list for a minute once the rail's brand has its account", async () => {
    railBrand = { id: "b-livraria", name: "Livraria Norte" };
    mockFetchEquipeAccounts.mockResolvedValue({ accounts: [livraria] });
    await twoScreens(client());
    expect(mockFetchEquipeAccounts).toHaveBeenCalledTimes(1);
  });

  it("keeps the list for a minute outside the rail, as before", async () => {
    mockFetchEquipeAccounts.mockResolvedValue({ accounts: [livraria] });
    await twoScreens(client());
    expect(mockFetchEquipeAccounts).toHaveBeenCalledTimes(1);
  });
});

describe("defaultEquipeAccountId (spec 2026-10-07 §3)", () => {
  const accounts = [
    { id: "acc-a", clientProfileId: "b-a", pendingDecisions: 0 },
    { id: "acc-b", clientProfileId: "b-b", pendingDecisions: 2 },
  ] as never;

  it("keeps today's rule outside the rail: pending decisions first, else the first", () => {
    expect(defaultEquipeAccountId(accounts)).toBe("acc-b");
  });

  it("in the rail, is the active brand's own account, and null while it has none", () => {
    expect(defaultEquipeAccountId(accounts, { id: "b-a" })).toBe("acc-a");
    expect(defaultEquipeAccountId(accounts, { id: "b-new" })).toBeNull();
    expect(defaultEquipeAccountId(accounts, null)).toBeNull();
  });
});

describe("useEquipeAccountSelection: the rail's brand and the account in ?account= (spec 2026-10-07 §3)", () => {
  const accounts = [
    { id: "acc-a", clientProfileId: "b-a", pendingDecisions: 0 },
    { id: "acc-b", clientProfileId: "b-b", pendingDecisions: 2 },
  ] as never;

  // The billing status says whether the free plan pins the rail; unknown (never answered) unless a test seeds it.
  let client: QueryClient;
  const renderSelection = () =>
    renderHook(() => useEquipeAccountSelection("/ideas", accounts), { wrapper: wrapper(client) });

  beforeEach(() => {
    vi.clearAllMocks();
    railBrand = undefined;
    search = new URLSearchParams();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    apiFetch.mockReset();
    apiFetch.mockReturnValue(new Promise(() => {}));
  });

  it("outside the rail, never touches the brand and keeps the default account rule", () => {
    const { result } = renderSelection();
    expect(result.current.selected).toBe("acc-b");
    expect(switchBrand).not.toHaveBeenCalled();
  });

  it("in the rail, selects the active brand's account when ?account= says nothing", () => {
    railBrand = { id: "b-a", name: "A" };
    const { result } = renderSelection();
    expect(result.current.selected).toBe("acc-a");
    expect(switchBrand).not.toHaveBeenCalled();
  });

  it("in the rail, a link to the active brand's own account switches nothing", () => {
    railBrand = { id: "b-a", name: "A" };
    search = new URLSearchParams("account=acc-a");
    renderSelection();
    expect(switchBrand).not.toHaveBeenCalled();
  });

  it("in the rail, a link to another brand's account makes that brand the active one, on the same screen", () => {
    railBrand = { id: "b-a", name: "A" };
    search = new URLSearchParams("account=acc-b");
    const { result } = renderSelection();
    expect(result.current.selected).toBe("acc-b");
    expect(switchBrand).toHaveBeenCalledTimes(1);
    expect(switchBrand).toHaveBeenCalledWith("b-b", { stay: true });
  });

  it("switches once, not again after the provider re-renders the old brand (the server refused it)", () => {
    railBrand = { id: "b-a", name: "A" };
    search = new URLSearchParams("account=acc-b");
    const { rerender } = renderSelection();
    expect(switchBrand).toHaveBeenCalledTimes(1);

    // router.refresh() renders the layout again: a new brand object, still the old brand.
    railBrand = { id: "b-a", name: "A" };
    rerender();
    railBrand = { id: "b-a", name: "A" };
    rerender();

    expect(switchBrand).toHaveBeenCalledTimes(1);
  });

  it("does not switch again once the linked brand is the active one", () => {
    railBrand = { id: "b-a", name: "A" };
    search = new URLSearchParams("account=acc-b");
    const { rerender } = renderSelection();
    railBrand = { id: "b-b", name: "B" };
    rerender();
    expect(switchBrand).toHaveBeenCalledTimes(1);
  });

  it("a link that names yet another brand's account is switched to as well", () => {
    railBrand = { id: "b-c", name: "C" };
    search = new URLSearchParams("account=acc-b");
    const { rerender } = renderSelection();
    search = new URLSearchParams("account=acc-a");
    rerender();
    expect(switchBrand.mock.calls).toEqual([["b-b", { stay: true }], ["b-a", { stay: true }]]);
  });

  it("on the free plan, a link to another brand's account shows the rail brand's account and stamps it in the URL", () => {
    // The server pins a free workspace to its account's brand: switching would be refused, so it is not asked for.
    client.setQueryData(["billing", "status"], { access: {}, freePlan: { accountId: "acc-a" } });
    railBrand = { id: "b-a", name: "A" };
    search = new URLSearchParams("account=acc-b");
    const { result } = renderSelection();
    expect(result.current.selected).toBe("acc-a");
    expect(routerReplace).toHaveBeenCalledWith("/ideas?account=acc-a", { scroll: false });
    expect(switchBrand).not.toHaveBeenCalled();
  });

  it("a closed free account pins the rail as well", () => {
    client.setQueryData(["billing", "status"], { access: {}, freePlan: { accountId: null, closedAccountId: "acc-a" } });
    railBrand = { id: "b-a", name: "A" };
    search = new URLSearchParams("account=acc-b");
    const { result } = renderSelection();
    expect(result.current.selected).toBe("acc-a");
    expect(switchBrand).not.toHaveBeenCalled();
  });

  it("a workspace the server says is not on the free plan follows the link to another brand", () => {
    client.setQueryData(["billing", "status"], { access: {}, freePlan: null });
    railBrand = { id: "b-a", name: "A" };
    search = new URLSearchParams("account=acc-b");
    const { result } = renderSelection();
    expect(result.current.selected).toBe("acc-b");
    expect(switchBrand).toHaveBeenCalledWith("b-b", { stay: true });
  });

  it("in the rail with no brand yet, a link is not a reason to switch", () => {
    railBrand = null;
    search = new URLSearchParams("account=acc-b");
    renderSelection();
    expect(switchBrand).not.toHaveBeenCalled();
  });

  it("outside the rail, a link to another brand's account just selects it", () => {
    search = new URLSearchParams("account=acc-a");
    const { result } = renderSelection();
    expect(result.current.selected).toBe("acc-a");
    expect(switchBrand).not.toHaveBeenCalled();
  });
});
