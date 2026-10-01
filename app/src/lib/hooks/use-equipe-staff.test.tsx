// The shell's staff check (ticket 13, D-11): it asks for the access answer only, and reads it from a 200.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const apiFetch = vi.fn();
vi.mock("@/lib/api-client", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
import { useEquipeStaffAccess } from "./use-equipe-staff";

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);
const reply = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("useEquipeStaffAccess", () => {
  beforeEach(() => apiFetch.mockReset());

  it("asks for the access answer only (?access=1), never for the whole pipeline", async () => {
    apiFetch.mockResolvedValue(reply(200, { allowed: false }));
    renderHook(() => useEquipeStaffAccess(), { wrapper });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    expect(apiFetch).toHaveBeenCalledWith("/api/equipe/staff/accounts?access=1");
  });

  it.each([[{ allowed: true }, true], [{ allowed: false }, false], [{}, false], [{ allowed: "yes" }, false]])("reads %j as allowed=%s", async (body, allowed) => {
    apiFetch.mockResolvedValue(reply(200, body));
    const { result } = renderHook(() => useEquipeStaffAccess(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual({ allowed }));
  });

  it("still reads a 401/403 from an older server as not staff", async () => {
    for (const status of [401, 403]) {
      apiFetch.mockResolvedValue(reply(status));
      const { result } = renderHook(() => useEquipeStaffAccess(), { wrapper });
      await waitFor(() => expect(result.current.data).toEqual({ allowed: false }));
    }
  });

  it("any other failure is an error, not a quiet 'no'", async () => {
    apiFetch.mockResolvedValue(reply(500));
    const { result } = renderHook(() => useEquipeStaffAccess(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
