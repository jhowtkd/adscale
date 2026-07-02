import { describe, expect, it } from "vitest";
import type { WorkspaceState } from "./use-campaign-workspace";

describe("WorkspaceState collapse", () => {
  it("only has setup and trabalho states", () => {
    // Type-level check: both values must be assignable to WorkspaceState.
    const setup: WorkspaceState = "setup";
    const trabalho: WorkspaceState = "trabalho";
    const states: WorkspaceState[] = [setup, trabalho];

    expect(states).toContain("setup");
    expect(states).toContain("trabalho");
    expect(states).toHaveLength(2);
  });
});
