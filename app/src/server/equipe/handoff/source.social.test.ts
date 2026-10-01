// A social address keeps no tracking (ticket 13, D-9): no query and no fragment, except Facebook's `profile.php?id=<number>`. The rule is an allow-list of what
// IDENTIFIES a profile, not a list of trackers, so a parameter nobody has seen yet is dropped too. Property tests (fixed seed) over the four platforms, and the
// command that stores the address.
import { describe, expect, it } from "vitest";
import { executeCommand } from "../module/commands";
import { makeTestDeps, uuid } from "../module/testing/deps";
import { HANDOFF_READ_EVENT } from "./contract";
import { SOCIAL_HOSTS, normalizeSocial, type SocialPlatform } from "./source";

function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
type Rand = () => number;
const pick = <T,>(r: Rand, items: readonly T[]): T => items[Math.floor(r() * items.length)]!;
const PLATFORMS = Object.keys(SOCIAL_HOSTS) as SocialPlatform[];
const PATHS = ["", "/", "/acme", "/Acme.Oficial/", "/@marca", "/@Marca_BR", "/company/acme-ltda", "/in/maria-silva", "/profile.php", "/pages/Acme/123", "/channel/UCabc", "/c/Acme", "/a%20b", "/x//y"];
const TRACKING = ["utm_source", "utm_medium", "fbclid", "mlid", "src", "sck", "igsh", "ref", "gclid", "_ga", "si", "feature", "lang", "x", "ID", "Id", "id[]", "idx", "profile_id"];
const VALUES = ["", "1", "abc", "12345", "007", "1.5", "-3", "%31%32", "12 34", "9".repeat(30), "9".repeat(31), "a=b", "http://evil.example/x?y=1", "%3Fq%3D1"];

function randomUrl(r: Rand, platform: SocialPlatform) {
  const domain = pick(r, SOCIAL_HOSTS[platform]);
  const sub = pick(r, ["", "", "www.", "m.", "pt-br.", "WWW.", "m.web."]);
  const host = (r() < 0.3 ? `${sub}${domain}`.toUpperCase() : `${sub}${domain}`);
  const pairs = Array.from({ length: Math.floor(r() * 5) }, () => `${r() < 0.4 ? "id" : pick(r, TRACKING)}${r() < 0.9 ? `=${pick(r, VALUES)}` : ""}`);
  const query = pairs.length || r() < 0.1 ? `?${pairs.join("&")}` : "";
  const fragment = r() < 0.3 ? `#${pick(r, ["", "top", "frag?x=1", "/a"])}` : "";
  return { url: `${pick(r, ["https", "http", "HTTPS"])}://${host}${pick(r, PATHS)}${query}${fragment}`, host };
}

