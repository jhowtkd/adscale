import { describe, it, expect } from "vitest";
import {
  OLHAR_AXES,
  OLHAR_VERDICTS,
  OLHAR_ADSCALE_PRINCIPLES,
  buildOlharAdscaleSection,
  summarizeOlharAxis,
} from "./constitution";

const FORBIDDEN_UI_FIRST_TERMS = [
  "clickable-looking",
  "CTA module",
  "UI modules",
  "CTA button",
  "CTA buttons",
  "button-like modules",
  "card grid",
  "card-grid",
  "three-zone visual budget",
  "THREE-ZONE VISUAL BUDGET",
];

describe("OLHAR_AXES", () => {
  it("exposes figura, gestalt, voz, and convite", () => {
    expect(OLHAR_AXES).toEqual(["figura", "gestalt", "voz", "convite"]);
  });
});

describe("OLHAR_VERDICTS", () => {
  it("exposes future creative verdict language", () => {
    expect(OLHAR_VERDICTS).toEqual([
      "pronta",
      "quase",
      "sem_opiniao",
      "confusa",
    ]);
  });
});

describe("OLHAR_ADSCALE_PRINCIPLES", () => {
  it("defines structured principles for each axis", () => {
    for (const axis of OLHAR_AXES) {
      const principle = OLHAR_ADSCALE_PRINCIPLES.find((p) => p.axis === axis);
      expect(principle).toBeDefined();
      expect(principle?.summary.length).toBeGreaterThan(10);
    }
  });
});

describe("summarizeOlharAxis", () => {
  it("returns a human-readable summary per axis", () => {
    for (const axis of OLHAR_AXES) {
      expect(summarizeOlharAxis(axis)).toMatch(/\S/);
    }
  });
});

describe("buildOlharAdscaleSection", () => {
  const section = buildOlharAdscaleSection();
  const joined = section.join("\n");

  it("returns prompt lines covering Olhar axes and export separation", () => {
    expect(joined).toMatch(/dominant idea|figura/i);
    expect(joined).toMatch(/gestalt/i);
    expect(joined).toMatch(/voice|voz/i);
    expect(joined).toMatch(/invite|convite/i);
    expect(joined).toMatch(/export|compliance|second pass/i);
  });

  it("frames CTA as invite hierarchy, not a widget", () => {
    expect(joined).toMatch(/invite/i);
    expect(joined).not.toMatch(/clickable widget|UI widget/i);
  });

  it("does not contain forbidden UI-first creative terms", () => {
    const lower = joined.toLowerCase();
    for (const term of FORBIDDEN_UI_FIRST_TERMS) {
      expect(lower).not.toContain(term.toLowerCase());
    }
  });
});
