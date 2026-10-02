import { isIP } from "node:net";
import type { HandoffSource } from "../domain/handoff";

export function normalizeInstagram(value: string) {
  let handle = value.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(handle)) {
    let url: URL;
    try { url = new URL(handle); } catch { throw new Error("invalid_instagram"); }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || (url.port && !["80", "443"].includes(url.port)) || socialPlatformOf(url.hostname) !== "instagram") throw new Error("invalid_instagram");
    // A profile link is one path segment; the query (igsh, utm...) and the fragment are share noise.
    handle = url.pathname.replace(/^\//, "");
  }
  handle = handle.replace(/^@/, "").replace(/\/$/, "").toLowerCase();
  if (!/^[a-z0-9_](?:[a-z0-9_.]{0,28}[a-z0-9_])?$/.test(handle) || handle.includes("..") || ["p", "reel", "reels", "stories", "explore", "accounts"].includes(handle)) throw new Error("invalid_instagram");
  return handle;
}

/** No fetching here. Real readers/downloads must also validate DNS and pin the IP. */
export function normalizeSource(kind: HandoffSource["kind"], value: string): HandoffSource {
  if (kind === "instagram") return { kind, value, normalized: normalizeInstagram(value) };
  const url = new URL(value);
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || (url.port && !["80", "443"].includes(url.port)) || isIP(host.replace(/^\[|\]$/g, "")) || !host.includes(".") || /(^|\.)(localhost|local|internal|test|invalid|example|lan|home|onion)$/.test(host)) throw new Error("invalid_site");
  url.hostname = host; url.hash = "";
  return { kind, value, normalized: url.toString() };
}

/** Hostnames each supported platform serves profiles from. Any subdomain of them (www, m, country codes) counts too. */
export const SOCIAL_HOSTS = {
  facebook: ["facebook.com", "fb.com"],
  tiktok: ["tiktok.com"],
  linkedin: ["linkedin.com"],
  youtube: ["youtube.com", "youtu.be"],
} as const;
export type SocialPlatform = keyof typeof SOCIAL_HOSTS;
/** Instagram is its own case: a profile is kept as a handle read from the first path segment, so only the hosts that serve
 *  profiles count. help., about., business., l. and the other subdomains are not profiles, and exact matches keep them out. */
const INSTAGRAM_HOSTS: readonly string[] = ["instagram.com", "www.instagram.com", "m.instagram.com"];
const serves = (host: string, domains: readonly string[]) => domains.some(domain => host === domain || host.endsWith(`.${domain}`));
/** Which supported platform serves this hostname. Platforms kept as links accept any subdomain and their short domains. */
export function socialPlatformOf(hostname: string): "instagram" | SocialPlatform | undefined {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (INSTAGRAM_HOSTS.includes(host)) return "instagram";
  return (Object.keys(SOCIAL_HOSTS) as SocialPlatform[]).find(platform => serves(host, SOCIAL_HOSTS[platform]));
}
const SOCIAL_LABELS: Record<SocialPlatform, string> = { facebook: "Facebook", tiktok: "TikTok", linkedin: "LinkedIn", youtube: "YouTube" };

/**
 * The only query parameters that identify a profile on the supported platforms: Facebook's `profile.php?id=<number>`. A profile is otherwise its path
 * (`/@name`, `/company/name`, `/in/name`), so every other parameter is tracking: `utm_*`, `fbclid`, `igsh`, and the site's own lead identifiers
 * (`mlid`, `src`, `sck`…) that a page appends to its links per visitor. They are never kept, shown or sent anywhere (ticket 13, D-9).
 */
const IDENTITY_PARAMS: Record<SocialPlatform, readonly string[]> = { facebook: ["id"], tiktok: [], linkedin: [], youtube: [] };

/** A public address that belongs to the platform it is saved under, so a link is never filed under the wrong network. Without tracking, without a fragment. */
export function normalizeSocial(platform: SocialPlatform, value: string) {
  const url = new URL(normalizeSource("site", value).normalized);
  if (!serves(url.hostname, SOCIAL_HOSTS[platform])) throw new Error("invalid_social");
  const kept = [...url.searchParams].filter(([name, param]) => IDENTITY_PARAMS[platform].includes(name) && /^\d{1,30}$/.test(param));
  url.search = "";
  for (const [name, param] of kept) url.searchParams.append(name, param);
  return url.toString();
}

/**
 * First path segments that are NOT a profile on Facebook and YouTube: share buttons, videos, playlists, posts and utility pages. Profiles are everything else
 * there (`/acme`, `/pages/Acme/123`, `/@acme`, `/c/acme`, `/channel/UC…`), so a list of what to refuse keeps vanity names the platform allows.
 */
const NOT_A_PROFILE = {
  facebook: new Set(["sharer", "sharer.php", "share", "share.php", "dialog", "plugins", "tr", "l.php", "watch", "reel", "reels", "video", "videos", "photo", "photo.php", "photos",
    "posts", "permalink.php", "story.php", "stories", "events", "groups", "hashtag", "login", "login.php", "recover", "r.php", "ads", "business", "help", "policies", "privacy",
    "legal", "marketplace", "gaming", "notes", "search", "home.php", "settings", "flx", "ajax", "common", "composer", "public"]),
  youtube: new Set(["watch", "playlist", "shorts", "embed", "live", "results", "feed", "redirect", "attribution_link", "oembed", "v", "hashtag", "premium", "about", "t", "s",
    "signin", "account", "upload", "gaming", "music", "kids", "tv", "post", "clip", "channel_switcher", "supported_browsers", "static"]),
} as const;
/** LinkedIn and TikTok profiles have one shape each, so those two are allow-lists: `/company|in|school|showcase|pub/<name>` and `/@<name>` alone. */
const LINKEDIN_PROFILE_ROOTS: readonly string[] = ["company", "in", "school", "showcase", "pub"];

/**
 * Whether a link of a supported platform points at a PROFILE: a page that is the brand's own and still opens once its query is gone. A share button
 * (`/sharer`, `/shareArticle`), a video (`/watch`, `youtu.be/<id>`), a playlist or any other content or utility page is not a network of the brand, and what it
 * needs to open (`?v=`, `?list=`, `?u=`) is exactly what the address cleaning removes: saved, it would be a dead address (ticket 13, D-9, review of PR 614).
 * Only the capture of links found on a site asks this; a link the person types is theirs to decide.
 */
export function isSocialProfileLink(platform: SocialPlatform, value: string): boolean {
  let url: URL;
  try { url = new URL(value); } catch { return false; }
  const segments = url.pathname.split("/").filter(Boolean).map(segment => segment.toLowerCase());
  const [first, second] = segments;
  // The home page of a platform is nobody's profile.
  if (!first) return false;
  switch (platform) {
    // A TikTok profile is exactly `/@name`: `/@name/video/<id>` is a video.
    case "tiktok": return segments.length === 1 && /^@[a-z0-9_.]+$/.test(first);
    case "linkedin": return LINKEDIN_PROFILE_ROOTS.includes(first) && !!second;
    case "youtube": return url.hostname.toLowerCase() !== "youtu.be" && !NOT_A_PROFILE.youtube.has(first);
    case "facebook": return first === "profile.php" ? url.searchParams.getAll("id").some(id => /^\d{1,30}$/.test(id)) : !NOT_A_PROFILE.facebook.has(first);
  }
}

/** What to tell the person when the link is not one the platform serves. */
export const socialHint = (platform: SocialPlatform) => `Provide a public ${SOCIAL_LABELS[platform]} link (${SOCIAL_HOSTS[platform].join(" or ")}).`;
