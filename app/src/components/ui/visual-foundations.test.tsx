import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

describe("visual foundation contract", () => {
  it("foundation test harness loads", () => {
    expect(stylesheet).toContain('@import "tailwindcss"');
  });

  it("tokens, themes, aliases, and semantic states are canonical", () => {
    expect(stylesheet).toContain("--canvas:");
    expect(stylesheet).toContain("--deep-bg: var(--canvas)");
    expect(stylesheet).toContain("--status-approved-bg: var(--success-bg)");
  });

  it("geometry, density, typography, radius, motion, and content width are named", () => {
    for (const token of ["--space-1", "--control-touch", "--text-page", "--radius-overlay", "--duration-default", "--content-workspace"]) {
      expect(stylesheet).toContain(`${token}:`);
    }
  });

  it("layers use one ordered global contract", () => {
    const tokens = ["--layer-base", "--layer-raised", "--layer-sticky", "--layer-shell", "--layer-shell-floating", "--layer-popover", "--layer-backdrop", "--layer-overlay", "--layer-toast", "--layer-tour", "--layer-skip-link"];
    for (const token of tokens) {
      expect(stylesheet).toContain(`${token}:`);
    }
    const values = tokens.map((token) => Number(stylesheet.match(new RegExp(`${token}:\\s*(\\d+)`))?.[1]));
    expect(values.every((value, index) => index === 0 || value > values[index - 1])).toBe(true);
  });
});
