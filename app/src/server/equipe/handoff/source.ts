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
