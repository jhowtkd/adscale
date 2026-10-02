import { describe, expect, it } from "vitest";
import { FirecrawlSiteReader, SiteReaderError } from "./firecrawl";
import type { ResolvedAddress } from "../safe-image-download";

const publicLookup = async (): Promise<ResolvedAddress[]> => [{ address: "93.184.216.34", family: 4 }];

// mulberry32: a fixed seed makes every failure reproducible.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
type Rand = () => number;
const pick = <T,>(r: Rand, items: readonly T[]): T => items[Math.floor(r() * items.length)]!;

const KEYS = ["title", "ogSiteName", "og:site_name", "apple-touch-icon", "appleTouchIcon", "favicon", "ogImage", "og:image", "statusCode", "logo", "colors",
  "fonts", "family", "typography", "fontFamilies", "images", "primary", "success", "data", "__proto__", "constructor", "x"];
const STRINGS = ["", " ", "Marca", "#0000EE", "#abc", "#GGGGGG", "https://example.com/logo.png", "https://example.com/a.svg", "https://example.com/i.ico",
  "/relative/logo-1.png", "javascript:alert(1)", "https://user:pw@example.com/x.png", "data:text/plain,hi", "http://", "https://", "::::", "x".repeat(4001), "a".repeat(300),
  "https://example.com/apple-touch-icon.png", "https://example.com/favicon.png", "mailto:a@b.c"];
const SCALARS = (r: Rand): unknown => pick(r, [null, true, false, 0, -1, 404, 200, 3.5, 1e308, "s", pick(r, STRINGS), pick(r, STRINGS), pick(r, STRINGS)]);

function tree(r: Rand, depth: number): unknown {
  const roll = r();
  if (depth <= 0 || roll < 0.4) return SCALARS(r);
  if (roll < 0.7) return Array.from({ length: Math.floor(r() * 5) }, () => tree(r, depth - 1));
  return Object.fromEntries(Array.from({ length: Math.floor(r() * 5) }, () => [pick(r, KEYS), tree(r, depth - 1)]));
}
// A tree, or sometimes a deliberately shaped value for the places the reader expects a list or an object.
const field = (r: Rand, shape: "list" | "object" | "any") => {
  if (r() < 0.5) return tree(r, 3);
  if (shape === "list") return Array.from({ length: Math.floor(r() * 40) }, () => r() < 0.7 ? pick(r, STRINGS) : tree(r, 2));
  if (shape === "object") return Object.fromEntries(Array.from({ length: Math.floor(r() * 5) }, () => [pick(r, KEYS), tree(r, 2)]));
  return tree(r, 2);
};
function randomBody(r: Rand): unknown {
  if (r() < 0.1) return tree(r, 3); // an envelope that is not even an envelope
  const maybe = (key: string, value: unknown) => (r() < 0.12 ? {} : { [key]: value });
  const data = r() < 0.05 ? tree(r, 2) : {
    ...maybe("markdown", r() < 0.7 ? "m".repeat(Math.floor(r() * 120_000)) : field(r, "any")),
    ...maybe("links", field(r, "list")), ...maybe("images", field(r, "list")), ...maybe("screenshot", field(r, "any")),
    ...maybe("metadata", Object.fromEntries(["title", "ogSiteName", "og:site_name", "apple-touch-icon", "appleTouchIcon", "favicon", "ogImage", "og:image", "statusCode"]
      .filter(() => r() < 0.7).map(k => [k, k === "statusCode" && r() < 0.5 ? pick(r, [200, 301, 404, 500, "404", null, 1e999]) : field(r, "any")]))),
    ...maybe("branding", { logo: field(r, "any"), colors: field(r, "object"), fonts: field(r, "list"), typography: { fontFamilies: field(r, "object") },
      images: { logo: field(r, "any"), favicon: field(r, "any"), ogImage: field(r, "any") } }),
  };
  return { success: r() < 0.9 ? true : tree(r, 1), data, ...(r() < 0.1 ? { code: tree(r, 1), error: tree(r, 1) } : {}) };
}

