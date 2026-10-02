import { describe, expect, it } from "vitest";
import { SOCIAL_HOSTS, isSocialProfileLink, normalizeInstagram, normalizeSocial, normalizeSource, socialPlatformOf } from "./source";

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

describe("normalizeSocial: tracking is never kept (ticket 13, D-9)", () => {
  const TRACKING = "mlid=lead_20261001_bj34rr068tp&utm_mlid=lead_20261001_bj34rr068tp&src=lead_20261001_bj34rr068tp&sck=lead_20261001_bj34rr068tp&utm_source=lead_20261001_bj34rr068tp";

  it.each([
    ["youtube", `https://www.youtube.com/@conteudomartech?${TRACKING}`, "https://www.youtube.com/@conteudomartech"],
    ["linkedin", `https://www.linkedin.com/company/conteudomartech?${TRACKING}`, "https://www.linkedin.com/company/conteudomartech"],
    ["facebook", "https://www.facebook.com/acme?fbclid=IwAR0&utm_campaign=x#sec", "https://www.facebook.com/acme"],
    ["tiktok", "https://www.tiktok.com/@acme?lang=pt-BR&is_from_webapp=1&sender_device=pc", "https://www.tiktok.com/@acme"],
    ["youtube", "https://youtu.be/abc123?si=XyZ&feature=share", "https://youtu.be/abc123"],
    ["linkedin", "https://br.linkedin.com/in/ana-souza/?trk=public_profile&originalSubdomain=br", "https://br.linkedin.com/in/ana-souza/"],
  ] as const)("the real links of the owner's site and the usual share noise lose their query: %s %s", (platform, link, expected) => {
    expect(normalizeSocial(platform, link)).toBe(expected);
  });

  it("keeps the one parameter that IS the profile: Facebook's numeric id, and nothing that rides along", () => {
    expect(normalizeSocial("facebook", "https://www.facebook.com/profile.php?id=100012345678901&sk=about&fbclid=x")).toBe("https://www.facebook.com/profile.php?id=100012345678901");
    expect(normalizeSocial("facebook", "https://www.facebook.com/profile.php?id=abc")).toBe("https://www.facebook.com/profile.php");
    expect(normalizeSocial("facebook", "https://www.facebook.com/profile.php?id=1&id=2")).toBe("https://www.facebook.com/profile.php?id=1&id=2");
    // id is only an identity on Facebook: on the others it is just a parameter.
    expect(normalizeSocial("youtube", "https://www.youtube.com/@acme?id=123")).toBe("https://www.youtube.com/@acme");
  });

  it("two links that differ only by tracking are the same link", () => {
    expect(normalizeSocial("youtube", "https://www.youtube.com/@acme?utm_source=a")).toBe(normalizeSocial("youtube", "https://www.youtube.com/@acme?mlid=b#top"));
  });

  it("still refuses a link that does not belong to the platform, tracking or not", () => {
    expect(() => normalizeSocial("youtube", "https://evil.com/@acme?utm_source=a")).toThrow("invalid_social");
    expect(() => normalizeSocial("facebook", "https://facebook.com.evil.com/acme?x=1")).toThrow("invalid_social");
  });
});

