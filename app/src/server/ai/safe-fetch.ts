import "server-only";

/**
 * Safe fetching of URLs returned by an upstream LLM provider (OpenAI).
 *
 * These URLs come from a trusted API response, not directly from the user,
 * but defense-in-depth still requires validating the destination before the
 * server fetches it: a compromised/replayed provider response could otherwise
 * redirect the server at an internal endpoint (SSRF to cloud metadata, RPC
 * ports, localhost services).
 *
 * The check is allowlist-based on hostname AND blocks private/reserved IP
 * ranges and common metadata endpoints.
 */

const ALLOWED_OPENAI_HOSTS = new Set([
  "oaiusercontent.com",
  "files.openai.com",
  "api.openai.com",
]);

// Hostnames that should never be the target of a server fetch.
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal", // GCP metadata
  "169.254.169.254", // AWS/Azure metadata (also caught by IP range)
]);

function isPrivateIp(host: string): boolean {
  // Normalize: strip bracket notation used for IPv6 hosts.
  const normalized = host.replace(/^\[|\]$/g, "");

  // IPv4 checks
  const v4 = normalized.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10) return true; // private
    if (a === 127) return true; // loopback
    if (a === 0) return true; // local
    if (a === 169 && b === 254) return true; // link-local (incl. cloud metadata)
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a >= 224) return true; // multicast / reserved
  }

  // IPv6 checks
  const lower = normalized.toLowerCase();
  if (lower === "::1" || lower === "::" ) return true; // loopback / unspecified
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
  if (lower.startsWith("fe80")) return true; // link-local

  return false;
}

function hostMatchesAllowed(host: string): boolean {
  const lower = host.toLowerCase();
  // Exact match or any subdomain of an allowed root.
  for (const allowed of ALLOWED_OPENAI_HOSTS) {
    if (lower === allowed) return true;
    if (lower.endsWith(`.${allowed}`)) return true;
  }
  return false;
}

export interface SafeFetchResult {
  ok: boolean;
  status: number;
  buffer: Buffer | null;
}

/**
 * Fetch a URL from an LLM provider response, enforcing an allowlist.
 * Returns a buffer on success. Throws if the URL is not on the allowlist or
 * targets a private/blocked host.
 */
export async function fetchProviderUrlSafe(
  url: string,
  timeoutMs = 30_000
): Promise<Buffer> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Refusing to fetch malformed provider URL`);
  }

  const host = parsed.hostname;

  if (BLOCKED_HOSTNAMES.has(host.toLowerCase())) {
    throw new Error(`Refusing to fetch blocked host: ${host}`);
  }
  if (isPrivateIp(host)) {
    throw new Error(`Refusing to fetch private/internal host: ${host}`);
  }
  if (!hostMatchesAllowed(host)) {
    throw new Error(`Refusing to fetch non-allowlisted host: ${host}`);
  }
  // Only https in production; allow http only for local dev loops.
  if (parsed.protocol !== "https:" && process.env.NODE_ENV === "production") {
    throw new Error(`Refusing to fetch non-https provider URL`);
  }

  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    throw new Error(
      `Failed to download provider asset: ${response.status} ${response.statusText}`
    );
  }
  return Buffer.from(await response.arrayBuffer());
}