const hex = /^#[0-9a-f]{6}$/i;
function assertWellTyped(out: Awaited<ReturnType<FirecrawlSiteReader["read"]>>) {
  expect(out.title === null || typeof out.title === "string").toBe(true);
  expect(out.siteName === null || typeof out.siteName === "string").toBe(true);
  expect(typeof out.markdown).toBe("string");
  expect(out.markdown.length).toBeLessThanOrEqual(50_000);
  expect(out.links.length).toBeLessThanOrEqual(1000);
  expect(out.images.length).toBeLessThanOrEqual(30);
  expect(new Set(out.images.map(i => i.url)).size).toBe(out.images.length);
  for (const u of [...out.links, ...out.images.map(i => i.url), ...(out.screenshotUrl ? [out.screenshotUrl] : []), ...(out.branding.logo ? [out.branding.logo.url] : [])]) {
    const parsed = new URL(u);
    expect(["http:", "https:"]).toContain(parsed.protocol);
    expect(parsed.username + parsed.password).toBe("");
  }
  expect(out.branding.colors.length).toBeLessThanOrEqual(6);
  for (const c of out.branding.colors) expect(c).toMatch(hex);
  expect(out.branding.fonts.length).toBeLessThanOrEqual(8);
  for (const f of out.branding.fonts) { expect(typeof f).toBe("string"); expect(f.length).toBeLessThanOrEqual(100); }
  expect(out.logoCandidates.length).toBeLessThanOrEqual(3);
  for (const l of out.logoCandidates) expect(new URL(l).pathname).not.toMatch(/\.(?:svg|ico)$/i);
  expect(typeof out.statusCode).toBe("number");
  expect(Number.isFinite(out.statusCode)).toBe(true);
}

const reading = (body: unknown, fetchBody: (b: unknown) => string = b => JSON.stringify(b)) =>
  new FirecrawlSiteReader({ apiKey: "k", lookup: publicLookup, fetch: async () => new Response(fetchBody(body), { status: 200, headers: { "content-type": "application/json" } }) }).read("https://example.com/");

describe("FirecrawlSiteReader fuzz", () => {
  it("resolves well typed and within limits, or rejects with SiteReaderError, for 2,500 random answers", async () => {
    const r = rng(20261001);
    let resolved = 0, rejected = 0;
    for (let i = 0; i < 2500; i++) {
      const body = randomBody(r);
      let raw: string;
      try { raw = JSON.stringify(body) ?? "null"; } catch { continue; }
      try {
        const out = await reading(body, () => raw);
        assertWellTyped(out);
        resolved++;
      } catch (error) {
        if (error instanceof SiteReaderError) { rejected++; continue; }
        throw new Error(`case ${i} threw ${String(error)} for ${raw.slice(0, 600)}`);
      }
    }
    // The generator must reach both outcomes, or the property proves nothing.
    expect(resolved).toBeGreaterThan(1000);
    expect(rejected).toBeGreaterThan(100);
  });

  it("answers with a status of 400 or more are rejected as site_unavailable, whatever else the page holds", async () => {
    const r = rng(7);
    for (let i = 0; i < 200; i++) {
      const body = randomBody(r) as { data?: { metadata?: Record<string, unknown> } };
      if (typeof body !== "object" || body === null || typeof (body as { success?: unknown }).success !== "boolean" || typeof body.data !== "object" || body.data === null || Array.isArray(body.data)) continue;
      body.data.metadata = { statusCode: 400 + Math.floor(r() * 200) };
      if ((body as { success: boolean }).success) await expect(reading(body)).rejects.toMatchObject({ message: "site_unavailable" });
    }
  });
});

// One cell of the table per kind of value a field can hold: none of them may cost the page, and a text one is the only one that may show up.
const KINDS: Record<string, unknown> = {
  string: "https://example.com/pic.png", list: ["", "https://example.com/pic.png"], nestedList: [[null, ["https://example.com/pic.png"]]],
  number: 42, null: null, object: { url: "https://example.com/pic.png" }, boolean: true,
};
const dataWith = (patch: Record<string, unknown>) => ({ success: true, data: { markdown: "m", links: [], images: [], metadata: { statusCode: 200 }, branding: {}, ...patch } });

