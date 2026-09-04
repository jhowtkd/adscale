import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dashboard product surface", () => {
  it("folds Visão geral into Trabalhos", () => {
    const source = readFileSync("src/app/(dashboard)/dashboard/page.tsx", "utf8");
    expect(source).toContain('redirect("/campaigns")');
    expect(source).not.toContain("DashboardV6View");
  });
});
