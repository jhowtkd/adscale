export type ReaderImage = { url: string; key?: string; width?: number; height?: number };
export type SiteReadResult = {
  title: string | null; siteName: string | null; markdown: string; links: string[];
  images: ReaderImage[]; screenshotUrl: string | null; statusCode?: number;
  branding?: { logo?: ReaderImage; colors?: string[]; fonts?: string[] };
};
export type InstagramReadResult = {
  exists: boolean; isPrivate: boolean; name?: string; avatarUrl: string | null; bio: string;
  posts: Array<{ imageUrl: string; caption: string; key?: string; width?: number; height?: number }>;
  colors?: string[];
};
export interface SiteReader { read(url: string): Promise<SiteReadResult> }
export interface InstagramReader { profile(handle: string): Promise<InstagramReadResult> }
export type HandoffReaders = { site: SiteReader; instagram: InstagramReader };
export class FakeSiteReader implements SiteReader {
  readonly calls: string[] = [];
  constructor(private readonly result: SiteReadResult | Error = {
    title: "Marca de exemplo", siteName: "Marca de exemplo", markdown: "Marca de exemplo. Produtos e serviços.",
    links: ["https://www.instagram.com/marca_exemplo/"],
    images: [{ url: "/e2e/base.png", width: 1024, height: 1024 }], screenshotUrl: null, statusCode: 200,
    branding: { logo: { url: "/logo-wordmark.svg" }, colors: ["#333333", "#FFFFFF", "#6B46C1"], fonts: ["Inter"] },
  }) {}
  async read(url: string) { this.calls.push(url); if (this.result instanceof Error) throw this.result; return structuredClone(this.result); }
}
export class FakeInstagramReader implements InstagramReader {
  readonly calls: string[] = [];
  constructor(private readonly result: InstagramReadResult | Error = {
    exists: true, isPrivate: false, name: "Marca de exemplo", avatarUrl: "/logo-wordmark.svg", bio: "Produtos e serviços da marca de exemplo.",
    posts: [{ imageUrl: "/e2e/style.png", caption: "Uma publicação pública de exemplo.", width: 1024, height: 1024 }],
    colors: ["#B45309", "#FFFFFF", "#333333"],
  }) {}
  async profile(handle: string) { this.calls.push(handle); if (this.result instanceof Error) throw this.result; return structuredClone(this.result); }
}
/** Explicit fake mode only; missing/real providers fail until tickets 05/06 install them. */
export function createHandoffReaders(): HandoffReaders {
  return {
    site: process.env.SITE_READER_PROVIDER === "fake" ? new FakeSiteReader() : { async read() { throw new Error("reader_unavailable"); } },
    instagram: process.env.INSTAGRAM_READER_PROVIDER === "fake" ? new FakeInstagramReader() : { async profile() { throw new Error("reader_unavailable"); } },
  };
}
