import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientProfile } from "./use-client-profiles";

// The rail's brand and the switch are the provider's; undefined is the classic shell, which has neither.
let railBrand: { id: string; name: string } | null | undefined;
const switchBrand = vi.fn();
vi.mock("@/lib/brands/active-brand-context", () => ({
  useActiveBrand: () => railBrand,
  useSwitchActiveBrand: () => switchBrand,
}));

vi.mock("./use-client-profiles", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./use-client-profiles")>();
  return { ...actual, useClientProfiles: vi.fn() };
});

let useAppStore: typeof import("@/lib/store").useAppStore;
let useActiveClientProfile: typeof import("./use-active-client-profile").useActiveClientProfile;
let mockUseClientProfiles: ReturnType<typeof vi.mocked<typeof import("./use-client-profiles").useClientProfiles>>;

function profile(id: string): ClientProfile {
  return {
    id,
    workspaceId: "workspace-1",
    name: `Brand ${id}`,
    description: null,
    visualNotes: null,
    toneNotes: null,
    constraints: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function mockProfiles(profiles: ClientProfile[]) {
  mockUseClientProfiles.mockReturnValue({
    data: profiles,
    isLoading: false,
    isSuccess: true,
  } as ReturnType<typeof useClientProfiles>);
}

describe("useActiveClientProfile", () => {
  beforeAll(async () => {
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    });
    ({ useAppStore } = await import("@/lib/store"));
    ({ useActiveClientProfile } = await import("./use-active-client-profile"));
    mockUseClientProfiles = vi.mocked(
      (await import("./use-client-profiles")).useClientProfiles
    );
  });

  beforeEach(() => {
    vi.clearAllMocks();
    railBrand = undefined;
    act(() => useAppStore.setState({ activeClientProfileId: null }));
  });

  it("auto-selects the only available profile", async () => {
    mockProfiles([profile("one")]);

    const { result } = renderHook(() => useActiveClientProfile());

    await waitFor(() => expect(result.current.activeClientProfileId).toBe("one"));
    expect(result.current.activeProfile?.id).toBe("one");
    expect(result.current.requiresSelection).toBe(false);
  });

  it("restores a persisted profile when it still belongs to the workspace", () => {
    act(() => useAppStore.setState({ activeClientProfileId: "two" }));
    mockProfiles([profile("one"), profile("two")]);

    const { result } = renderHook(() => useActiveClientProfile());

    expect(result.current.activeProfile?.id).toBe("two");
    expect(result.current.requiresSelection).toBe(false);
  });

  it("clears a persisted profile that no longer exists", async () => {
    act(() => useAppStore.setState({ activeClientProfileId: "missing" }));
    mockProfiles([profile("one"), profile("two")]);

    const { result } = renderHook(() => useActiveClientProfile());

    await waitFor(() => expect(result.current.activeClientProfileId).toBeNull());
    expect(useAppStore.getState().activeClientProfileId).toBeNull();
    expect(result.current.activeProfile).toBeNull();
    expect(result.current.requiresSelection).toBe(true);
  });

  it("requires one explicit choice when multiple profiles have no valid history", () => {
    mockProfiles([profile("one"), profile("two")]);

    const { result } = renderHook(() => useActiveClientProfile());

    expect(result.current.activeClientProfileId).toBeNull();
    expect(result.current.activeProfile).toBeNull();
    expect(result.current.requiresSelection).toBe(true);
  });

  it("preserves the persisted profile when loading profiles fails", () => {
    act(() => useAppStore.setState({ activeClientProfileId: "one" }));
    mockUseClientProfiles.mockReturnValue({
      data: undefined,
      isLoading: false,
      isSuccess: false,
      isError: true,
      error: new Error("temporary failure"),
    } as ReturnType<typeof useClientProfiles>);

    renderHook(() => useActiveClientProfile());

    expect(useAppStore.getState().activeClientProfileId).toBe("one");
  });

  it("outside the rail, selecting a profile writes the store and never switches a brand", () => {
    mockProfiles([profile("one"), profile("two")]);

    const { result } = renderHook(() => useActiveClientProfile());
    act(() => result.current.selectProfile("two"));

    expect(useAppStore.getState().activeClientProfileId).toBe("two");
    expect(result.current.activeClientProfileId).toBe("two");
    expect(switchBrand).not.toHaveBeenCalled();
  });

  describe("in the rail shell", () => {
    it("reports the rail's brand even when the store says another", () => {
      railBrand = { id: "two", name: "Brand two" };
      act(() => useAppStore.setState({ activeClientProfileId: "one" }));
      mockProfiles([profile("one"), profile("two")]);

      const { result } = renderHook(() => useActiveClientProfile());

      expect(result.current.activeClientProfileId).toBe("two");
      expect(result.current.activeProfile?.id).toBe("two");
      expect(result.current.requiresSelection).toBe(false);
    });

    it("leaves the store to the provider, so a switch is not pinned back to the stale brand", () => {
      railBrand = { id: "one", name: "Brand one" };
      act(() => useAppStore.setState({ activeClientProfileId: "two" }));
      mockProfiles([profile("one"), profile("two")]);

      renderHook(() => useActiveClientProfile());

      expect(useAppStore.getState().activeClientProfileId).toBe("two");
    });

    it("has no active profile in a workspace without a brand yet, and no selection to ask for", () => {
      railBrand = null;
      mockProfiles([]);

      const { result } = renderHook(() => useActiveClientProfile());

      expect(result.current.activeClientProfileId).toBeNull();
      expect(result.current.activeProfile).toBeNull();
      expect(result.current.requiresSelection).toBe(false);
    });

    it("selecting another profile switches the rail's brand, staying on the screen, once", () => {
      railBrand = { id: "one", name: "Brand one" };
      mockProfiles([profile("one"), profile("two")]);

      const { result } = renderHook(() => useActiveClientProfile());
      act(() => result.current.selectProfile("two"));

      expect(switchBrand).toHaveBeenCalledTimes(1);
      expect(switchBrand).toHaveBeenCalledWith("two", { stay: true });
      // The switch writes the store itself; the hook does not write it a second time.
      expect(useAppStore.getState().activeClientProfileId).toBeNull();
    });

    it("selecting the rail's own brand switches nothing", () => {
      railBrand = { id: "one", name: "Brand one" };
      mockProfiles([profile("one"), profile("two")]);

      const { result } = renderHook(() => useActiveClientProfile());
      act(() => result.current.selectProfile("one"));

      expect(switchBrand).not.toHaveBeenCalled();
    });

    it("does not switch again to a brand it already asked for while the server keeps the old brand", () => {
      railBrand = { id: "one", name: "Brand one" };
      mockProfiles([profile("one"), profile("two")]);

      const { result, rerender } = renderHook(() => useActiveClientProfile());
      act(() => result.current.selectProfile("two"));
      // A caller that selects in an effect asks again after every render; the free plan's server keeps brand one.
      rerender();
      act(() => result.current.selectProfile("two"));
      act(() => result.current.selectProfile("two"));

      expect(switchBrand).toHaveBeenCalledTimes(1);
    });

    it("asks again once the rail's brand has changed", () => {
      railBrand = { id: "one", name: "Brand one" };
      mockProfiles([profile("one"), profile("two"), profile("three")]);

      const { result, rerender } = renderHook(() => useActiveClientProfile());
      act(() => result.current.selectProfile("two"));
      railBrand = { id: "two", name: "Brand two" };
      rerender();
      expect(result.current.activeClientProfileId).toBe("two");
      act(() => result.current.selectProfile("one"));
      railBrand = { id: "one", name: "Brand one" };
      rerender();
      act(() => result.current.selectProfile("two"));

      expect(switchBrand.mock.calls).toEqual([
        ["two", { stay: true }],
        ["one", { stay: true }],
        ["two", { stay: true }],
      ]);
    });

    it("keeps selectProfile stable while the rail's brand does not change, so effects that depend on it do not rerun", () => {
      railBrand = { id: "one", name: "Brand one" };
      mockProfiles([profile("one"), profile("two")]);

      const { result, rerender } = renderHook(() => useActiveClientProfile());
      const first = result.current.selectProfile;
      rerender();

      expect(result.current.selectProfile).toBe(first);
    });
  });
});
