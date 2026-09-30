import { isIP } from "node:net";
import type { HandoffSource } from "../domain/handoff";

export function normalizeInstagram(value: string) {
  const handle = value.trim().replace(/^https?:\/\/(?:www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/\/$/, "").toLowerCase();
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
const SOCIAL_LABELS: Record<SocialPlatform, string> = { facebook: "Facebook", tiktok: "TikTok", linkedin: "LinkedIn", youtube: "YouTube" };

/** A public address that belongs to the platform it is saved under, so a link is never filed under the wrong network. */
export function normalizeSocial(platform: SocialPlatform, value: string) {
  const { normalized } = normalizeSource("site", value);
  const host = new URL(normalized).hostname;
  if (!SOCIAL_HOSTS[platform].some(domain => host === domain || host.endsWith(`.${domain}`))) throw new Error("invalid_social");
  return normalized;
}

/** What to tell the person when the link is not one the platform serves. */
export const socialHint = (platform: SocialPlatform) => `Provide a public ${SOCIAL_LABELS[platform]} link (${SOCIAL_HOSTS[platform].join(" or ")}).`;
