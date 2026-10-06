import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEquipeAccountState, useFreePlanAccount } from "./use-equipe";
import type { AccountStateJson } from "./api";

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return { ...actual, fetchAccountState: vi.fn() };
});

import { fetchAccountState } from "./api";
const mockFetchAccountState = vi.mocked(fetchAccountState);

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