describe("normalizeInstagram: a copied profile link may carry share noise", () => {
  it("ignores the query string and the fragment of a profile link", () => {
    expect(normalizeInstagram("https://instagram.com/acme/?igsh=abc")).toBe("acme");
    expect(normalizeInstagram("https://www.instagram.com/Acme.Brand/?hl=pt-br&igsh=xyz#top")).toBe("acme.brand");
    expect(normalizeInstagram("http://instagram.com/acme?utm_source=qr")).toBe("acme");
    expect(normalizeSource("instagram", "https://instagram.com/acme/?igsh=abc").normalized).toBe("acme");
  });

  it("accepts the host variants Instagram serves profiles from", () => {
    expect(normalizeInstagram("https://m.instagram.com/acme/?igsh=abc")).toBe("acme");
    expect(normalizeInstagram("HTTPS://WWW.Instagram.com/Acme")).toBe("acme");
  });

  it("keeps the shapes it already accepted", () => {
    expect(normalizeInstagram("@Acme")).toBe("acme");
    expect(normalizeInstagram("acme")).toBe("acme");
    expect(normalizeInstagram("acme/")).toBe("acme");
    expect(normalizeInstagram("https://instagram.com/acme/")).toBe("acme");
  });

  it.each([
    "https://instagram.com/p/ABC123/?igsh=abc",
    "https://instagram.com/reel/XYZ/",
    "https://instagram.com/reels/?igsh=abc",
    "https://instagram.com/stories/acme/1/",
    "https://instagram.com/explore/?x=1",
    "https://instagram.com/accounts/login/?next=/acme/",
    "https://instagram.com/acme/reels/",
    "https://instagram.com/",
    "https://instagram.com/?igsh=abc",
    "https://evil.com/acme/?igsh=abc",
    "https://instagram.com.evil.com/acme/",
    "https://notinstagram.com/acme/",
    "https://user:pass@instagram.com/acme/",
    "https://instagram.com:8443/acme/",
    "https://instagram.com/bad..handle/",
    "ftp://instagram.com/acme/",
    "https://help.instagram.com/1896641480634370",
    "https://about.instagram.com/blog",
    "https://business.instagram.com/ads",
    "https://l.instagram.com/?u=https%3A%2F%2Facme.com",
  ])("refuses %s", (link) => {
    expect(() => normalizeInstagram(link)).toThrow("invalid_instagram");
  });
});

describe("socialPlatformOf: which platform serves a hostname", () => {
  it.each([
    ["instagram.com", "instagram"], ["www.instagram.com", "instagram"], ["m.instagram.com", "instagram"],
    ["facebook.com", "facebook"], ["m.facebook.com", "facebook"], ["fb.com", "facebook"], ["www.fb.com", "facebook"],
    ["tiktok.com", "tiktok"], ["vm.tiktok.com", "tiktok"],
    ["linkedin.com", "linkedin"], ["br.linkedin.com", "linkedin"],
    ["youtube.com", "youtube"], ["m.youtube.com", "youtube"], ["youtu.be", "youtube"],
    ["WWW.YouTube.com", "youtube"], ["facebook.com.", "facebook"],
  ])("%s is %s", (host, platform) => {
    expect(socialPlatformOf(host)).toBe(platform);
  });

  it.each([
    "example.com", "facebook.com.evil.com", "evilfacebook.com", "fakeyoutu.be", "notinstagram.com", "instagram.com.evil.io", "linkedin.evil.com", "",
    "help.instagram.com", "about.instagram.com", "business.instagram.com", "l.instagram.com", "api.instagram.com",
  ])("%s serves none", (host) => {
    expect(socialPlatformOf(host)).toBeUndefined();
  });

  it("keeps the rule for Instagram profiles narrower than the one for platforms stored as links", () => {
    // A profile is read from the first path segment, so only the hosts that serve profiles count: help., about., business. and l. are not.
    for (const host of ["instagram.com", "www.instagram.com", "m.instagram.com"]) expect(socialPlatformOf(host)).toBe("instagram");
    for (const host of ["help.instagram.com", "about.instagram.com", "business.instagram.com"]) expect(socialPlatformOf(host)).toBeUndefined();
    for (const host of ["br.linkedin.com", "m.facebook.com", "vm.tiktok.com", "music.youtube.com"]) expect(socialPlatformOf(host)).toBeDefined();
  });

  it("agrees with normalizeSocial on every hostname the platform may use", () => {
    for (const [platform, domains] of Object.entries(SOCIAL_HOSTS)) {
      for (const domain of domains) {
        expect(socialPlatformOf(domain)).toBe(platform);
        expect(socialPlatformOf(`www.${domain}`)).toBe(platform);
        expect(() => normalizeSocial(platform as keyof typeof SOCIAL_HOSTS, `https://www.${domain}/acme`)).not.toThrow();
      }
    }
  });
});

