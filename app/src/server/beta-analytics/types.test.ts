import { describe, expect, it } from "vitest";
import { ALLOWED_PROPERTY_KEYS, type AllowedPropertyKey } from "./types";

describe("beta analytics types", () => {
  it("includes creditUnitVersion in ALLOWED_PROPERTY_KEYS", () => {
    expect(ALLOWED_PROPERTY_KEYS).toContain("creditUnitVersion");
    const key: AllowedPropertyKey = "creditUnitVersion";
    expect(key).toBe("creditUnitVersion");
  });
});
