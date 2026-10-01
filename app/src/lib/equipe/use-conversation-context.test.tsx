import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let accounts: Array<{ id: string; clientProfileId: string; status?: string; pendingDecisions?: boolean }> | undefined;
let thread: { clientProfileId: string } | undefined;
let state: { status?: string; threads?: { primary: { assistantThreadId: string | null } | null; parallel: Array<{ id: string; assistantThreadId: string | null; topic: string | null }> } } | undefined;
const stateHook = vi.fn((id: string | null) => { void id; return { data: state }; });
vi.mock("@/lib/hooks/use-assistant-threads", () => ({ useAssistantThread: () => ({ data: thread ? { thread } : undefined }) }));
vi.mock("@/lib/equipe/use-equipe", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/equipe/use-equipe")>()),
  useEquipeAccounts: () => ({ data: accounts ? { accounts } : undefined }),
  useEquipeAccountState: (id: string | null) => stateHook(id),
}));

import { useConversationContext } from "./use-conversation-context";

const parallel = [
  { id: "t1", assistantThreadId: "thread-1", topic: "Promoção" },
  { id: "t2", assistantThreadId: null, topic: "Solta" },
];

describe("useConversationContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accounts = [
      { id: "acc-a", clientProfileId: "profile-a", status: "free" },
      { id: "acc-b", clientProfileId: "profile-b", status: "active", pendingDecisions: true },
    ];
    thread = { clientProfileId: "profile-a" };
    state = { status: "free", threads: { primary: { assistantThreadId: "thread-main" }, parallel } };
  });

  it("resolves the account of the thread's brand, not the default one", () => {
    const { result } = renderHook(() => useConversationContext("thread-main"));
    expect(result.current).toMatchObject({ accountId: "acc-a", clientProfileId: "profile-a", accountStatus: "free" });
    expect(stateHook).toHaveBeenCalledWith("acc-a");
  });

  it("stands in with the default account before the thread loads", () => {
    thread = undefined;
    const { result } = renderHook(() => useConversationContext("thread-main"));
    expect(result.current.accountId).toBe("acc-b");
  });

  it("belongs to no account when the thread's brand has none", () => {
    thread = { clientProfileId: "profile-z" };
    const { result } = renderHook(() => useConversationContext("thread-x"));
    expect(result.current.accountId).toBeNull();
    expect(result.current.clientProfileId).toBe("profile-z");
    expect(stateHook).toHaveBeenCalledWith(null);
  });

  it("is empty while the accounts load", () => {
    accounts = undefined;
    thread = undefined;
    state = undefined;
    const { result } = renderHook(() => useConversationContext("thread-main"));
    expect(result.current).toMatchObject({ accountId: null, clientProfileId: null, accountStatus: null, isPrimary: null, topic: null, parallel: [] });
  });

  it("knows the primary thread from a parallel one, and the parallel topic", () => {
    expect(renderHook(() => useConversationContext("thread-main")).result.current.isPrimary).toBe(true);
    const parallelResult = renderHook(() => useConversationContext("thread-1")).result.current;
    expect(parallelResult.isPrimary).toBe(false);
    expect(parallelResult.topic).toBe("Promoção");
    expect(parallelResult.parallel).toEqual(parallel);
  });

  it("does not know yet whether the thread is primary while the account state is loading or from an older server", () => {
    state = undefined;
    expect(renderHook(() => useConversationContext("thread-main")).result.current.isPrimary).toBeNull();
    state = { status: "free" };
    expect(renderHook(() => useConversationContext("thread-main")).result.current.isPrimary).toBeNull();
    state = { status: "free", threads: { primary: { assistantThreadId: "thread-main" }, parallel } };
    expect(renderHook(() => useConversationContext(null)).result.current.isPrimary).toBeNull();
  });

  it("takes the status from the account state, else from the account list", () => {
    state = undefined;
    expect(renderHook(() => useConversationContext("thread-main")).result.current.accountStatus).toBe("free");
    state = { status: "active", threads: { primary: null, parallel: [] } };
    expect(renderHook(() => useConversationContext("thread-main")).result.current.accountStatus).toBe("active");
  });
});