describe("FirecrawlSiteReader field × kind table", () => {
  const metaKeys = ["title", "ogSiteName", "og:site_name", "apple-touch-icon", "appleTouchIcon", "favicon", "ogImage", "og:image"];
  const textKinds = ["string", "list", "nestedList"];
  for (const key of metaKeys) for (const [kind, value] of Object.entries(KINDS)) {
    it(`metadata.${key} as ${kind}`, async () => {
      const out = await reading(dataWith({ metadata: { statusCode: 200, [key]: value } }));
      assertWellTyped(out);
      const expectText = textKinds.includes(kind);
      const surfaced = key === "title" ? out.title : key === "ogSiteName" || key === "og:site_name" ? out.siteName : out.logoCandidates[0] ?? null;
      if (expectText) expect(surfaced).toBe("https://example.com/pic.png");
      else expect(surfaced).toBeNull();
    });
  }
  const brandingFields: [string, (v: unknown) => Record<string, unknown>][] = [
    ["logo", v => ({ logo: v })], ["images.logo", v => ({ images: { logo: v } })], ["images.favicon", v => ({ images: { favicon: v } })], ["images.ogImage", v => ({ images: { ogImage: v } })],
    ["colors", v => ({ colors: v })], ["colors.primary", v => ({ colors: { primary: v } })], ["fonts", v => ({ fonts: v })], ["fonts[].family", v => ({ fonts: [{ family: v }] })],
    ["typography", v => ({ typography: v })], ["typography.fontFamilies", v => ({ typography: { fontFamilies: v } })], ["typography.fontFamilies.heading", v => ({ typography: { fontFamilies: { heading: v } } })],
  ];
  for (const [name, build] of brandingFields) for (const [kind, value] of Object.entries(KINDS)) {
    it(`branding.${name} as ${kind}`, async () => {
      const out = await reading(dataWith({ branding: build(value) }));
      assertWellTyped(out);
    });
  }
  it("a text brand logo survives a sibling field of every other kind", async () => {
    for (const [, value] of Object.entries(KINDS)) {
      const out = await reading(dataWith({ branding: { logo: "https://example.com/logo.png", colors: value, fonts: value, typography: value, images: value } }));
      expect(out.branding.logo).toEqual({ url: "https://example.com/logo.png" });
    }
  });
  for (const key of ["markdown", "links", "images", "screenshot"]) for (const [kind, value] of Object.entries(KINDS)) {
    it(`data.${key} as ${kind}`, async () => { assertWellTyped(await reading(dataWith({ [key]: value }))); });
  }
});

describe("FirecrawlSiteReader limits on an oversized page", () => {
  it("caps every list however much the page returns", async () => {
    const hexes = Array.from({ length: 20 }, (_, i) => `#${(0x100000 + i * 0x1111).toString(16)}`);
    const out = await reading(dataWith({
      markdown: "m".repeat(80_000),
      links: Array.from({ length: 2500 }, (_, i) => `https://example.com/l${i}`),
      images: [...Array.from({ length: 60 }, (_, i) => `https://example.com/logo-${i}.png`), "https://example.com/logo-0.png"],
      branding: { colors: Object.fromEntries(hexes.map((h, i) => [`c${i}`, h])), fonts: Array.from({ length: 20 }, (_, i) => ({ family: `F${i}${"x".repeat(150)}` })) },
    }));
    assertWellTyped(out);
    expect(out.markdown).toHaveLength(50_000);
    expect(out.links).toHaveLength(1000);
    expect(out.images).toHaveLength(30);
    expect(out.branding.colors).toHaveLength(6);
    expect(out.branding.fonts).toHaveLength(8);
    expect(out.branding.fonts.every(f => f.length === 100)).toBe(true);
    expect(out.logoCandidates).toHaveLength(3);
  });
});
