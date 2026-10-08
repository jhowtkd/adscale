import { act, render, renderHook } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

import { useAppStore } from "@/lib/store";
import { ACTIVE_BRAND_COOKIE, type ActiveBrand } from "./active-brand";
import { ActiveBrandProvider, useActiveBrand, useSwitchActiveBrand } from "./active-brand-context";

const CAFE = { id: "b-cafe", name: "Café Aurora" };
const LIVRARIA = { id: "b-livraria", name: "Livraria Norte" };
const wrapper = (brand: typeof CAFE | null, client = new QueryClient()) => function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}><ActiveBrandProvider brand={brand}>{children}</ActiveBrandProvider></QueryClientProvider>;
};

// The switch hook, captured from inside the rail shell so a test can switch while the provider is mounted.
const probe: { switchTo: ReturnType<typeof useSwitchActiveBrand> } = { switchTo: () => undefined };
function SwitchProbe() {
  const switchBrand = useSwitchActiveBrand();
  useEffect(() => {
    probe.switchTo = switchBrand;
  });
  return null;
}
// One provider instance, rendered and then rerendered with another brand object. RTL's rerender re-applies the `wrapper`
// option, so these tests do not go through `wrapper` for the rerender: that would nest a second provider.
const shell = (brand: ActiveBrand, client: QueryClient) => (
  <QueryClientProvider client={client}>
    <ActiveBrandProvider brand={brand}><SwitchProbe /><div>conteúdo</div></ActiveBrandProvider>
  </QueryClientProvider>
);

describe("active brand context (spec 2026-10-07 §3)", () => {
  beforeEach(() => {
    push.mockClear();
    refresh.mockClear();
    window.history.replaceState(null, "", "/library");
    useAppStore.setState({ activeClientProfileId: null });
  });

  it("is undefined outside the rail shell, so the classic screens keep their own choice", () => {
    expect(renderHook(() => useActiveBrand()).result.current).toBeUndefined();
  });

  it("gives the rail's brand and puts the composer's store on it", () => {
    const { result } = renderHook(() => useActiveBrand(), { wrapper: wrapper(CAFE) });
    expect(result.current).toEqual(CAFE);
    expect(useAppStore.getState().activeClientProfileId).toBe("b-cafe");
  });

  it("switching writes the cookie, moves the store and opens the brand's conversation", () => {
    const { result } = renderHook(() => useSwitchActiveBrand(), { wrapper: wrapper(CAFE) });
    act(() => result.current("b-livraria"));
    expect(document.cookie).toContain(`${ACTIVE_BRAND_COOKIE}=b-livraria`);
    expect(useAppStore.getState().activeClientProfileId).toBe("b-livraria");
    expect(push).toHaveBeenCalledWith("/");
    expect(refresh).toHaveBeenCalledTimes(1);
    // The refresh follows the push: the shared layout is rendered again with the new cookie.
    expect(push.mock.invocationCallOrder[0]).toBeLessThan(refresh.mock.invocationCallOrder[0]);
  });

  it("on the conversation itself, renders it again for the other brand", () => {
    window.history.replaceState(null, "", "/");
    const { result } = renderHook(() => useSwitchActiveBrand(), { wrapper: wrapper(CAFE) });
    act(() => result.current("b-livraria"));
    expect(push).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("can switch without leaving the screen (a link to another brand's account)", () => {
    const { result } = renderHook(() => useSwitchActiveBrand(), { wrapper: wrapper(CAFE) });
    act(() => result.current("b-studio", { stay: true }));
    expect(push).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("reads the account list again once the rail shows another brand: the server may have just opened its account", () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const view = render(shell(CAFE, client));
    expect(invalidate).not.toHaveBeenCalled();
    view.rerender(shell(LIVRARIA, client));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["equipe"] });
    expect(view.getByText("conteúdo")).toBeInTheDocument();
  });

  it("keeps a switch while the rail still renders the same brand object", () => {
    const client = new QueryClient();
    const view = render(shell(CAFE, client));
    act(() => probe.switchTo("b-livraria"));
    expect(useAppStore.getState().activeClientProfileId).toBe("b-livraria");
    view.rerender(shell(CAFE, client));
    expect(useAppStore.getState().activeClientProfileId).toBe("b-livraria");
  });

  it("goes back to the brand the server renders again when it refused the switch", () => {
    const client = new QueryClient();
    const view = render(shell(CAFE, client));
    act(() => probe.switchTo("b-livraria"));
    expect(useAppStore.getState().activeClientProfileId).toBe("b-livraria");
    // The server answered with the old brand, as a new object: the store follows it again.
    view.rerender(shell({ ...CAFE }, client));
    expect(useAppStore.getState().activeClientProfileId).toBe("b-cafe");
  });
});