// Review of PR 614 (ticket 13, D-9): the capture of a site's links must not take a share button, a video or a playlist for a profile.
describe("isSocialProfileLink: only a profile is a network of the brand", () => {
  it.each([
    ["youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", false], ["youtube", "https://www.youtube.com/playlist?list=PL123", false], ["youtube", "https://youtu.be/dQw4w9WgXcQ", false],
    ["youtube", "https://www.youtube.com/shorts/abc", false], ["youtube", "https://www.youtube.com/embed/abc", false], ["youtube", "https://www.youtube.com/results?search_query=x", false],
    ["youtube", "https://www.youtube.com/", false], ["youtube", "https://www.youtube.com/@marca", true], ["youtube", "https://www.youtube.com/c/Marca", true],
    ["youtube", "https://www.youtube.com/user/marca", true], ["youtube", "https://www.youtube.com/channel/UCabc", true], ["youtube", "https://www.youtube.com/marca-oficial", true],
    ["youtube", "https://m.youtube.com/@marca?si=x", true], ["youtube", "https://www.youtube.com/WATCH?v=1", false],
    ["facebook", "https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Facme.com", false], ["facebook", "https://www.facebook.com/sharer.php?u=x", false],
    ["facebook", "https://www.facebook.com/share.php?u=x", false], ["facebook", "https://www.facebook.com/dialog/share?href=x", false], ["facebook", "https://www.facebook.com/plugins/like.php?href=x", false],
    ["facebook", "https://www.facebook.com/watch/?v=1", false], ["facebook", "https://www.facebook.com/", false], ["facebook", "https://www.facebook.com/profile.php", false],
    ["facebook", "https://www.facebook.com/profile.php?id=abc", false], ["facebook", "https://www.facebook.com/profile.php?id=100012345", true],
    ["facebook", "https://www.facebook.com/profile.php?id=abc&id=42", true], ["facebook", "https://www.facebook.com/marca.oficial", true], ["facebook", "https://fb.com/marca", true],
    ["facebook", "https://www.facebook.com/pages/Acme/123456", true], ["facebook", "https://www.facebook.com/people/Ana/100012345/", true], ["facebook", "https://www.facebook.com/SHARER/sharer.php", false],
    ["linkedin", "https://www.linkedin.com/shareArticle?mini=true&url=https%3A%2F%2Facme.com", false], ["linkedin", "https://www.linkedin.com/sharing/share-offsite/?url=x", false],
    ["linkedin", "https://www.linkedin.com/feed/", false], ["linkedin", "https://www.linkedin.com/", false], ["linkedin", "https://www.linkedin.com/company/", false],
    ["linkedin", "https://www.linkedin.com/company/acme/", true], ["linkedin", "https://br.linkedin.com/in/ana", true], ["linkedin", "https://www.linkedin.com/school/uni", true],
    ["linkedin", "https://www.linkedin.com/showcase/acme-x", true], ["linkedin", "https://www.linkedin.com/COMPANY/acme", true],
    ["tiktok", "https://www.tiktok.com/@acme", true], ["tiktok", "https://www.tiktok.com/@acme?lang=pt-BR&_t=abc", true], ["tiktok", "https://www.tiktok.com/@acme/video/123", false],
    ["tiktok", "https://www.tiktok.com/share/video/123", false], ["tiktok", "https://vm.tiktok.com/ZSabc/", false], ["tiktok", "https://www.tiktok.com/", false],
    ["tiktok", "https://www.tiktok.com/tag/marca", false], ["tiktok", "https://www.tiktok.com/music/x-123", false],
  ] as const)("%s %s → %s", (platform, link, expected) => {
    expect(isSocialProfileLink(platform, link)).toBe(expected);
  });

  it("is false for anything that is not a link", () => {
    for (const value of ["", "not a link", "//www.youtube.com/@x", "@acme"]) {
      for (const platform of ["facebook", "youtube", "linkedin", "tiktok"] as const) expect(isSocialProfileLink(platform, value), `${platform} ${value}`).toBe(false);
    }
  });

  it("never throws, whatever it is given", () => {
    for (const value of ["https://", "http://[", "https://exa mple.com/@x", "javascript:alert(1)", "https://www.youtube.com/%E0%A4%A"]) {
      for (const platform of ["facebook", "youtube", "linkedin", "tiktok"] as const) expect(() => isSocialProfileLink(platform, value)).not.toThrow();
    }
  });
});
