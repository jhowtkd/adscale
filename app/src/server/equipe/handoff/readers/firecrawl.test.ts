import { afterEach, describe, expect, it, vi } from "vitest";
import { FirecrawlSiteReader, SiteReaderError } from "./firecrawl";
import type { ResolvedAddress } from "../safe-image-download";
// Raw Firecrawl answers (ticket 12, 01/10/2026): only the signed query of the screenshot link was dropped.
import conteudoMartechHome from "./fixtures/firecrawl-conteudomartech-home.json";
import conteudoMartech404 from "./fixtures/firecrawl-conteudomartech-404.json";

const publicLookup = async (): Promise<ResolvedAddress[]> => [{ address: "93.184.216.34", family: 4 }];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function scrapeBody(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    data: {
      markdown: "Marca de exemplo. Produtos e serviços.",
      links: ["https://www.instagram.com/marca_exemplo/", "javascript:alert(1)"],
      images: ["https://example.com/a.png", "https://example.com/a.png", "/relative.png"],
      screenshot: "https://example.com/print.png",
      metadata: { title: "Marca de exemplo", ogSiteName: "Marca", statusCode: 200 },
      branding: {
        logo: "https://example.com/logo.png",
        colors: { primary: "#0000EE", secondary: "not-a-hex", tertiary: "#333333" },
        fonts: [{ family: "Inter" }, { family: "Inter" }],
        typography: { fontFamilies: { heading: "Poppins" } },
      },
      ...overrides,
    },
  };
}

