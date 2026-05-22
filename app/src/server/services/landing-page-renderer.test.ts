import { describe, expect, it } from "vitest";
import { renderLandingPageHtml } from "./landing-page-renderer";

function makeStructure(): Parameters<typeof renderLandingPageHtml>[0]["structure"] {
  return {
    title: "Test LP",
    sections: {
      hero: { eyebrow: "Limited", headline: "Hero Headline", body: "Hero body.", cta: "Shop" },
      problem: { headline: "Problem", body: "Problem body.", bullets: ["A", "B"] },
      solution: { headline: "Solution", body: "Solution body.", bullets: ["C"] },
      benefits: { headline: "Benefits", body: "Benefits body.", bullets: ["D"] },
      trust: { headline: "Trust", body: "Trust body." },
      offer: { headline: "Offer", body: "Offer body.", cta: "Claim" },
      faq: {
        headline: "FAQ",
        body: "",
        items: [{ question: "Q1?", answer: "A1." }],
      },
      finalCta: { headline: "Final", body: "Final body.", cta: "End" },
    },
  };
}

describe("renderLandingPageHtml", () => {
  it("starts with <!doctype html>", () => {
    const html = renderLandingPageHtml({ structure: makeStructure() });
    expect(html.trim().toLowerCase().startsWith("<!doctype html>")).toBe(true);
  });

  it("includes all required sections", () => {
    const html = renderLandingPageHtml({ structure: makeStructure() });

    expect(html).toContain('id="hero"');
    expect(html).toContain('id="problem"');
    expect(html).toContain('id="solution"');
    expect(html).toContain('id="benefits"');
    expect(html).toContain('id="trust"');
    expect(html).toContain('id="offer"');
    expect(html).toContain('id="faq"');
    expect(html).toContain('id="finalCta"');
  });

  it("escapes HTML-sensitive copy", () => {
    const structure = makeStructure();
    structure.sections.hero.headline = '<script>alert("xss")</script>';
    const html = renderLandingPageHtml({ structure });

    expect(html).not.toContain('<script>alert("xss")</script>');
    expect(html).toContain("&lt;script&gt;");
  });

  it("includes responsive CSS", () => {
    const html = renderLandingPageHtml({ structure: makeStructure() });

    expect(html).toContain("@media(min-width:640px)");
    expect(html).toContain("max-width:720px");
  });

  it("can include the approved creative image URL", () => {
    const html = renderLandingPageHtml({
      structure: makeStructure(),
      imageUrl: "https://cdn.example.com/image.png",
    });

    expect(html).toContain('src="https://cdn.example.com/image.png"');
  });

  it("omits image when URL is not provided", () => {
    const html = renderLandingPageHtml({ structure: makeStructure() });
    expect(html).not.toContain("hero-image");
  });
});
