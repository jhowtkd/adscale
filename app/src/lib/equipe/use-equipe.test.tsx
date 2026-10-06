import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEquipeAccountState, useFreePlanAccount } from "./use-equipe";
import type { AccountStateJson } from "./api";

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return { ...actual, fetchAccountState: vi.fn(), fetchEquipeAccounts: vi.fn() };
});

import { EquipeDisabledError, fetchAccountState, fetchEquipeAccounts } from "./api";
const mockFetchAccountState = vi.mocked(fetchAccountState);
const mockFetchEquipeAccounts = vi.mocked(fetchEquipeAccounts);

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

// Ticket 11, part 2: the campaign page waits for this answer before it mounts (or replaces) the assistant panel.
describe("useFreePlanAccount", () => {
  const accountsOf = (...statuses: string[]) =>
    ({ accounts: statuses.map((status, index) => ({ id: `acc-${index + 1}`, status })) }) as unknown as Awaited<ReturnType<typeof fetchEquipeAccounts>>;

  function setup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return renderHook(() => useFreePlanAccount(), { wrapper: wrapper(client) });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is undefined while the accounts load (the page shows neither the panel nor the request)", async () => {
    mockFetchEquipeAccounts.mockReturnValue(new Promise(() => {}));
    const { result } = setup();

    expect(result.current).toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current).toBeUndefined();
  });

  it("is the entry account's id when it is free", async () => {
    mockFetchEquipeAccounts.mockResolvedValue(accountsOf("free"));
    const { result } = setup();

    await waitFor(() => expect(result.current).toEqual({ accountId: "acc-1" }));
  });

  it("is null when the entry account is paid, even if a later account is free", async () => {
    mockFetchEquipeAccounts.mockResolvedValue(accountsOf("active", "free"));
    const { result } = setup();

    await waitFor(() => expect(mockFetchEquipeAccounts).toHaveBeenCalled());
    await waitFor(() => expect(result.current).toBeNull());
  });

  it("is the entry (first) account that decides, not any free one: free first, paid second is free", async () => {
    mockFetchEquipeAccounts.mockResolvedValue(accountsOf("free", "active"));
    const { result } = setup();

    await waitFor(() => expect(result.current).toEqual({ accountId: "acc-1" }));
  });

  it.each(["deploying", "active", "suspended", "closed"])("is null for an entry account on %s", async (status) => {
    mockFetchEquipeAccounts.mockResolvedValue(accountsOf(status));
    const { result } = setup();

    await waitFor(() => expect(result.current).toBeNull());
  });

  it("is null with no accounts", async () => {
    mockFetchEquipeAccounts.mockResolvedValue(accountsOf());
    const { result } = setup();

    await waitFor(() => expect(result.current).toBeNull());
  });

  it("is null for a classic workspace (the API answers 404: pilot off)", async () => {
    mockFetchEquipeAccounts.mockRejectedValue(new EquipeDisabledError());
    const { result } = setup();

    await waitFor(() => expect(result.current).toBeNull());
  });

  it("is null when the read fails (the server still enforces the free plan)", async () => {
    mockFetchEquipeAccounts.mockRejectedValue(new Error("network"));
    const { result } = setup();

    await waitFor(() => expect(result.current).toBeNull());
  });
});