describe("normalizeSocial", () => {
  it("keeps no query or fragment, except Facebook's numeric id, for 4,000 random addresses", () => {
    const r = rng(609);
    let facebookWithId = 0, cleaned = 0;
    for (let i = 0; i < 4000; i++) {
      const platform = pick(r, PLATFORMS);
      const { url } = randomUrl(r, platform);
      const input = new URL(url);
      let out: string;
      try { out = normalizeSocial(platform, url); } catch (error) { throw new Error(`${platform} ${url}: ${String(error)}`); }
      const parsed = new URL(out);
      expect(parsed.hash, url).toBe("");
      expect(parsed.hostname, url).toBe(input.hostname.toLowerCase().replace(/\.$/, ""));
      expect(parsed.pathname, url).toBe(input.pathname); // The path keeps its case and its characters.
      if (platform !== "facebook") expect(out, url).not.toContain("?");
      else for (const [name, value] of parsed.searchParams) { expect(name, url).toBe("id"); expect(value, url).toMatch(/^\d{1,30}$/); }
      if (platform === "facebook" && parsed.search) facebookWithId++;
      if (input.search || input.hash) cleaned++;
      // Idempotent: a stored address is already clean.
      expect(normalizeSocial(platform, out), url).toBe(out);
    }
    expect(facebookWithId).toBeGreaterThan(100);
    expect(cleaned).toBeGreaterThan(2000);
  });

  it("two addresses that differ only by tracking give the same result (3,000 pairs)", () => {
    const r = rng(1234);
    for (let i = 0; i < 3000; i++) {
      const platform = pick(r, PLATFORMS);
      const domain = pick(r, SOCIAL_HOSTS[platform]), path = pick(r, PATHS.slice(1));
      const id = platform === "facebook" && r() < 0.5 ? `id=${Math.floor(r() * 1e9)}` : null;
      const noise = () => Array.from({ length: Math.floor(r() * 4) }, () => `${pick(r, TRACKING.filter(k => k !== "id" && k !== "ID" && k !== "Id"))}=${pick(r, VALUES)}`);
      const build = () => { const q = [...noise(), ...(id ? [id] : [])].sort(() => r() - 0.5).join("&"); return `https://www.${domain}${path}${q ? `?${q}` : ""}${r() < 0.5 ? "#share" : ""}`; };
      expect(normalizeSocial(platform, build()), `${platform} ${path}`).toBe(normalizeSocial(platform, build()));
      expect(normalizeSocial(platform, build())).toBe(normalizeSocial(platform, `https://www.${domain}${path}${id ? `?${id}` : ""}`));
    }
  });

  it("Facebook's profile.php?id=<number> is the one query that survives, alone", () => {
    expect(normalizeSocial("facebook", "https://www.facebook.com/profile.php?id=100012345678901&fbclid=AbC&mlid=7&utm_source=x#top")).toBe("https://www.facebook.com/profile.php?id=100012345678901");
    expect(normalizeSocial("facebook", "https://fb.com/profile.php?mlid=7&id=42&src=email")).toBe("https://fb.com/profile.php?id=42");
    for (const bad of ["abc", "", "4 2", "1.5", "-3", "9".repeat(31)]) expect(normalizeSocial("facebook", `https://facebook.com/profile.php?id=${bad}`), bad).toBe("https://facebook.com/profile.php");
    // Another platform never keeps an `id`, a name that looks like it, or any parameter at all.
    for (const platform of ["tiktok", "linkedin", "youtube"] as const) expect(normalizeSocial(platform, `https://${SOCIAL_HOSTS[platform][0]}/x?id=42&v=1`)).toBe(`https://${SOCIAL_HOSTS[platform][0]}/x`);
    expect(normalizeSocial("facebook", "https://facebook.com/acme?ID=5&Id=6&id[]=7&idx=8&profile_id=9")).toBe("https://facebook.com/acme");
  });

  it("a stray ? or # leaves the bare address", () => {
    expect(normalizeSocial("tiktok", "https://www.tiktok.com/@marca?")).toBe("https://www.tiktok.com/@marca");
    expect(normalizeSocial("youtube", "https://youtu.be/abc#")).toBe("https://youtu.be/abc");
    expect(normalizeSocial("linkedin", "https://www.linkedin.com/company/acme/?#")).toBe("https://www.linkedin.com/company/acme/");
  });

  describe("an address that is not the platform's is refused, with the same codes as before", () => {
    const CASES: Array<[SocialPlatform, string, "invalid_site" | "invalid_social"]> = [
      ["facebook", "https://facebook.com.evil.com/acme", "invalid_social"], ["facebook", "https://evilfacebook.com/acme", "invalid_social"], ["facebook", "https://notfb.com/acme", "invalid_social"],
      ["facebook", "https://fb.com.br/acme", "invalid_social"], ["facebook", "https://www.instagram.com/acme", "invalid_social"], ["facebook", "https://tiktok.com/@acme", "invalid_social"],
      ["tiktok", "https://facebook.com/acme", "invalid_social"], ["linkedin", "https://youtube.com/c/acme", "invalid_social"], ["youtube", "https://evilyoutu.be/x", "invalid_social"],
      ["facebook", "https://user@facebook.com/acme", "invalid_site"], ["facebook", "https://user:pw@facebook.com/acme", "invalid_site"], ["facebook", "https://facebook.com:8080/acme", "invalid_site"],
      ["tiktok", "https://localhost/@acme", "invalid_site"], ["facebook", "https://127.0.0.1/acme", "invalid_site"], ["linkedin", "ftp://linkedin.com/company/acme", "invalid_site"],
      ["youtube", "https://youtube/c/acme", "invalid_site"], ["facebook", "https://facebook.com.internal/acme", "invalid_site"],
    ];
    it.each(CASES)("%s %s", (platform, value, code) => { expect(() => normalizeSocial(platform, value)).toThrow(new RegExp(`^${code}$`)); });

    it("a tracked link of another platform is refused whatever its query says (1,500 random)", () => {
      const r = rng(55);
      for (let i = 0; i < 1500; i++) {
        const platform = pick(r, PLATFORMS);
        const other = pick(r, PLATFORMS.filter(p => p !== platform));
        expect(() => normalizeSocial(platform, randomUrl(r, other).url)).toThrow("invalid_social");
      }
    });

    it("whatever the input, only an Error comes out, and for a well formed address its message is one of the two codes", () => {
      const r = rng(77);
      const hosts = ["facebook.com", "fb.com", "evil.com", "facebook.com.evil.com", "evilfacebook.com", "user@facebook.com", "facebook.com:99", "localhost", "10.0.0.1", "[::1]", "a.test", "xn--e1afmkfd.xn--p1ai"];
      for (let i = 0; i < 1500; i++) {
        const value = `${pick(r, ["https", "http", "ftp", "javascript", ""])}://${pick(r, hosts)}${pick(r, PATHS)}${r() < 0.5 ? "?id=1&utm_source=x" : ""}`;
        try { normalizeSocial(pick(r, PLATFORMS), value); } catch (error) { expect(error, value).toBeInstanceOf(Error); expect((error as Error).message, value).toMatch(/^(invalid_site|invalid_social|Invalid URL)$/); }
      }
    });
  });
});

