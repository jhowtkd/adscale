import { describe, expect, it } from "vitest";
import { ALLOWED_PROPERTY_KEYS, BETA_EVENT_KEYS, STUDIO_BETA_EVENT_KEYS, type AllowedPropertyKey } from "./types";

describe("beta analytics types", () => {
  it("includes creditUnitVersion in ALLOWED_PROPERTY_KEYS", () => {
    expect(ALLOWED_PROPERTY_KEYS).toContain("creditUnitVersion");
    const key: AllowedPropertyKey = "creditUnitVersion";
    expect(key).toBe("creditUnitVersion");
  });

  it("allows Studio-safe properties and canonical funnel events", () => {
    expect(ALLOWED_PROPERTY_KEYS).toEqual(expect.arrayContaining([
      "studioSessionId", "creativeWorkId", "inputMode", "protocol", "sourceRole", "rolloutVariant", "outputCount",
    ]));
    expect(BETA_EVENT_KEYS).toEqual(expect.arrayContaining([...STUDIO_BETA_EVENT_KEYS, "generation_confirmed"]));
  });
});
