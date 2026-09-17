import { describe, expect, it } from "vitest";
import {
  offeredStudioFormats,
  THREE_FOUR_CREATION_PROTOCOLS,
  threeFourCreationBlock,
  threeFourCreationOffered,
} from "./three-four-capability";

describe("3:4 creation capability (ICE-04B)", () => {
  it("announces only the validated protocols, never universal coverage", () => {
    expect([...THREE_FOUR_CREATION_PROTOCOLS]).toEqual(["single", "format_adaptation"]);
  });

  it("offers 3:4 only with the switch on and a validated protocol", () => {
    expect(threeFourCreationOffered({ creationSwitch: "true", intent: "single" })).toBe(true);
    expect(threeFourCreationOffered({ creationSwitch: "true", intent: "format_adaptation" })).toBe(true);
    for (const intent of ["variations", "restyle", "social_post", "carousel"] as const) {
      expect(threeFourCreationOffered({ creationSwitch: "true", intent })).toBe(false);
    }
    for (const creationSwitch of [undefined, "false", ""] as const) {
      expect(threeFourCreationOffered({ creationSwitch, intent: "single" })).toBe(false);
    }
  });

  it("blocks with distinct codes for disabled creation versus unvalidated protocol", () => {
    expect(
      threeFourCreationBlock({ format: "3:4", targetFormats: [], intent: "single", creationSwitch: "false" }),
    ).toEqual({ code: "format_creation_disabled", format: "3:4" });
    expect(
      threeFourCreationBlock({ format: "3:4", targetFormats: [], intent: "variations", creationSwitch: "true" }),
    ).toEqual({ code: "format_protocol_unsupported", format: "3:4" });
    // Adaptation targets are new outputs: the first 3:4 target blocks the same way.
    expect(
      threeFourCreationBlock({ format: "1:1", targetFormats: ["9:16", "3:4"], intent: "restyle", creationSwitch: "true" }),
    ).toEqual({ code: "format_protocol_unsupported", format: "3:4" });
  });

  it("never blocks the previous formats, whatever the switch or protocol", () => {
    for (const format of ["1:1", "4:5", "9:16"] as const) {
      expect(
        threeFourCreationBlock({ format, targetFormats: ["1:1", "4:5", "9:16"], intent: "carousel", creationSwitch: "false" }),
      ).toBeNull();
    }
    expect(
      threeFourCreationBlock({ format: "3:4", targetFormats: [], intent: "single", creationSwitch: "true" }),
    ).toBeNull();
  });

  it("derives the offered studio list from the same capability", () => {
    expect(offeredStudioFormats({ creationSwitch: "true", intent: "single" })).toEqual([
      "1:1",
      "4:5",
      "9:16",
      "3:4",
    ]);
    expect(offeredStudioFormats({ creationSwitch: "true", intent: "variations" })).toEqual([
      "1:1",
      "4:5",
      "9:16",
    ]);
    expect(offeredStudioFormats({ creationSwitch: "false", intent: "single" })).toEqual([
      "1:1",
      "4:5",
      "9:16",
    ]);
  });
});
