import { describe, expect, it } from "vitest";
import { normalizeEmail, normalizeWhatsapp } from "./normalize";

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Maria@Empresa.COM ")).toBe("maria@empresa.com");
  });
});

describe("normalizeWhatsapp", () => {
  it("keeps digits with leading country code", () => {
    expect(normalizeWhatsapp("+55 (11) 99999-9999")).toBe("5511999999999");
  });

  it("adds 55 when 11 digits without country code", () => {
    expect(normalizeWhatsapp("11999999999")).toBe("5511999999999");
  });
});
