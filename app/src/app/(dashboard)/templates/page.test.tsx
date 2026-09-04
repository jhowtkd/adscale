import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("templates product surface", () => {
  it("redirects the catalog into Palco instead of keeping a template page", () => {
    const source = readFileSync("src/app/(dashboard)/templates/page.tsx", "utf8");
    expect(source).toContain('redirect("/")');
    expect(source).not.toContain("TemplateCard");
    expect(source).not.toContain("mode=briefing");
  });
});