describe("handoff_confirm_networks stores the address clean", () => {
  async function atNetworksStep() {
    const t = makeTestDeps();
    const workspaceId = uuid(), userId = `user-${uuid()}`;
    t.store.workspaceMembers.rows.set(uuid(), { id: uuid(), workspaceId, userId, name: "Ana", email: "a@x.com", emailVerified: true, role: "owner", createdAt: new Date("2026-01-01T00:00:00.000Z") });
    const opened = await executeCommand(t.deps, { actor: { kind: "system", job: "free-open" }, workspaceId }, { type: "open_free_account", payload: { userId } });
    if (!opened.ok) throw new Error(opened.error.code);
    const scope = { workspaceId, accountId: opened.value.accountId! };
    const [person] = await t.deps.uow.repos.people.list(scope);
    const approver = { kind: "client_person", role: "approver", personId: person!.id } as const;
    const row = async () => (await t.deps.uow.repos.handoffs.list(scope))[0]!;
    const run = async (actor: object, type: string, payload: Record<string, unknown>) => executeCommand(t.deps, { ...scope, actor } as never, { type, payload } as never);
    const h0 = await row();
    await run(approver, "handoff_set_source", { expectedStep: h0.step, expectedVersion: h0.version, kind: "site", value: "https://acme.com" });
    for (const [group, items] of [["name", [{ id: uuid(), value: "Acme", origin: "site" }]], ["logo", []], ["colors", []], ["fonts", []], ["networks", []], ["images", []]] as const) {
      const h = await row(); const g = h.reading[group]!;
      await run({ kind: "system", job: HANDOFF_READ_EVENT }, "handoff_record_group", { readingId: h.readingId!, runId: g.runId, taskIntentId: g.taskIntentId, group, result: { status: items.length ? "found" : "not_found", items } });
    }
    const h = await row();
    const confirmed = await run(approver, "handoff_confirm_identity", { expectedStep: h.step, expectedVersion: h.version, name: "Acme", logo: null, colors: [], fonts: [], paletteChoice: "site" });
    if (!confirmed.ok) throw new Error(confirmed.error.code);
    expect((await row()).step).toBe("networks");
    const confirmNetworks = async (added: Array<{ platform: string; value: string }>) => {
      const cur = await row();
      return run(approver, "handoff_confirm_networks", { expectedStep: cur.step, expectedVersion: cur.version, kept: [], added });
    };
    return { row, confirmNetworks };
  }

  it("each platform's tracked link is saved without the tracking", async () => {
    const f = await atNetworksStep();
    const outcome = await f.confirmNetworks([
      { platform: "facebook", value: "https://www.facebook.com/profile.php?id=100012345678901&fbclid=AbC&mlid=7#top" },
      { platform: "tiktok", value: "https://www.tiktok.com/@marca?utm_source=ig&sck=abc&_t=8" },
      { platform: "linkedin", value: "https://www.linkedin.com/company/acme/?trk=public&original_referer=x" },
      { platform: "youtube", value: "https://youtu.be/abc?si=zzz&feature=share" },
      { platform: "instagram", value: "https://www.instagram.com/marca_exemplo/?igsh=abc&utm_source=qr" },
    ]);
    expect(outcome.ok ? "ok" : outcome.error).toBe("ok");
    const networks = (await f.row()).decisions.networks!;
    expect(networks.map(n => [n.platform, n.value])).toEqual([
      ["facebook", "https://www.facebook.com/profile.php?id=100012345678901"], ["tiktok", "https://www.tiktok.com/@marca"],
      ["linkedin", "https://www.linkedin.com/company/acme/"], ["youtube", "https://youtu.be/abc"], ["instagram", "marca_exemplo"],
    ]);
    expect(JSON.stringify(networks)).not.toMatch(/utm_|fbclid|mlid|sck|igsh|trk|si=|feature/);
  });

  it("ten links that differ only by tracking are ten networks, and an eleventh is refused, not merged away", async () => {
    const f = await atNetworksStep();
    const link = (i: number) => ({ platform: "facebook", value: `https://www.facebook.com/acme?utm_source=s${i}&fbclid=${i}` });
    const ten = await f.confirmNetworks(Array.from({ length: 10 }, (_, i) => link(i)));
    expect(ten.ok ? "ok" : ten.error).toBe("ok");
    expect((await f.row()).decisions.networks).toHaveLength(10);
    const g = await atNetworksStep();
    const refused = await g.confirmNetworks(Array.from({ length: 11 }, (_, i) => link(i)));
    expect(refused.ok).toBe(false);
  });

  it("an address that is another platform's is still refused by the command", async () => {
    const f = await atNetworksStep();
    const outcome = await f.confirmNetworks([{ platform: "facebook", value: "https://facebook.com.evil.com/acme?utm_source=x" }]);
    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.error.code).toBe("invalid_source");
  });
});