const saved = new Map<string, string | undefined>();
function setEnv(key: string, value: string | undefined) {
  if (!saved.has(key)) saved.set(key, process.env[key]);
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
afterEach(() => {
  for (const [k, v] of saved) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  saved.clear();
});

describe("FirecrawlSiteReader", () => {
  it("fails clearly with no API key, and never calls Firecrawl", async () => {
    setEnv("FIRECRAWL_API_KEY", undefined);
    const fetchImpl = vi.fn();
    const reader = new FirecrawlSiteReader({ fetch: fetchImpl, lookup: publicLookup });
    await expect(reader.read("https://example.com")).rejects.toMatchObject({ message: "reader_unavailable", unbilled: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects an invalid/unsafe source URL before any network call", async () => {
    const fetchImpl = vi.fn();
    const lookup = vi.fn(publicLookup);
    const reader = new FirecrawlSiteReader({ apiKey: "k", fetch: fetchImpl, lookup });
    await expect(reader.read("https://localhost/a")).rejects.toMatchObject({ message: "invalid_site", unbilled: true });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("fails as unbilled site_dns_or_address when the DNS lookup fails, without calling Firecrawl", async () => {
    const fetchImpl = vi.fn();
    const lookup = vi.fn(async () => { const e = new Error("not found") as NodeJS.ErrnoException; e.code = "ENOTFOUND"; throw e; });
    const reader = new FirecrawlSiteReader({ apiKey: "k", fetch: fetchImpl, lookup });
    await expect(reader.read("https://nowhere.example.com")).rejects.toMatchObject({ message: "site_dns_or_address", unbilled: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails as unbilled site_dns_or_address when the resolved address is private, without calling Firecrawl", async () => {
    const fetchImpl = vi.fn();
    const lookup = async () => [{ address: "10.0.0.5", family: 4 as const }];
    const reader = new FirecrawlSiteReader({ apiKey: "k", fetch: fetchImpl, lookup });
    await expect(reader.read("https://internal-host.example.com")).rejects.toMatchObject({ message: "site_dns_or_address", unbilled: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends the expected v2/scrape request", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(scrapeBody()));
    const reader = new FirecrawlSiteReader({ apiKey: "secret-key", fetch: fetchImpl, lookup: publicLookup });
    await reader.read("https://example.com/");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.firecrawl.dev/v2/scrape");
    expect(init?.method).toBe("POST");
    expect(init?.redirect).toBe("error");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer secret-key");
    const body = JSON.parse(String(init?.body));
    expect(body.url).toBe("https://example.com/");
    expect(body.formats).toEqual(["markdown", "links", "images", "screenshot", "branding"]);
  });

  it("maps a successful scrape into SiteReadResult, deduping and bounding branding", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(scrapeBody()));
    const reader = new FirecrawlSiteReader({ apiKey: "k", fetch: fetchImpl, lookup: publicLookup });
    const result = await reader.read("https://example.com/");
    expect(result.title).toBe("Marca de exemplo");
    expect(result.siteName).toBe("Marca");
    expect(result.markdown).toBe("Marca de exemplo. Produtos e serviços.");
    expect(result.statusCode).toBe(200);
    expect(result.screenshotUrl).toBe("https://example.com/print.png");
    // javascript: link dropped, instagram link kept and resolved
    expect(result.links).toEqual(["https://www.instagram.com/marca_exemplo/"]);
    // duplicate absolute image collapsed, relative image resolved against the page URL
    expect(result.images).toEqual([{ url: "https://example.com/a.png" }, { url: "https://example.com/relative.png" }]);
    expect(result.branding?.logo).toEqual({ url: "https://example.com/logo.png" });
    // invalid hex dropped, valid ones kept
    expect(result.branding?.colors).toEqual(["#0000EE", "#333333"]);
    // fonts deduped across fonts[] and typography.fontFamilies
    expect(result.branding?.colors?.length).toBeLessThanOrEqual(6);
    expect(result.branding?.fonts).toEqual(["Inter", "Poppins"]);
  });

  it("prefers og:site_name when ogSiteName is absent", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(scrapeBody({ metadata: { title: "T", "og:site_name": "Fallback", statusCode: 200 } })));
    const reader = new FirecrawlSiteReader({ apiKey: "k", fetch: fetchImpl, lookup: publicLookup });
    const result = await reader.read("https://example.com/");
    expect(result.siteName).toBe("Fallback");
  });

  it("falls back to branding.images.logo when branding.logo is absent", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(scrapeBody({ branding: { images: { logo: "https://example.com/alt-logo.png" }, colors: {}, fonts: [] } })));
    const reader = new FirecrawlSiteReader({ apiKey: "k", fetch: fetchImpl, lookup: publicLookup });
    const result = await reader.read("https://example.com/");
    expect(result.branding?.logo).toEqual({ url: "https://example.com/alt-logo.png" });
  });

  it("returns graceful empty branding when the site has none", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(scrapeBody({ branding: null })));
    const reader = new FirecrawlSiteReader({ apiKey: "k", fetch: fetchImpl, lookup: publicLookup });
    const result = await reader.read("https://example.com/");
    expect(result.branding).toEqual({ colors: [], fonts: [] });
  });

  it("treats metadata.statusCode >= 400 as a billed failure even when success=true", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(scrapeBody({ metadata: { title: null, ogSiteName: null, statusCode: 404 } })));
    const reader = new FirecrawlSiteReader({ apiKey: "k", fetch: fetchImpl, lookup: publicLookup });
    const error = await reader.read("https://example.com/404").catch((e) => e);
    expect(error).toMatchObject({ message: "site_unavailable" });
    expect((error as SiteReaderError).unbilled).toBe(false);
  });

  it("a DNS failure Firecrawl itself reports over a successful (2xx) transport is unbilled site_provider_dns — distinct from OUR local site_dns_or_address", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ success: false, code: "DNS_ERROR", error: "could not resolve host" }));
    const reader = new FirecrawlSiteReader({ apiKey: "k", fetch: fetchImpl, lookup: publicLookup });
    const error = await reader.read("https://nowhere-real.example.com").catch((e) => e);
    expect(error).toMatchObject({ message: "site_provider_dns" });
    expect((error as SiteReaderError).unbilled).toBe(true);
  });

  it("detects a Firecrawl-reported (2xx) DNS failure from the error message when no machine code is present", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ success: false, error: "net::ERR_NAME_NOT_RESOLVED" }));
    const reader = new FirecrawlSiteReader({ apiKey: "k", fetch: fetchImpl, lookup: publicLookup });
    const error = await reader.read("https://nowhere-real.example.com").catch((e) => e);
    expect(error).toMatchObject({ message: "site_provider_dns" });
    expect((error as SiteReaderError).unbilled).toBe(true);
  });

  it("treats any other Firecrawl-reported failure as billed/uncertain reading_failed", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ success: false, code: "SCRAPE_TIMEOUT", error: "timed out" }));
    const reader = new FirecrawlSiteReader({ apiKey: "k", fetch: fetchImpl, lookup: publicLookup });
    const error = await reader.read("https://slow.example.com").catch((e) => e);
    expect(error).toMatchObject({ message: "reading_failed" });
    expect((error as SiteReaderError).unbilled).toBe(false);
  });

  it("treats a non-2xx HTTP response the same as a reported failure", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ success: false, code: "SERVER_ERROR" }, 500));
    const reader = new FirecrawlSiteReader({ apiKey: "k", fetch: fetchImpl, lookup: publicLookup });
    const error = await reader.read("https://example.com/").catch((e) => e);
    expect(error).toMatchObject({ message: "reading_failed" });
    expect((error as SiteReaderError).unbilled).toBe(false);
  });

  it("an HTTP >= 400 transport status ALWAYS counts as billed/uncertain, even when the body itself is DNS-shaped — the transport status wins over the reported reason", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ success: false, code: "DNS_ERROR", error: "net::ERR_NAME_NOT_RESOLVED" }, 500));
    const reader = new FirecrawlSiteReader({ apiKey: "k", fetch: fetchImpl, lookup: publicLookup });
    const error = await reader.read("https://example.com/").catch((e) => e);
    expect(error).toMatchObject({ message: "reading_failed" });
    expect((error as SiteReaderError).unbilled).toBe(false);
  });

  it("fails closed (billed/uncertain) on a response that doesn't match the expected schema", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ unexpected: true }));
    const reader = new FirecrawlSiteReader({ apiKey: "k", fetch: fetchImpl, lookup: publicLookup });
    const error = await reader.read("https://example.com/").catch((e) => e);
    expect(error).toMatchObject({ message: "reading_failed" });
    expect((error as SiteReaderError).unbilled).toBe(false);
  });

  it("propagates a transport-level rejection from fetch without swallowing it", async () => {
    const fetchImpl = vi.fn(async () => { throw new DOMException("aborted", "AbortError"); });
    const reader = new FirecrawlSiteReader({ apiKey: "k", fetch: fetchImpl, lookup: publicLookup });
    await expect(reader.read("https://example.com/")).rejects.toThrow("aborted");
  });

  describe("beforeRequest: the lost-ACK dispatch guard", () => {
    it("calls beforeRequest only after DNS/key validation, and only once, before the POST", async () => {
      const fetchImpl = vi.fn(async () => jsonResponse(scrapeBody()));
      const order: string[] = [];
      const lookup = vi.fn(async () => { order.push("dns"); return [{ address: "93.184.216.34", family: 4 as const }]; });
      const beforeRequest = vi.fn(async () => { order.push("beforeRequest"); return true; });
      const reader = new FirecrawlSiteReader({ apiKey: "k", fetch: fetchImpl, lookup, beforeRequest });
      await reader.read("https://example.com/");
      expect(order).toEqual(["dns", "beforeRequest"]);
      expect(beforeRequest).toHaveBeenCalledTimes(1);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("never calls beforeRequest when DNS/key validation already failed", async () => {
      const fetchImpl = vi.fn();
      const beforeRequest = vi.fn(async () => true);
      const reader = new FirecrawlSiteReader({ apiKey: "k", fetch: fetchImpl, lookup: async () => { const e = new Error("no") as NodeJS.ErrnoException; e.code = "ENOTFOUND"; throw e; }, beforeRequest });
      await expect(reader.read("https://nowhere.example.com")).rejects.toMatchObject({ message: "site_dns_or_address" });
      expect(beforeRequest).not.toHaveBeenCalled();
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("false from beforeRequest fails as billed/uncertain reading_failed, WITHOUT sending the POST (the lost-ACK case: a prior attempt may already have been charged)", async () => {
      const fetchImpl = vi.fn();
      const reader = new FirecrawlSiteReader({ apiKey: "k", fetch: fetchImpl, lookup: publicLookup, beforeRequest: async () => false });
      const error = await reader.read("https://example.com/").catch((e) => e);
      expect(error).toMatchObject({ message: "reading_failed" });
      expect((error as SiteReaderError).unbilled).toBe(false);
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("no beforeRequest configured (e.g. the fake/dev provider path) behaves exactly as before", async () => {
      const fetchImpl = vi.fn(async () => jsonResponse(scrapeBody()));
      const reader = new FirecrawlSiteReader({ apiKey: "k", fetch: fetchImpl, lookup: publicLookup });
      await expect(reader.read("https://example.com/")).resolves.toMatchObject({ title: "Marca de exemplo" });
    });
  });

  describe("logoCandidates: raster only, never spending a slot on .svg/.ico", () => {
    it("drops every .svg/.ico candidate before capping at 3, keeping only raster images", async () => {
      const fetchImpl = vi.fn(async () => jsonResponse(scrapeBody({
        metadata: { title: "T", ogSiteName: "Marca", statusCode: 200, "apple-touch-icon": "https://example.com/apple-touch-icon.png", favicon: "https://example.com/favicon.ico" },
        branding: { logo: "https://example.com/logo.svg", images: { favicon: "https://example.com/favicon2.ico", ogImage: "https://example.com/og-logo.jpg" }, colors: {}, fonts: [] },
        images: ["https://example.com/icon-32.svg", "https://example.com/logo-alt.png"],
      })));
      const reader = new FirecrawlSiteReader({ apiKey: "k", fetch: fetchImpl, lookup: publicLookup });
      const result = await reader.read("https://example.com/");
      // branding.logo itself is SVG, so it never becomes the chosen `branding.logo` either (filtered from logoCandidates too).
      expect(result.logoCandidates).toEqual(expect.arrayContaining(["https://example.com/apple-touch-icon.png", "https://example.com/og-logo.jpg", "https://example.com/logo-alt.png"]));
      expect(result.logoCandidates).toHaveLength(3);
      for (const candidate of result.logoCandidates ?? []) expect(candidate).not.toMatch(/\.(?:svg|ico)$/i);
    });

    it("caps at 3 raster candidates even when more are available", async () => {
      const fetchImpl = vi.fn(async () => jsonResponse(scrapeBody({
        metadata: { title: "T", ogSiteName: "Marca", statusCode: 200, "apple-touch-icon": "https://example.com/a.png" },
        branding: { logo: "https://example.com/b.png", images: { ogImage: "https://example.com/c.png" }, colors: {}, fonts: [] },
        images: ["https://example.com/logo-d.png"],
      })));
      const reader = new FirecrawlSiteReader({ apiKey: "k", fetch: fetchImpl, lookup: publicLookup });
      const result = await reader.read("https://example.com/");
      expect(result.logoCandidates).toHaveLength(3);
    });
  });

  describe("site_dns_or_address (OUR local preflight) vs site_provider_dns (Firecrawl's own 2xx report) vs site_unavailable (charged 404)", () => {
    it("local preflight DNS/address failure never reaches Firecrawl and is site_dns_or_address; Firecrawl's own 2xx-reported DNS failure is site_provider_dns; a charged 404 is site_unavailable", async () => {
      const localFetch = vi.fn();
      const localReader = new FirecrawlSiteReader({ apiKey: "k", fetch: localFetch, lookup: async () => { const e = new Error("no") as NodeJS.ErrnoException; e.code = "ENOTFOUND"; throw e; } });
      const localError = await localReader.read("https://nowhere-real.example.com").catch((e) => e);
      expect(localError).toMatchObject({ message: "site_dns_or_address" });
      expect((localError as SiteReaderError).unbilled).toBe(true);
      expect(localFetch).not.toHaveBeenCalled();

      const dnsFetch = vi.fn(async () => jsonResponse({ success: false, code: "DNS_ERROR", error: "could not resolve host" }));
      const dnsReader = new FirecrawlSiteReader({ apiKey: "k", fetch: dnsFetch, lookup: publicLookup });
      const dnsError = await dnsReader.read("https://nowhere-real.example.com").catch((e) => e);
      expect(dnsError).toMatchObject({ message: "site_provider_dns" });
      expect((dnsError as SiteReaderError).unbilled).toBe(true);

      const notFoundFetch = vi.fn(async () => jsonResponse(scrapeBody({ metadata: { title: null, ogSiteName: null, statusCode: 404 } })));
      const notFoundReader = new FirecrawlSiteReader({ apiKey: "k", fetch: notFoundFetch, lookup: publicLookup });
      const notFoundError = await notFoundReader.read("https://example.com/missing-page").catch((e) => e);
      expect(notFoundError).toMatchObject({ message: "site_unavailable" });
      expect((notFoundError as SiteReaderError).unbilled).toBe(false);

      // Both Firecrawl-answered calls actually reached Firecrawl (unlike the local preflight failure):
      // the distinction between them is purely in how Firecrawl itself answered, not in whether a
      // request was sent.
      expect(dnsFetch).toHaveBeenCalledTimes(1);
      expect(notFoundFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("a paid answer is never thrown away over a field that is not essential (ticket 13, D-1)", () => {
    const read = (body: unknown) => new FirecrawlSiteReader({ apiKey: "k", fetch: vi.fn(async () => jsonResponse(body)), lookup: publicLookup }).read("https://example.com/");
    const fail = async (body: unknown) => {
      const error = await read(body).catch((e) => e);
      expect(error).toBeInstanceOf(SiteReaderError);
      return error as SiteReaderError;
    };

    it("reads the real answer for conteudomartech.com.br, where og:site_name and eight other metadata keys come as lists", async () => {
      const meta = (conteudoMartechHome as { data: { metadata: Record<string, unknown> } }).data.metadata;
      // Guard the fixture itself: this is the shape that used to reject the whole answer.
      expect(Array.isArray(meta["og:site_name"])).toBe(true);
      expect(Object.values(meta).filter(Array.isArray)).toHaveLength(9);
      const result = await read(conteudoMartechHome);
      expect(result).toMatchObject({ siteName: "Conteúdo Martech", title: "Conteúdo Martech — Marketing, Tecnologia e Educação", statusCode: 200 });
      expect(result.markdown.length).toBeGreaterThan(1000);
      expect(result.links).toHaveLength(25);
      expect(result.images).toHaveLength(30);
      expect(result.screenshotUrl).toMatch(/^https:\/\/storage\.googleapis\.com\/firecrawl-scrape-media\/screenshot-/);
      expect(result.branding?.colors).toEqual(["#0178E6", "#B06BFF", "#FFFFFF", "#0E0914", "#CC3366"]);
      expect(result.branding?.fonts).toEqual(["Inter"]);
      // The real logo is an SVG (never a candidate), so the site's share image and favicon are what is left.
      expect(result.logoCandidates).toEqual(expect.arrayContaining(["https://conteudomartech.com.br/wp-content/uploads/2026/03/Design-sem-nome.png"]));
      for (const candidate of result.logoCandidates ?? []) expect(candidate).not.toMatch(/\.(?:svg|ico)$/i);
    });

    it("reads the real 404 of the same site as site_unavailable (billed), not as a broken answer", async () => {
      const error = await fail(conteudoMartech404);
      expect(error.message).toBe("site_unavailable");
      expect(error.unbilled).toBe(false);
    });

    it("takes the first non-empty entry of a list for the name, the title and the logo candidates", async () => {
      const result = await read(scrapeBody({ metadata: {
        title: ["", "  ", "Primeiro título", "Segundo"], "og:site_name": [[], "Marca A", "Marca B"], statusCode: 200,
        "og:image": ["", "https://example.com/share.png", "https://example.com/other.png"],
      } }));
      expect(result).toMatchObject({ title: "Primeiro título", siteName: "Marca A" });
      // The list's first usable entry is a candidate; the ones after it are not.
      expect(result.logoCandidates).toContain("https://example.com/share.png");
      expect(result.logoCandidates).not.toContain("https://example.com/other.png");
    });

    it("an unknown or oddly typed metadata field never rejects the answer", async () => {
      const result = await read(scrapeBody({ metadata: {
        title: "T", ogSiteName: ["Marca"], "og:site_name": 42, statusCode: "200", description: { nested: true }, language: [null, "pt-BR"], keywords: true,
        "twitter:image": [1, 2], novoCampoDoFirecrawl: { a: [1, { b: null }] }, creditsUsed: "1",
      } }));
      expect(result).toMatchObject({ title: "T", siteName: "Marca", statusCode: 200 });
    });

    it("only the envelope is mandatory: markdown, links, images, screenshot and branding may be missing, null or of another kind", async () => {
      const result = await read({ success: true, data: { markdown: null, links: null, images: "nenhuma", screenshot: 7, metadata: null, branding: "x" } });
      expect(result).toMatchObject({ title: null, siteName: null, markdown: "", links: [], images: [], screenshotUrl: null, statusCode: 200 });
      expect(result.branding).toEqual({ colors: [], fonts: [] });
      await expect(read({ success: true, data: {} })).resolves.toMatchObject({ markdown: "", links: [], images: [] });
    });

    it("keeps what is readable inside a malformed list or branding block", async () => {
      const result = await read(scrapeBody({
        links: ["https://example.com/a", 3, null, { href: "x" }], images: ["https://example.com/a.png", null, 7],
        branding: { logo: { url: "x" }, images: [], colors: { primary: ["#111111"], secondary: 5, third: "#222222", fourth: "azul" },
          fonts: [{ role: "body" }, { family: ["Inter", "x"] }, "Roboto", null], typography: { fontFamilies: "x" } },
      }));
      expect(result.links).toEqual(["https://example.com/a"]);
      expect(result.images).toEqual([{ url: "https://example.com/a.png" }]);
      expect(result.branding?.colors).toEqual(["#111111", "#222222"]);
      expect(result.branding?.fonts).toEqual(["Inter"]);
    });

    it("a status code that is not a number is read as 200; a numeric one still decides", async () => {
      await expect(read(scrapeBody({ metadata: { statusCode: null } }))).resolves.toMatchObject({ statusCode: 200 });
      expect((await fail(scrapeBody({ metadata: { statusCode: 503 } }))).message).toBe("site_unavailable");
    });

    it.each(["404", " 404 ", [404], ["404"], [null, "404"], "503", [[503]]])("a status code given as %j (numeric text or a list) still makes the site unavailable: an error page is not the brand's site", async (statusCode) => {
      const error = await fail(scrapeBody({ markdown: "Página não encontrada", metadata: { title: "Página não encontrada", statusCode } }));
      expect(error.message).toBe("site_unavailable");
      expect(error.unbilled).toBe(false);
    });

    it.each(["200", [200], ["200", 404], 200.0, "abc", "40", "4040", "404x", true, {}, []])("a status code given as %j is a 200 (or an unknown one, read as 200): never a guess that the site is down", async (statusCode) => {
      await expect(read(scrapeBody({ metadata: { statusCode } }))).resolves.toMatchObject({ statusCode: expect.any(Number) });
      expect((await read(scrapeBody({ metadata: { statusCode } }))).statusCode).toBeLessThan(400);
    });

    describe("what Firecrawl says it charged (ticket 13, D-5)", () => {
      it("reads creditsUsed from the answer: the real home of the owner's site cost 1 credit, and so did its real 404", async () => {
        expect((await read(conteudoMartechHome)).creditsUsed).toBe(1);
        const error = await fail(conteudoMartech404);
        expect(error.message).toBe("site_unavailable");
        expect(error.creditsUsed).toBe(1);
      });

      it.each([[1, 1], ["2", 2], [[3], 3], [[null, "4"], 4], [0, 0], [" 5 ", 5], [1.5, 1.5]])("reads %j as %j", async (given, expected) => {
        expect((await read(scrapeBody({ metadata: { title: "T", statusCode: 200, creditsUsed: given } }))).creditsUsed).toBe(expected);
      });

      it.each([undefined, null, -1, "abc", "", true, {}, [], "1e3", Number.NaN, "9999999"])("has no count when the answer says %j (unknown, never invented)", async (given) => {
        const result = await read(scrapeBody({ metadata: { title: "T", statusCode: 200, ...(given === undefined ? {} : { creditsUsed: given }) } }));
        expect(result).not.toHaveProperty("creditsUsed");
      });

      it("a charged error page carries its credits too, and an answer that did not say stays unknown", async () => {
        expect((await fail(scrapeBody({ metadata: { statusCode: 404, creditsUsed: "1" } }))).creditsUsed).toBe(1);
        expect((await fail(scrapeBody({ metadata: { statusCode: 404 } }))).creditsUsed).toBeUndefined();
      });
    });

    it("an envelope that is not one still fails as billed/uncertain reading_failed", async () => {
      for (const body of [null, [], "ok", 3, { success: "yes", data: {} }, { success: true }, { success: true, data: null }, { success: true, data: [] }, { success: true, data: "x" }]) {
        const error = await fail(body);
        expect(error.message).toBe("reading_failed");
        expect(error.unbilled).toBe(false);
      }
    });

    it("a failure body with oddly typed code and error is still a billed reading_failed", async () => {
      const error = await fail({ success: false, code: 5, error: ["DNS_ERROR"] });
      expect(error.message).toBe("reading_failed");
      expect(error.unbilled).toBe(false);
    });
  });
});
