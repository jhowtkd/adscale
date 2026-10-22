import { describe, expect, it } from "vitest";
import {
  decodeKeysetCursor,
  encodeKeysetCursor,
  parseKeysetPageParams,
  takeKeysetPage,
} from "./keyset-page";

const ID = "0b8f7a52-3c1e-4d2a-9f6b-1a2b3c4d5e6f";
const AT = "2026-10-21T12:34:56.123456Z";
const BOUNDS = { defaultLimit: 50, maxLimit: 100 };
const b64 = (value: unknown) =>
  Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");

describe("keyset cursor", () => {
  it("round-trips keeping the six fractional digits", () => {
    const encoded = encodeKeysetCursor({ at: AT, id: ID });
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeKeysetCursor(encoded)).toEqual({ at: AT, id: ID });
    expect(JSON.parse(Buffer.from(encoded, "base64url").toString())).toEqual({ v: 1, at: AT, id: ID });
  });

  it.each([
    ["unknown version", b64({ v: 2, at: AT, id: ID })],
    ["missing version", b64({ at: AT, id: ID })],
    ["invalid base64/JSON", "%%%not-a-cursor"],
    ["non JSON payload", b64("hello")],
    ["null payload", b64("null")],
    ["milliseconds only", b64({ v: 1, at: "2026-10-21T12:34:56.123Z", id: ID })],
    ["missing Z", b64({ v: 1, at: "2026-10-21T12:34:56.123456", id: ID })],
    ["impossible date", b64({ v: 1, at: "2026-02-31T12:34:56.123456Z", id: ID })],
    ["impossible hour", b64({ v: 1, at: "2026-10-21T25:00:00.123456Z", id: ID })],
    ["year zero (valid in JS, refused by Postgres)", b64({ v: 1, at: "0000-01-01T00:00:00.000000Z", id: ID })],
    ["non-uuid id", b64({ v: 1, at: AT, id: "not-a-uuid" })],
    ["missing id", b64({ v: 1, at: AT })],
    ["numeric at", b64({ v: 1, at: 1234, id: ID })],
  ])("rejects %s", (_name, value) => {
    expect(decodeKeysetCursor(value)).toBeNull();
  });

  it("accepts the first valid year", () => {
    const at = "0001-01-01T00:00:00.000000Z";
    expect(decodeKeysetCursor(encodeKeysetCursor({ at, id: ID }))).toEqual({ at, id: ID });
  });
});

describe("parseKeysetPageParams", () => {
  const parse = (query: string) => parseKeysetPageParams(new URLSearchParams(query), BOUNDS);

  it("uses the default limit and no cursor", () => {
    expect(parse("")).toEqual({ limit: 50, cursor: null });
  });

  it("accepts the boundaries", () => {
    expect(parse("limit=1")?.limit).toBe(1);
    expect(parse("limit=100")?.limit).toBe(100);
  });

  it.each(["0", "101", "abc", "1.5", "-1", ""])("rejects limit=%s", (limit) => {
    expect(parse(`limit=${limit}`)).toBeNull();
  });

  it("treats an empty cursor as absent", () => {
    expect(parse("cursor=")).toEqual({ limit: 50, cursor: null });
  });

  it("decodes a valid cursor and rejects a corrupted one", () => {
    const cursor = encodeKeysetCursor({ at: AT, id: ID });
    expect(parse(`limit=5&cursor=${cursor}`)).toEqual({ limit: 5, cursor: { at: AT, id: ID } });
    expect(parse("cursor=garbage")).toBeNull();
  });
});

describe("takeKeysetPage", () => {
  const row = (n: number) => ({
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    sortAt: `2026-10-21T12:00:00.${String(n).padStart(6, "0")}Z`,
  });

  it("cuts limit+1 rows and points the cursor at the last returned row", () => {
    const rows = [row(3), row(2), row(1)];
    const page = takeKeysetPage(rows, 2);
    expect(page.items).toEqual([row(3), row(2)]);
    expect(decodeKeysetCursor(page.nextCursor!)).toEqual({ at: row(2).sortAt, id: row(2).id });
  });

  it("returns a null cursor when there are limit rows or fewer", () => {
    expect(takeKeysetPage([row(2), row(1)], 2)).toEqual({ items: [row(2), row(1)], nextCursor: null });
    expect(takeKeysetPage([row(1)], 2).nextCursor).toBeNull();
    expect(takeKeysetPage([], 2)).toEqual({ items: [], nextCursor: null });
  });
});
