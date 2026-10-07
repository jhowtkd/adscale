import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import TemplatesPage from "./page";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

describe("templates product surface", () => {
  it("redirects the catalog into the composer instead of keeping a template page", () => {
    expect(() => TemplatesPage()).toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/creative-work/new");
    const source = readFileSync("src/app/(dashboard)/templates/page.tsx", "utf8");
    expect(source).not.toContain("TemplateCard");
    expect(source).not.toContain("mode=briefing");
  });
});
