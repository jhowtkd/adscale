import { describe, it, expect } from "vitest";
import { resolveCtaSemantics } from "./creative-contract";

describe("resolveCtaSemantics", () => {
  it("returns inherited for null ctaText in art_variation", () => {
    expect(resolveCtaSemantics(null, "art_variation")).toEqual({ kind: "inherited" });
  });

  it("returns inherited for null ctaText in format_adaptation", () => {
    expect(resolveCtaSemantics(null, "format_adaptation")).toEqual({ kind: "inherited" });
  });

  it("returns inherited for null ctaText in restyling", () => {
    expect(resolveCtaSemantics(null, "restyling")).toEqual({ kind: "inherited" });
  });

  it("returns explicit for non-empty ctaText", () => {
    expect(resolveCtaSemantics("Comprar agora", "art_variation")).toEqual({
      kind: "explicit",
      text: "Comprar agora",
    });
  });

  it("returns inherited for empty string ctaText", () => {
    expect(resolveCtaSemantics("", "art_variation")).toEqual({ kind: "inherited" });
  });

  it("returns inherited for undefined ctaText in restyling", () => {
    expect(resolveCtaSemantics(undefined, "restyling")).toEqual({ kind: "inherited" });
  });
});
