import { describe, expect, it } from "vitest";
import { parseRecoveryArgs } from "./run-selection-effects-recovery";

describe("selection-effects recovery CLI (ICE-03B)", () => {
  it("always boots the success topology and passes other flags through", () => {
    const args = parseRecoveryArgs(["--build", "--web-port", "3101"]);
    expect(args.scenario).toBe("success");
    expect(args.build).toBe(true);
    expect(args.webPort).toBe(3101);
  });

  it("rejects --scenario: recovery needs completed outputs", () => {
    expect(() => parseRecoveryArgs(["--scenario", "no-worker"])).toThrow(/--scenario/);
  });
});
