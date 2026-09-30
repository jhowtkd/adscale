import { describe, expect, it } from "vitest";
import { normalizeInstagram, normalizeSource } from "./source";

describe("normalizeSource: site", () => {
  it("accepts a public http(s) address and lowercases the host", () => {
    const result = normalizeSource("site", "https://Example.com/foo?x=1#frag");
    expect(result.kind).toBe("site");
    expect(result.normalized).toBe("https://example.com/foo?x=1");
  });

  it("accepts standard ports 80 and 443 explicitly", () => {
    expect(() => normalizeSource("site", "https://example.com:443/")).not.toThrow();
    expect(() => normalizeSource("site", "http://example.com:80/")).not.toThrow();
  });

  it("rejects non-http(s) protocols", () => {
    expect(() => normalizeSource("site", "ftp://example.com")).toThrow("invalid_site");
    expect(() => normalizeSource("site", "javascript:alert(1)")).toThrow();
  });

  it("rejects credentials embedded in the URL", () => {
    expect(() => normalizeSource("site", "https://user:pass@example.com")).toThrow("invalid_site");
  });

  it("rejects non-standard ports", () => {
    expect(() => normalizeSource("site", "https://example.com:8443/")).toThrow("invalid_site");
  });

  it("rejects raw IPv4 and IPv6 hosts", () => {
    expect(() => normalizeSource("site", "http://127.0.0.1/")).toThrow("invalid_site");
    expect(() => normalizeSource("site", "http://10.0.0.5/")).toThrow("invalid_site");
    expect(() => normalizeSource("site", "http://[::1]/")).toThrow("invalid_site");
  });

  it("rejects hosts without a dot (no TLD) and reserved-looking TLDs", () => {
    expect(() => normalizeSource("site", "http://intranet/")).toThrow("invalid_site");
    expect(() => normalizeSource("site", "http://site.localhost/")).toThrow("invalid_site");
    expect(() => normalizeSource("site", "http://site.internal/")).toThrow("invalid_site");
    expect(() => normalizeSource("site", "http://site.test/")).toThrow("invalid_site");
    expect(() => normalizeSource("site", "http://site.onion/")).toThrow("invalid_site");
  });

  it("rejects malformed URLs", () => {
    expect(() => normalizeSource("site", "not a url")).toThrow();
  });
});

describe("normalizeSource: instagram", () => {
  it("normalizes a profile URL, an @handle, and a bare handle to the same value", () => {
    expect(normalizeSource("instagram", "https://instagram.com/Some.Handle/").normalized).toBe("some.handle");
    expect(normalizeSource("instagram", "@Some.Handle").normalized).toBe("some.handle");
    expect(normalizeSource("instagram", "Some.Handle").normalized).toBe("some.handle");
  });

  it("rejects reserved path segments used by Instagram itself", () => {
    for (const reserved of ["p", "reel", "reels", "stories", "explore", "accounts"]) {
      expect(() => normalizeInstagram(reserved)).toThrow("invalid_instagram");
    }
  });

  it("rejects handles with invalid characters or consecutive dots", () => {
    expect(() => normalizeInstagram("bad handle")).toThrow("invalid_instagram");
    expect(() => normalizeInstagram("bad..handle")).toThrow("invalid_instagram");
    expect(() => normalizeInstagram("")).toThrow("invalid_instagram");
  });
});
