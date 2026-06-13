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
    for (const token of ["--layer-base", "--layer-shell", "--layer-popover", "--layer-overlay", "--layer-skip-link"]) {
      expect(stylesheet).toContain(`${token}:`);
    }
  });
});
