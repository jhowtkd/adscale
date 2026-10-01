// The plan request shared by the plan card and the diagnosis card that failed for lack of credit (ticket 13, D-12).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { assistantThreadQueryKey } from "@/lib/hooks/use-assistant-threads";

const requestEquipeSupport = vi.fn();
vi.mock("@/lib/equipe/commands", () => ({ requestEquipeSupport: (...args: unknown[]) => requestEquipeSupport(...args) }));
import { usePlanRequest } from "./use-plan-request";

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
});
