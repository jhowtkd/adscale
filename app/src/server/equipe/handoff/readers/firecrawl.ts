import { env } from "@/server/validation/env";
import { z } from "zod";
import { normalizeSource } from "../source";
import { resolvePublicUrl, abortable, type ResolvedAddress } from "../safe-image-download";
import type { SiteReader, SiteReadResult } from "./index";

export class SiteReaderError extends Error {
  constructor(code: string, readonly unbilled = false) { super(code); }
}
const responseSchema = z.object({
  success: z.boolean(), error: z.string().optional(), code: z.string().optional(),
  data: z.object({
    markdown: z.string().default(""), links: z.array(z.string()).default([]), images: z.array(z.string()).default([]), screenshot: z.string().nullish(),
    metadata: z.object({ title: z.string().nullish(), ogSiteName: z.string().nullish(), "og:site_name": z.string().nullish(), statusCode: z.number().optional() }).passthrough().default({}),
    branding: z.object({ logo: z.string().nullish(), images: z.object({ logo: z.string().nullish(), favicon: z.string().nullish(), ogImage: z.string().nullish() }).nullish(),
      colors: z.record(z.string().nullish()).nullish(), fonts: z.array(z.object({ family: z.string() })).nullish(),
      typography: z.object({ fontFamilies: z.record(z.string().nullish()).nullish() }).nullish(),
    }).nullish(),
  }).optional(),
});
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
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success) throw new SiteReaderError("reading_failed");
    const body = parsed.data;
    if (!body.success || !body.data) {
      // Only explicit site-DNS failures are known to be free; transport/HTTP errors remain charged/uncertain.
      const dns = !body.success && (/^(?:DNS_ERROR|DNS_RESOLUTION_ERROR|ENOTFOUND)$/i.test(body.code ?? "") || /(?:net::ERR_NAME_NOT_RESOLVED|\bENOTFOUND\b)/.test(body.error ?? ""));
      // Distinguish proof from the dispatched response from a local preflight on a retry.
      throw new SiteReaderError(dns ? "site_provider_dns" : "reading_failed", dns);
    }
    const d = body.data; const b = d.branding;
    if ((d.metadata.statusCode ?? 200) >= 400) throw new SiteReaderError("site_unavailable");
    const publicUrl = (candidate: string | null | undefined) => {
      if (!candidate || candidate.length > 4000) return null;
      try { const u = new URL(candidate, url); return ["http:", "https:"].includes(u.protocol) && !u.username && !u.password ? u.toString() : null; } catch { return null; }
    };
    const logo = publicUrl(b?.logo ?? b?.images?.logo);
    const colors = [...new Set(Object.values(b?.colors ?? {}).filter((v): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v)))].slice(0, 6);
    const fonts = [...new Set([...(b?.fonts ?? []).map(f => f.family), ...Object.values(b?.typography?.fontFamilies ?? {}).filter((v): v is string => typeof v === "string")])].map(f => f.slice(0, 100)).slice(0, 8);
    return { title: d.metadata.title ?? null, siteName: d.metadata.ogSiteName ?? d.metadata["og:site_name"] ?? null,
      markdown: d.markdown.slice(0, 50000), links: d.links.map(publicUrl).filter((v): v is string => v !== null).slice(0, 1000),
      images: [...new Set(d.images.map(publicUrl).filter((v): v is string => v !== null))].slice(0, 30).map(url => ({ url })),
      screenshotUrl: publicUrl(d.screenshot), statusCode: d.metadata.statusCode ?? 200,
      branding: { ...(logo ? { logo: { url: logo } } : {}), colors, fonts },
      logoCandidates: [...new Set([logo, d.metadata["apple-touch-icon"], d.metadata.appleTouchIcon, b?.images?.favicon, d.metadata.favicon,
        b?.images?.ogImage, d.metadata.ogImage, d.metadata["og:image"], ...d.images.filter(v => /logo|apple-touch-icon|favicon|icon-\d/i.test(v))]
        .filter((v): v is string => typeof v === "string").map(publicUrl).filter((v): v is string => v !== null))]
        .filter(v => !/\.(?:svg|ico)$/i.test(new URL(v).pathname)).slice(0, 3) };
  }
}
