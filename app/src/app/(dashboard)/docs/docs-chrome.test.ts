import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import robots from "@/app/robots";

describe("docs chrome", () => {
  const html = readFileSync(path.join(process.cwd(), "public/manual/index.html"), "utf8");

  it("uses the studio dark canvas, not forest green", () => {
    expect(html).toContain("oklch(0.145 0.004 260)");
    expect(html).not.toContain("#161c18");
    expect(html).not.toContain("#5dff6a");
  });

  it("does not invent Palco composer language on the manual", () => {
    expect(html).not.toContain("TalkBox");
    expect(html).not.toContain("action-primary-bg");
    expect(html).not.toContain("ShineBorder");
  });

  it("maps current product destinations: the conversation is the door, the composer opens from Criações", () => {
    expect(html).toContain("<b>Conversa</b>");
    expect(html).toContain("Conversa · Buscar · Criações · Biblioteca · Ideias · Metas");
    expect(html).toContain("Brand Kit da marca");
    expect(html).toContain("Anúncios veiculados");
    expect(html).not.toMatch(/Estúdio/);
    expect(html).not.toContain("Visão geral");
    expect(html).not.toContain("<h3>Templates</h3>");
    expect(html).toContain('href="/"');
    expect(html).toContain("/images/logo.svg");
    expect(html).toContain('src="/manual/screenshots/');
  });

  it("keeps the product help out of search indexes", () => {
    const manifest = robots();
    const rules = Array.isArray(manifest.rules) ? manifest.rules[0] : manifest.rules;
    expect(rules.disallow).toContain("/docs");
    expect(rules.disallow).toContain("/manual");
  });

  it("rewrites /manual onto the static manual", () => {
    const config = readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");
    expect(config).toContain('source: "/manual"');
    expect(config).toContain('destination: "/manual/index.html"');
  });
});
