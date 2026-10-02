// What Firecrawl says it charged (`metadata.creditsUsed`) and how the reader reads it (ticket 13, D-5): a non-negative count, as a number, as numeric text or as a
// list of them; anything else is unknown and the result carries no `creditsUsed`. A charged 404 carries it on the error.
import { describe, expect, it } from "vitest";
import { FirecrawlSiteReader, SiteReaderError } from "./firecrawl";
import type { ResolvedAddress } from "../safe-image-download";

const lookup = async (): Promise<ResolvedAddress[]> => [{ address: "93.184.216.34", family: 4 }];
const read = (metadata: Record<string, unknown>) => new FirecrawlSiteReader({ apiKey: "k", lookup, fetch: async () => new Response(JSON.stringify({ success: true,
  data: { markdown: "Marca", links: [], images: [], metadata: { title: "Marca", statusCode: 200, ...metadata }, branding: {} } }), { status: 200 }) }).read("https://example.com/");

const UNKNOWN = "unknown" as const;
const TABLE: Array<[string, unknown, number | typeof UNKNOWN]> = [
  ["number 1", 1, 1], ["number 5", 5, 5], ["number 0 (a charge of nothing is known)", 0, 0], ["fraction", 2.5, 2.5], ["negative number", -1, UNKNOWN],
  ["text 1", "1", 1], ["text with spaces", "  3 ", 3], ["text with a fraction", "1.5", 1.5], ["text 0", "0", 0], ["text 999999 (6 digits)", "999999", 999999],
  ["text 9999999 (7 digits)", "9999999", UNKNOWN], ["text in scientific notation", "1e3", UNKNOWN], ["text that is not a number", "abc", UNKNOWN], ["text with a unit", "1 credit", UNKNOWN],
  ["negative text", "-1", UNKNOWN], ["empty text", "", UNKNOWN], ["text with a sign", "+2", UNKNOWN],
  ["list [2]", [2], 2], ["list of text [\"4\"]", ["4"], 4], ["list, first readable [null, \"3\", 9]", [null, "3", 9], 3], ["nested list [[2]]", [[2]], 2], ["list [\"x\", -1, 6]", ["x", -1, 6], 6], ["empty list", [], UNKNOWN],
  ["list of unreadable items", [null, true, {}, "x", -2], UNKNOWN], ["boolean true", true, UNKNOWN], ["boolean false", false, UNKNOWN], ["null", null, UNKNOWN], ["object", { credits: 1 }, UNKNOWN],
];

describe("FirecrawlSiteReader: metadata.creditsUsed", () => {
  it.each(TABLE)("%s", async (_name, value, expected) => {
    const result = await read({ creditsUsed: value });
    if (expected === UNKNOWN) expect(result).not.toHaveProperty("creditsUsed");
    else expect(result.creditsUsed).toBe(expected);
  });

  it("a missing field is unknown", async () => {
    expect(await read({})).not.toHaveProperty("creditsUsed");
  });

  describe("the same on a charged error page (site_unavailable)", () => {
    it.each(TABLE)("%s", async (_name, value, expected) => {
      const error = await read({ statusCode: 404, creditsUsed: value }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(SiteReaderError);
      expect(error).toMatchObject({ message: "site_unavailable", unbilled: false });
      expect((error as SiteReaderError).creditsUsed).toBe(expected === UNKNOWN ? undefined : expected);
    });
  });

  it("the credits never come from anywhere but metadata", async () => {
    const reader = new FirecrawlSiteReader({ apiKey: "k", lookup, fetch: async () => new Response(JSON.stringify({ success: true, creditsUsed: 7,
      data: { markdown: "m", links: [], images: [], creditsUsed: 8, metadata: { title: "T" }, branding: { creditsUsed: 9 } } }), { status: 200 }) });
    expect(await reader.read("https://example.com/")).not.toHaveProperty("creditsUsed");
  });
});
