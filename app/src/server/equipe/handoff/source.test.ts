import { describe, expect, it } from "vitest";
import { SOCIAL_HOSTS, normalizeInstagram, normalizeSocial, normalizeSource } from "./source";

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

describe("normalizeSocial: a link must belong to the platform it is saved under", () => {
  it.each([
    ["facebook", "https://facebook.com/acme"],
    ["facebook", "https://www.facebook.com/acme"],
    ["facebook", "https://m.facebook.com/acme"],
    ["facebook", "https://pt-br.facebook.com/acme"],
    ["facebook", "https://fb.com/acme"],
    ["facebook", "https://www.fb.com/acme"],
    ["tiktok", "https://www.tiktok.com/@acme"],
    ["tiktok", "https://vm.tiktok.com/ZM8abc/"],
    ["linkedin", "https://linkedin.com/company/acme"],
    ["linkedin", "https://www.linkedin.com/company/acme"],
    ["linkedin", "https://br.linkedin.com/company/acme"],
    ["youtube", "https://youtube.com/@acme"],
    ["youtube", "https://www.youtube.com/@acme"],
    ["youtube", "https://m.youtube.com/@acme"],
    ["youtube", "https://youtu.be/abc123"],
  ] as const)("accepts %s on %s", (platform, url) => {
    expect(normalizeSocial(platform, url)).toBe(new URL(url).toString());
  });

  it("lowercases the host like any other public address", () => {
    expect(normalizeSocial("facebook", "https://WWW.Facebook.com/Acme")).toBe("https://www.facebook.com/Acme");
  });

  it.each([
    ["facebook", "https://unrelated.com/acme"],
    ["facebook", "https://facebook.com.evil.com/acme"],
    ["facebook", "https://evilfacebook.com/acme"],
    ["facebook", "https://notfb.com/acme"],
    ["facebook", "https://youtu.be/abc123"],
    ["tiktok", "https://tiktok.com.evil.io/@acme"],
    ["tiktok", "https://www.facebook.com/acme"],
    ["linkedin", "https://linkedin.evil.com/company/acme"],
    ["linkedin", "https://fakelinkedin.com/company/acme"],
    ["youtube", "https://www.facebook.com/acme"],
    ["youtube", "https://youtube.evil.com/@acme"],
    ["youtube", "https://fakeyoutu.be/abc123"],
  ] as const)("refuses %s on %s", (platform, url) => {
    expect(() => normalizeSocial(platform, url)).toThrow("invalid_social");
  });

  it("still applies the public-address rules before looking at the platform", () => {
    expect(() => normalizeSocial("facebook", "https://facebook.com@evil.com/acme")).toThrow("invalid_site");
    expect(() => normalizeSocial("youtube", "https://youtube.com:8443/@acme")).toThrow("invalid_site");
    expect(() => normalizeSocial("youtube", "ftp://youtube.com/@acme")).toThrow("invalid_site");
    expect(() => normalizeSocial("facebook", "not a url")).toThrow();
  });

  it("names every supported platform's hostnames, www/m subdomains and short domains included", () => {
    expect(SOCIAL_HOSTS).toEqual({
      facebook: ["facebook.com", "fb.com"], tiktok: ["tiktok.com"], linkedin: ["linkedin.com"], youtube: ["youtube.com", "youtu.be"],
    });
  });
});
