import { env } from "@/server/validation/env";
import { normalizeSource } from "../source";
import { resolvePublicUrl, abortable, type ResolvedAddress } from "../safe-image-download";
import type { SiteReader, SiteReadResult } from "./index";

export class SiteReaderError extends Error {
  constructor(code: string, readonly unbilled = false) { super(code); }
}
// The answer is paid for before it is read, so only its envelope (`success`, `data`) may reject it. Everything else is optional and read
// leniently: Firecrawl documents metadata as "a string or an array of strings" (two <meta og:site_name> tags come back as a list), and any
// field may be missing, null or of a kind this code has not seen. A field that cannot be read is skipped; it never costs the whole page.
type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
/** The first non-empty text of a value: a string as it is, a list by its first item that has one. */
const firstText = (value: unknown): string | undefined => {
  if (typeof value === "string") return value.trim() ? value : undefined;
  if (Array.isArray(value)) for (const item of value) { const text = firstText(item); if (text) return text; }
  return undefined;
};
/** A status code as Firecrawl reports it: a number, numeric text ("404") or a list of them. Anything else is unknown, read as 200: only a status of 400 or more, proven, makes a site unavailable. */
const statusOf = (value: unknown): number | undefined => {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") return /^\s*\d{3}\s*$/.test(value) ? Number(value) : undefined;
  if (Array.isArray(value)) for (const item of value) { const status = statusOf(item); if (status !== undefined) return status; }
  return undefined;
};
const textList = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const object = (value: unknown): Json => isObject(value) ? value : {};
export type FirecrawlReaderOptions = { apiKey?: string; fetch?: typeof fetch; lookup?: (host: string) => Promise<ResolvedAddress[]>; timeoutMs?: number; beforeRequest?: () => Promise<boolean> };
export class FirecrawlSiteReader implements SiteReader {
  constructor(private readonly options: FirecrawlReaderOptions = {}) {}
  async read(value: string): Promise<SiteReadResult> {
    const apiKey = this.options.apiKey ?? env.FIRECRAWL_API_KEY;
    if (!apiKey) throw new SiteReaderError("reader_unavailable", true);
    const signal = AbortSignal.timeout(this.options.timeoutMs ?? 65_000);
    let url: string;
    try { url = normalizeSource("site", value).normalized; }
    catch { throw new SiteReaderError("invalid_site", true); }
    try { await abortable(resolvePublicUrl(url, this.options.lookup), signal); }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const unbilled = code === "ENOTFOUND" || code === "ENODATA" || (error instanceof Error && error.message.startsWith("unsafe_image_"));
      throw new SiteReaderError(unbilled ? "site_dns_or_address" : "reading_not_started", true); // No request was sent.
    }
    if (this.options.beforeRequest && !(await this.options.beforeRequest())) throw new SiteReaderError("reading_failed");
    const response = await (this.options.fetch ?? fetch)("https://api.firecrawl.dev/v2/scrape", {
      method: "POST", redirect: "error", signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown", "links", "images", "screenshot", "branding"], timeout: 60_000 }),
    });
    if (!response.ok) throw new SiteReaderError("reading_failed");
    const body: unknown = await response.json();
    if (!isObject(body) || typeof body.success !== "boolean") throw new SiteReaderError("reading_failed");
    if (!body.success || !isObject(body.data)) {
      // Only explicit site-DNS failures are known to be free; transport/HTTP errors remain charged/uncertain.
      const code = typeof body.code === "string" ? body.code : "", message = typeof body.error === "string" ? body.error : "";
      const dns = !body.success && (/^(?:DNS_ERROR|DNS_RESOLUTION_ERROR|ENOTFOUND)$/i.test(code) || /(?:net::ERR_NAME_NOT_RESOLVED|\bENOTFOUND\b)/.test(message));
      // Distinguish proof from the dispatched response from a local preflight on a retry.
      throw new SiteReaderError(dns ? "site_provider_dns" : "reading_failed", dns);
    }
    const d = body.data, meta = object(d.metadata), b = object(d.branding), branded = object(b.images);
    const statusCode = statusOf(meta.statusCode) ?? 200;
    if (statusCode >= 400) throw new SiteReaderError("site_unavailable");
    const publicUrl = (candidate: string | null | undefined) => {
      if (!candidate || candidate.length > 4000) return null;
      try { const u = new URL(candidate, url); return ["http:", "https:"].includes(u.protocol) && !u.username && !u.password ? u.toString() : null; } catch { return null; }
    };
    const logo = publicUrl(firstText(b.logo) ?? firstText(branded.logo));
    const colors = [...new Set(Object.values(object(b.colors)).map(firstText).filter((v): v is string => !!v && /^#[0-9a-f]{6}$/i.test(v)))].slice(0, 6);
    const fonts = [...new Set([...(Array.isArray(b.fonts) ? b.fonts : []).map(f => firstText(object(f).family)),
      ...Object.values(object(object(b.typography).fontFamilies)).map(firstText)].filter((v): v is string => !!v))].map(f => f.slice(0, 100)).slice(0, 8);
    const images = textList(d.images);
    return { title: firstText(meta.title) ?? null, siteName: firstText(meta.ogSiteName) ?? firstText(meta["og:site_name"]) ?? null,
      markdown: (typeof d.markdown === "string" ? d.markdown : "").slice(0, 50000), links: textList(d.links).map(publicUrl).filter((v): v is string => v !== null).slice(0, 1000),
      images: [...new Set(images.map(publicUrl).filter((v): v is string => v !== null))].slice(0, 30).map(url => ({ url })),
      screenshotUrl: publicUrl(firstText(d.screenshot)), statusCode,
      branding: { ...(logo ? { logo: { url: logo } } : {}), colors, fonts },
      logoCandidates: [...new Set([logo, meta["apple-touch-icon"], meta.appleTouchIcon, branded.favicon, meta.favicon,
        branded.ogImage, meta.ogImage, meta["og:image"], ...images.filter(v => /logo|apple-touch-icon|favicon|icon-\d/i.test(v))]
        .map(firstText).filter((v): v is string => !!v).map(publicUrl).filter((v): v is string => v !== null))]
        .filter(v => !/\.(?:svg|ico)$/i.test(new URL(v).pathname)).slice(0, 3) };
  }
}
