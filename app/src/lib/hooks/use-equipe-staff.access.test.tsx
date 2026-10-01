// useEquipeStaffAccess against what the probe may answer (ticket 13, D-11): only a 200 whose body says allowed === true is access; anything else is "no", a
// failure is an error and never a quiet "yes", and one mount asks once. usePlatformOwnerAccess is pinned for the same answers it must never read as a yes.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const apiFetch = vi.fn();
vi.mock("@/lib/api-client", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
import { useEquipeStaffAccess } from "./use-equipe-staff";
import { usePlatformOwnerAccess } from "./use-platform-owner";

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrapperOf = (qc: QueryClient) => ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
const raw = (status: number, text: string) => new Response(text, { status, headers: { "content-type": "application/json" } });
// Braces matter: a beforeEach that returns the mock would be run by vitest as its teardown.
beforeEach(() => { apiFetch.mockReset(); });

describe("useEquipeStaffAccess: what the 200 body may be", () => {
  const BODIES: Array<[string, string, boolean]> = [
    ["{allowed:true}", JSON.stringify({ allowed: true }), true], ["{allowed:false}", JSON.stringify({ allowed: false }), false],  ["an array", "[]", false],
    ["an array of true", "[true]", false], ["a string", "\"true\"", false], ["a number", "1", false], ["a boolean", "true", false], ["{}", "{}", false],
    ["{allowed:\"true\"}", JSON.stringify({ allowed: "true" }), false], ["{allowed:1}", JSON.stringify({ allowed: 1 }), false], ["{allowed:null}", JSON.stringify({ allowed: null }), false],
    ["{allowed:[true]}", JSON.stringify({ allowed: [true] }), false], ["{allowed:{}}", JSON.stringify({ allowed: {} }), false], ["{ALLOWED:true}", JSON.stringify({ ALLOWED: true }), false],
    ["{data:{allowed:true}}", JSON.stringify({ data: { allowed: true } }), false],
  ];
  it.each(BODIES)("a 200 with %s reads allowed=%s", async (_name, body, allowed) => {
    apiFetch.mockResolvedValue(raw(200, body));
    const { result } = renderHook(() => useEquipeStaffAccess(), { wrapper: wrapperOf(client()) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ allowed });
  });

  // OBSERVATION (ticket 13 test child): a 200 with the JSON body `null` makes `.allowed` throw inside the query function, so the hook ends in the error state
  // instead of {allowed:false}. The outcome is still "not staff" for every consumer (`data?.allowed !== true`), so it is pinned as that, not as {allowed:false}.
  it("a 200 with a null body is never allowed (it ends as a query error)", async () => {
    apiFetch.mockResolvedValue(raw(200, "null"));
    const { result } = renderHook(() => useEquipeStaffAccess(), { wrapper: wrapperOf(client()) });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data?.allowed).not.toBe(true);
  });

  it("a 200 whose body is not JSON is an error, never allowed", async () => {
    apiFetch.mockResolvedValue(raw(200, "<html>proxy</html>"));
    const { result } = renderHook(() => useEquipeStaffAccess(), { wrapper: wrapperOf(client()) });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data?.allowed).not.toBe(true);
  });

  for (const message of ["network down", "Failed to fetch", "The operation timed out"]) it(`a rejected request (${message}) is an error, never allowed:true`, async () => {
    apiFetch.mockImplementation(async () => { throw new Error(message); });
    const { result } = renderHook(() => useEquipeStaffAccess(), { wrapper: wrapperOf(client()) });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it.each([[500], [502], [503], [404], [429]])("a %i is an error, not a quiet no and never a yes", async (status) => {
    apiFetch.mockResolvedValue(raw(status, JSON.stringify({ allowed: true })));
    const { result } = renderHook(() => useEquipeStaffAccess(), { wrapper: wrapperOf(client()) });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it.each([[401], [403]])("an older server's %i reads as not staff even with an allowing body", async (status) => {
    apiFetch.mockResolvedValue(raw(status, JSON.stringify({ allowed: true })));
    const { result } = renderHook(() => useEquipeStaffAccess(), { wrapper: wrapperOf(client()) });
    await waitFor(() => expect(result.current.data).toEqual({ allowed: false }));
  });
});

describe("one probe per mount", () => {
  it("asks exactly once, and a second mount on the same cache reads the cached answer without asking again", async () => {
    apiFetch.mockResolvedValue(raw(200, JSON.stringify({ allowed: false })));
    const qc = client();
    const first = renderHook(() => useEquipeStaffAccess(), { wrapper: wrapperOf(qc) });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    const second = renderHook(() => useEquipeStaffAccess(), { wrapper: wrapperOf(qc) });
    expect(second.result.current.data).toEqual({ allowed: false });
    const third = renderHook(() => useEquipeStaffAccess(), { wrapper: wrapperOf(qc) });
    await waitFor(() => expect(third.result.current.isSuccess).toBe(true));
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith("/api/equipe/staff/accounts?access=1");
  });

  it("two components mounted together on one cache share one request", async () => {
    apiFetch.mockResolvedValue(raw(200, JSON.stringify({ allowed: true })));
    const qc = client();
    const both = renderHook(() => [useEquipeStaffAccess(), useEquipeStaffAccess()] as const, { wrapper: wrapperOf(qc) });
    await waitFor(() => expect(both.result.current[0].isSuccess && both.result.current[1].isSuccess).toBe(true));
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("a re-render and a window refocus do not ask again", async () => {
    apiFetch.mockResolvedValue(raw(200, JSON.stringify({ allowed: false })));
    const qc = client();
    const hook = renderHook(() => useEquipeStaffAccess(), { wrapper: wrapperOf(qc) });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    hook.rerender();
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });
});

describe("usePlatformOwnerAccess asks the inbox probe, and a 401/403 is a no", () => {
  it("calls the probe URL once", async () => {
    apiFetch.mockResolvedValue(raw(200, JSON.stringify({ allowed: false })));
    const { result } = renderHook(() => usePlatformOwnerAccess(), { wrapper: wrapperOf(client()) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith("/api/feedback/reports?access=1");
    expect(result.current.data).toEqual({ allowed: false });
  });
  it.each([[401], [403]])("a %i is not allowed", async (status) => {
    apiFetch.mockResolvedValue(raw(status, "{}"));
    const { result } = renderHook(() => usePlatformOwnerAccess(), { wrapper: wrapperOf(client()) });
    await waitFor(() => expect(result.current.data).toEqual({ allowed: false }));
  });
  it("a failure is an error", async () => {
    apiFetch.mockResolvedValue(raw(500, "{}"));
    const { result } = renderHook(() => usePlatformOwnerAccess(), { wrapper: wrapperOf(client()) });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
