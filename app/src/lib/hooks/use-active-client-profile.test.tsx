import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientProfile } from "./use-client-profiles";

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
});
