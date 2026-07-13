import { describe, expect, it } from "vitest";
import { resolveVisibleWorkspaceState } from "./use-workspace-navigation";

describe("resolveVisibleWorkspaceState", () => {
  it("promotes setup to trabalho when derivations exist", () => {
    expect(
      resolveVisibleWorkspaceState("setup", {
        isLoading: false,
        isNew: false,
        derivationCount: 2,
      })
    ).toBe("trabalho");
  });

  it("keeps setup while loading or new", () => {
    expect(
      resolveVisibleWorkspaceState("setup", {
        isLoading: true,
        isNew: false,
        derivationCount: 2,
      })
    ).toBe("setup");
    expect(
      resolveVisibleWorkspaceState("setup", {
        isLoading: false,
        isNew: true,
        derivationCount: 2,
      })
    ).toBe("setup");
  });
});
