import { describe, expect, it } from "vitest";
import { LOGO_PLATES, LOGO_SURFACES, LOGO_VISION_BACKDROP, logoPlateBackground, parseLogoSurface } from "./logo-surface";

describe("parseLogoSurface", () => {
  it.each(["dark", "light"] as const)("accepts %s", value => expect(parseLogoSurface(value)).toBe(value));
  it.each([["DARK"], ["Light"], [" dark"], ["dark "], [""], ["purple"], [null], [undefined], [0], [1], [true], [{}], [{ surface: "dark" }], [["dark"]], [Symbol("dark")]])("is undefined for %s", value => {
    expect(parseLogoSurface(value)).toBeUndefined();
  });
  it("never throws, even for a hostile object", () => {
    expect(parseLogoSurface({ toString() { throw new Error("no"); } })).toBeUndefined();
  });
});

describe("the plates", () => {
  it("lists exactly the two surfaces", () => expect([...LOGO_SURFACES]).toEqual(["dark", "light"]));
  it("paints exactly the gradients the mesa uses", () => {
    expect(logoPlateBackground("light")).toBe("linear-gradient(160deg,#f6f1e8,#e9e1d4)");
    expect(logoPlateBackground("dark")).toBe("linear-gradient(170deg,#17191d,#101115)");
  });
  it("gives the light plate to a value that is not a surface (stored data is not a type), never throws", () => {
    for (const value of ["purple", "DARK", "", null, undefined, 1, {}]) expect(logoPlateBackground(value as never)).toBe("linear-gradient(160deg,#f6f1e8,#e9e1d4)");
  });
  it("keeps the colors the measurement judges against", () => {
    expect(LOGO_PLATES).toEqual({ light: { angle: 160, from: "#f6f1e8", to: "#e9e1d4" }, dark: { angle: 170, from: "#17191d", to: "#101115" } });
  });
  it("flattens the vision copy on white for light and on the graphite for dark", () => {
    expect(LOGO_VISION_BACKDROP).toEqual({ light: "#ffffff", dark: "#17191d" });
  });
});
