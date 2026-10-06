// The plan request shared by the plan card and the diagnosis card that failed for lack of credit (ticket 13, D-12).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { assistantThreadQueryKey } from "@/lib/hooks/use-assistant-threads";

const requestEquipeSupport = vi.fn();
vi.mock("@/lib/equipe/commands", () => ({ requestEquipeSupport: (...args: unknown[]) => requestEquipeSupport(...args) }));
import { PLAN_PERSON_NOTE, usePlanRequest } from "./use-plan-request";

function setup(threadId?: string | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { invalidate, ...renderHook(() => usePlanRequest("acc-1", threadId), { wrapper }) };
}

describe("usePlanRequest", () => {
  beforeEach(() => { requestEquipeSupport.mockReset(); });

  it("asks for the PLAN, once, and refreshes the thread", async () => {
    requestEquipeSupport.mockResolvedValue({});
    const { result, invalidate } = setup("thread-1");
    await act(async () => { await result.current.request(); });
    expect(requestEquipeSupport).toHaveBeenCalledTimes(1);
    expect(requestEquipeSupport).toHaveBeenCalledWith("acc-1", { purpose: "plan" });
    expect(result.current).toMatchObject({ requested: true, pending: false, error: false });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: assistantThreadQueryKey("thread-1") });
  });

  it("two calls at the same instant send ONE request", async () => {
    let finish: (value: unknown) => void = () => {};
    requestEquipeSupport.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const { result } = setup("thread-1");
    await act(async () => {
      const first = result.current.request();
      const second = result.current.request();
      finish({});
      await Promise.all([first, second]);
    });
    expect(requestEquipeSupport).toHaveBeenCalledTimes(1);
  });

  it("after the request went through, asking again sends nothing", async () => {
    requestEquipeSupport.mockResolvedValue({});
    const { result } = setup("thread-1");
    await act(async () => { await result.current.request(); });
    await act(async () => { await result.current.request(); });
    expect(requestEquipeSupport).toHaveBeenCalledTimes(1);
  });

  it("a failure shows as an error, is not 'requested', and the next call tries again", async () => {
    requestEquipeSupport.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce({});
    const { result } = setup("thread-1");
    await act(async () => { await result.current.request(); });
    expect(result.current).toMatchObject({ requested: false, pending: false, error: true });
    await act(async () => { await result.current.request(); });
    expect(requestEquipeSupport).toHaveBeenCalledTimes(2);
    expect(result.current).toMatchObject({ requested: true, error: false });
  });

  it("without a thread there is nothing to refresh, and the request still goes through", async () => {
    requestEquipeSupport.mockResolvedValue({});
    const { result, invalidate } = setup(null);
    await act(async () => { await result.current.request(); });
    expect(result.current.requested).toBe(true);
    expect(invalidate).not.toHaveBeenCalled();
  });

  // Two cards of the same conversation ask the same thing: when one asked, the other shows it (the server joins the requests anyway).
  describe("two cards of the same account", () => {
    function pair(accountA = "acc-1", accountB = "acc-1") {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
      return renderHook(() => ({ a: usePlanRequest(accountA, "thread-1"), b: usePlanRequest(accountB, "thread-1") }), { wrapper });
    }

    it("the second one knows the first one asked, and sends nothing itself", async () => {
      requestEquipeSupport.mockResolvedValue({});
      const { result } = pair();
      expect(result.current.b.requested).toBe(false);
      await act(async () => { await result.current.a.request(); });
      expect(result.current.a.requested).toBe(true);
      expect(result.current.b.requested).toBe(true);
      await act(async () => { await result.current.b.request(); });
      expect(requestEquipeSupport).toHaveBeenCalledTimes(1);
    });

    it("a failed request tells nobody that it was sent", async () => {
      requestEquipeSupport.mockRejectedValue(new Error("network"));
      const { result } = pair();
      await act(async () => { await result.current.a.request(); });
      expect(result.current.a.error).toBe(true);
      expect(result.current.b.requested).toBe(false);
      expect(result.current.b.error).toBe(false);
    });

    it("another account's request is not this account's", async () => {
      requestEquipeSupport.mockResolvedValue({});
      const { result } = pair("acc-1", "acc-2");
      await act(async () => { await result.current.a.request(); });
      expect(result.current.a.requested).toBe(true);
      expect(result.current.b.requested).toBe(false);
    });
  });

  // PR 626 review, F7: before the plan can be asked, the same button asks a person; that flag is not the plan card's.
  describe("asPerson", () => {
    function personSetup(threadId?: string | null) {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const invalidate = vi.spyOn(client, "invalidateQueries");
      const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
      return { invalidate, ...renderHook(() => ({
        person: usePlanRequest("acc-1", threadId ?? null, { asPerson: true }),
        plan: usePlanRequest("acc-1", threadId ?? null),
      }), { wrapper }) };
    }

    it("asks for a person with the plan note, without purpose, once", async () => {
      requestEquipeSupport.mockResolvedValue({});
      const { result } = personSetup();
      await act(async () => { await result.current.person.request(); });
      await act(async () => { await result.current.person.request(); });
      expect(requestEquipeSupport).toHaveBeenCalledTimes(1);
      expect(requestEquipeSupport).toHaveBeenCalledWith("acc-1", { note: PLAN_PERSON_NOTE });
      expect(requestEquipeSupport.mock.calls[0][1]).not.toHaveProperty("purpose");
      expect(result.current.person).toMatchObject({ requested: true, requestedHere: true, pending: false, error: false });
    });

    it("the person request does NOT mark the plan card as requested, and the plan card still asks the plan", async () => {
      requestEquipeSupport.mockResolvedValue({});
      const { result } = personSetup();
      await act(async () => { await result.current.person.request(); });
      expect(result.current.plan.requested).toBe(false);
      await act(async () => { await result.current.plan.request(); });
      expect(requestEquipeSupport).toHaveBeenCalledTimes(2);
      expect(requestEquipeSupport).toHaveBeenLastCalledWith("acc-1", { purpose: "plan" });
    });

    it("and the plan request does NOT mark the person request as requested (vice versa)", async () => {
      requestEquipeSupport.mockResolvedValue({});
      const { result } = personSetup();
      await act(async () => { await result.current.plan.request(); });
      expect(result.current.plan.requested).toBe(true);
      expect(result.current.person.requested).toBe(false);
      await act(async () => { await result.current.person.request(); });
      expect(requestEquipeSupport).toHaveBeenCalledTimes(2);
      expect(requestEquipeSupport).toHaveBeenLastCalledWith("acc-1", { note: PLAN_PERSON_NOTE });
    });

    it("a failure shows as an error, is not requested, and the next call tries again with the same note", async () => {
      requestEquipeSupport.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce({});
      const { result } = personSetup();
      await act(async () => { await result.current.person.request(); });
      expect(result.current.person).toMatchObject({ requested: false, pending: false, error: true });
      expect(result.current.plan.requested).toBe(false);
      await act(async () => { await result.current.person.request(); });
      expect(requestEquipeSupport).toHaveBeenNthCalledWith(2, "acc-1", { note: PLAN_PERSON_NOTE });
      expect(result.current.person).toMatchObject({ requested: true, error: false });
    });

    it("two calls at the same instant send ONE person request", async () => {
      let finish: (value: unknown) => void = () => {};
      requestEquipeSupport.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
      const { result } = personSetup();
      await act(async () => {
        const first = result.current.person.request();
        const second = result.current.person.request();
        finish({});
        await Promise.all([first, second]);
      });
      expect(requestEquipeSupport).toHaveBeenCalledTimes(1);
    });

    it("another account's person request is not this account's", async () => {
      requestEquipeSupport.mockResolvedValue({});
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
      const { result } = renderHook(() => ({ a: usePlanRequest("acc-1", null, { asPerson: true }), b: usePlanRequest("acc-2", null, { asPerson: true }) }), { wrapper });
      await act(async () => { await result.current.a.request(); });
      expect(result.current.b.requested).toBe(false);
    });
  });
});
