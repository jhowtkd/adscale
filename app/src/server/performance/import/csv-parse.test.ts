import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv-parse";

describe("parseCsv", () => {
  it("parses comma-delimited rows with quoted fields", () => {
    const content = [
      "derivation,platform,placement",
      'uuid-1,meta,"Instagram Feed"',
      'uuid-2,google,Search',
    ].join("\n");

    const result = parseCsv(content);

    expect(result.detectedDelimiter).toBe(",");
    expect(result.headers).toEqual(["derivation", "platform", "placement"]);
    expect(result.rows).toEqual([
      ["uuid-1", "meta", "Instagram Feed"],
      ["uuid-2", "google", "Search"],
    ]);
  });

  it("detects semicolon delimiter", () => {
    const content = "a;b;c\n1;2;3";
    const result = parseCsv(content);
    expect(result.detectedDelimiter).toBe(";");
    expect(result.rows[0]).toEqual(["1", "2", "3"]);
  });

  it("handles escaped quotes inside quoted fields", () => {
    const content = 'name,value\n"Say ""Hi""",10';
    const result = parseCsv(content);
    expect(result.rows[0]).toEqual(['Say "Hi"', "10"]);
  });

  it("caps rows at the configured maximum", () => {
    const lines = ["h1,h2"];
    for (let i = 0; i < 12; i += 1) {
      lines.push(`${i},${i}`);
    }
    const result = parseCsv(lines.join("\n"), { maxRows: 10 });
    expect(result.rows).toHaveLength(10);
    expect(result.truncated).toBe(true);
  });

  it("strips UTF-8 BOM from content", () => {
    const result = parseCsv("\uFEFFa,b\n1,2");
    expect(result.headers).toEqual(["a", "b"]);
  });
});
