// What Firecrawl's `metadata.statusCode` may look like, and what each shape means (ticket 13, review of PR 614): a status of 400 or more, PROVEN, makes the
// site unavailable (billed: Firecrawl answered); anything the reader cannot read as a status is unknown and reads as 200, never as a failure.
import { describe, expect, it } from "vitest";
import { FirecrawlSiteReader, SiteReaderError } from "./firecrawl";
import type { ResolvedAddress } from "../safe-image-download";

const lookup = async (): Promise<ResolvedAddress[]> => [{ address: "93.184.216.34", family: 4 }];
const read = (metadata: Record<string, unknown>) => new FirecrawlSiteReader({ apiKey: "k", lookup, fetch: async () => new Response(JSON.stringify({ success: true,
  data: { markdown: "Marca", links: [], images: [], metadata: { title: "Marca", ...metadata }, branding: {} } }), { status: 200 }) }).read("https://example.com/");

const UNAVAILABLE = "unavailable" as const;
// [description, value of statusCode, expected statusCode of the result, or UNAVAILABLE]
const TABLE: Array<[string, unknown, number | typeof UNAVAILABLE]> = [
  ["number 200", 200, 200], ["number 301", 301, 301], ["number 399", 399, 399], ["number 400", 400, UNAVAILABLE], ["number 404", 404, UNAVAILABLE], ["number 503", 503, UNAVAILABLE],
  ["number 600 (3 digits past the range)", 600, UNAVAILABLE], ["number 99 (below the range)", 99, 99], ["number 0", 0, 0], ["negative number", -5, -5], ["a fraction below 400", 399.5, 399.5],
  ["text 404", "404", UNAVAILABLE], ["text with spaces", "  404 ", UNAVAILABLE], ["text 200", "200", 200], ["text 600", "600", UNAVAILABLE], ["text 099", "099", 99],
  ["text with 2 digits", "99", 200], ["text with 4 digits", "4040", 200], ["text with a suffix", "404 Not Found", 200], ["text that is not a number", "ok", 200], ["empty text", "", 200], ["text with a sign", "+404", 200],
  ["list [404]", [404], UNAVAILABLE], ["list of text [\"404\"]", ["404"], UNAVAILABLE], ["list, first known wins [200, 404]", [200, 404], 200], ["list, first known wins [\"x\", 503]", ["x", 503], UNAVAILABLE],
  ["list with null first [null, 404]", [null, 404], UNAVAILABLE], ["nested list [[404]]", [[404]], UNAVAILABLE], ["nested list [[], [\"200\"]]", [[], ["200"]], 200], ["empty list", [], 200],
  ["list of unreadable items", [null, true, {}, "x"], 200], ["boolean true", true, 200], ["boolean false", false, 200], ["null", null, 200], ["object", { statusCode: 404 }, 200], ["object with code", { code: 404 }, 200],
];

describe("FirecrawlSiteReader: metadata.statusCode", () => {
  it.each(TABLE)("%s", async (_name, value, expected) => {
    if (expected === UNAVAILABLE) {
      const error = await read({ statusCode: value }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(SiteReaderError);
      expect(error).toMatchObject({ message: "site_unavailable", unbilled: false });
    } else {
      const result = await read({ statusCode: value });
      expect(result.statusCode).toBe(expected);
      expect(result.statusCode).toBeLessThan(400);
      expect(typeof result.statusCode).toBe("number");
    }
  });

  it("a missing status reads as 200", async () => {
    expect((await read({})).statusCode).toBe(200);
  });

  it("the status is read from metadata only: a status elsewhere in the answer never makes the site unavailable", async () => {
    const reader = new FirecrawlSiteReader({ apiKey: "k", lookup, fetch: async () => new Response(JSON.stringify({ success: true, statusCode: 500,
      data: { markdown: "m", links: [], images: [], statusCode: 404, metadata: { title: "T" }, branding: { statusCode: 404 } } }), { status: 200 }) });
    expect((await reader.read("https://example.com/")).statusCode).toBe(200);
  });
});
