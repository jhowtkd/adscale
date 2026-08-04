import { describe, expect, it } from "vitest";
import {
  isBrandKitOwnedAssetKey,
  normalizeHexColor,
  sanitizeBrandColors,
  sanitizeBrandFonts,
} from "./sanitize";

describe("normalizeHexColor", () => {
  it("accepts 3 and 6 digit hex", () => {
    expect(normalizeHexColor("#0a0")).toBe("#00AA00");
    expect(normalizeHexColor("#112233")).toBe("#112233");
    expect(normalizeHexColor("abc")).toBe("#AABBCC");
  });

  it("rejects non-hex", () => {
    expect(normalizeHexColor("navy")).toBeNull();
    expect(normalizeHexColor("rgb(0,0,0)")).toBeNull();
    expect(normalizeHexColor("#11223344")).toBeNull();
    expect(normalizeHexColor("")).toBeNull();
  });
});

describe("sanitizeBrandColors", () => {
  it("filters junk and dedupes", () => {
    expect(
      sanitizeBrandColors(["#000", "navy", "#000000", "  #FF00AA  ", 12, null]),
    ).toEqual(["#000000", "#FF00AA"]);
  });
});

describe("sanitizeBrandFonts", () => {
  it("trims and drops empties", () => {
    expect(sanitizeBrandFonts([" Inter ", "", "  ", "Roboto", "Inter"])).toEqual([
      "Inter",
      "Roboto",
    ]);
  });
});

describe("isBrandKitOwnedAssetKey", () => {
  it("accepts keys under the workspace prefix", () => {
    expect(
      isBrandKitOwnedAssetKey("ws-1", "workspaces/ws-1/brand-kit/logo.png"),
    ).toBe(true);
  });

  it("rejects foreign workspace keys", () => {
    expect(
      isBrandKitOwnedAssetKey("ws-1", "workspaces/other/brand-kit/logo.png"),
    ).toBe(false);
  });
});
