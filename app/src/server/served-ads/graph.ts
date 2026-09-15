import "server-only";
import { env } from "@/server/validation/env";

/**
 * Leitura da Meta Marketing API (#347). Shapes da pesquisa
 * `docs/research/2026-09-14-meta-marketing-api-creatives-insights.md`
 * (§5 Ad/AdCreative, §6 Insights level=ad). Sem #348 (Meta App),
 * `META_GRAPH_MOCK=true` usa o mock determinístico — nenhum fetch à Meta.
 */

export const META_GRAPH_VERSION = "v26.0";
const GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const OAUTH_SCOPES = ["ads_read", "ads_management", "business_management"];
/** Teto de páginas por listagem (creatives têm teto de 50k na API). */
const MAX_PAGES = 50;

export interface MetaAdAccount {
  /** Dígitos, sem prefixo act_. */
  id: string;
  name: string | null;
  currency: string;
}

export interface MetaCreative {
  id: string | null;
  body: string | null;
  title: string | null;
  imageHash: string | null;
  videoId: string | null;
  thumbnailUrl: string | null;
  isCarousel: boolean;
  isDynamic: boolean;
}

export interface MetaAd {
  id: string;
  creative: MetaCreative;
}

export interface MetaInsight {
  adId: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
}

export interface MetaMedia {
  imageUrl: string | null;
  videoUrl: string | null;
  thumbUrl: string | null;
}

export interface MetaGraphClient {
  listAdAccounts(): Promise<MetaAdAccount[]>;
  listAds(accountId: string): Promise<MetaAd[]>;
  getInsights(accountId: string, windowDays: 7 | 30 | 90): Promise<MetaInsight[]>;
  getCreativeMedia(accountId: string, creative: MetaCreative): Promise<MetaMedia>;
  exchangeCode(code: string, redirectUri: string): Promise<{ accessToken: string }>;
}

export class MetaGraphError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "MetaGraphError";
  }
}

type FetchFn = typeof fetch;

async function readJson(res: Response, what: string): Promise<Record<string, unknown>> {
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    // corpo não-JSON: erro genérico abaixo
  }
  if (!res.ok) {
    const nested = body.error as { message?: string } | undefined;
    throw new MetaGraphError(
      nested?.message ? `Meta ${what}: ${nested.message}` : `Meta ${what}: HTTP ${res.status}`,
      res.status
    );
  }
  return body;
}

/** Cliente real: System User token por conexão, Graph v26.0. */
export class RealMetaGraphClient implements MetaGraphClient {
  constructor(
    private readonly token: string,
    private readonly fetchFn: FetchFn = fetch
  ) {}

  private async get(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
    const url = new URL(`${GRAPH_BASE}${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const res = await this.fetchFn(url.toString(), {
      headers: { authorization: `Bearer ${this.token}` },
    });
    return readJson(res, `GET ${path}`);
  }

  private async getPaged(
    path: string,
    params: Record<string, string>
  ): Promise<Array<Record<string, unknown>>> {
    const out: Array<Record<string, unknown>> = [];
    let url: string | null = null;
    const first = new URL(`${GRAPH_BASE}${path}`);
    for (const [key, value] of Object.entries(params)) first.searchParams.set(key, value);
    url = first.toString();
    for (let page = 0; page < MAX_PAGES && url; page += 1) {
      const res = await this.fetchFn(url, {
        headers: { authorization: `Bearer ${this.token}` },
      });
      const body = await readJson(res, `GET ${path}`);
      const data = body.data;
      if (Array.isArray(data)) out.push(...(data as Array<Record<string, unknown>>));
      const paging = body.paging as { next?: string } | undefined;
      url = paging?.next ?? null;
    }
    return out;
  }

  async listAdAccounts(): Promise<MetaAdAccount[]> {
    const rows = await this.getPaged("/me/adaccounts", {
      fields: "account_id,name,currency,account_status",
      limit: "100",
    });
    return rows.map((row) => ({
      id: String(row.account_id ?? row.id ?? "").replace(/^act_/, ""),
      name: (row.name as string | undefined) ?? null,
      currency: String(row.currency ?? "BRL"),
    }));
  }

  async listAds(accountId: string): Promise<MetaAd[]> {
    const rows = await this.getPaged(`/act_${accountId}/ads`, {
      fields:
        "id,creative{id,body,title,image_hash,video_id,thumbnail_url,object_story_spec,asset_feed_spec}",
      limit: "100",
    });
    return rows.map((row) => {
      const creative = (row.creative ?? null) as Record<string, unknown> | null;
      const storySpec = creative?.object_story_spec as
        | { link_data?: { child_attachments?: unknown[] } }
        | undefined;
      return {
        id: String(row.id),
        creative: {
          id: (creative?.id as string | undefined) ?? null,
          body: (creative?.body as string | undefined) ?? null,
          title: (creative?.title as string | undefined) ?? null,
          imageHash: (creative?.image_hash as string | undefined) ?? null,
          videoId: (creative?.video_id as string | undefined) ?? null,
          thumbnailUrl: (creative?.thumbnail_url as string | undefined) ?? null,
          isCarousel: (storySpec?.link_data?.child_attachments?.length ?? 0) > 0,
          isDynamic: creative?.asset_feed_spec != null,
        },
      };
    });
  }

  async getInsights(accountId: string, windowDays: 7 | 30 | 90): Promise<MetaInsight[]> {
    const preset = windowDays === 7 ? "last_7d" : windowDays === 90 ? "last_90d" : "last_30d";
    const rows = await this.getPaged(`/act_${accountId}/insights`, {
      level: "ad",
      fields: "ad_id,impressions,clicks,spend,actions",
      action_breakdowns: "action_type",
      // Atribuição default da API: 7d_click + 1d_view (spec, sem knob).
      date_preset: preset,
      limit: "500",
    });
    return rows.map((row) => {
      const actions = (row.actions ?? []) as Array<{ action_type?: string; value?: string }>;
      return {
        adId: String(row.ad_id),
        impressions: Number(row.impressions ?? 0),
        clicks: Number(row.clicks ?? 0),
        spend: Number(row.spend ?? 0),
        conversions: actions.reduce((sum, action) => sum + Number(action.value ?? 0), 0),
      };
    });
  }

  async getCreativeMedia(accountId: string, creative: MetaCreative): Promise<MetaMedia> {
    let imageUrl: string | null = null;
    let videoUrl: string | null = null;
    if (creative.imageHash) {
      const body = await this.get(`/act_${accountId}/adimages`, {
        hashes: JSON.stringify([creative.imageHash]),
        fields: "url",
      });
      const data = (body.data ?? []) as Array<{ url?: string }>;
      imageUrl = data[0]?.url ?? null;
    }
    if (creative.videoId) {
      const body = await this.get(`/${creative.videoId}`, { fields: "source,picture" });
      videoUrl = (body.source as string | undefined) ?? null;
      if (!creative.thumbnailUrl && body.picture) {
        return { imageUrl, videoUrl, thumbUrl: body.picture as string };
      }
    }
    return { imageUrl, videoUrl, thumbUrl: creative.thumbnailUrl };
  }

  async exchangeCode(code: string, redirectUri: string): Promise<{ accessToken: string }> {
    const appId = env.META_APP_ID;
    const appSecret = env.META_APP_SECRET;
    if (!appId || !appSecret) {
      throw new MetaGraphError("Meta App não configurado (#348 pendente)");
    }
    const url = new URL(`${GRAPH_BASE}/oauth/access_token`);
    url.searchParams.set("client_id", appId);
    url.searchParams.set("client_secret", appSecret);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("code", code);
    const res = await this.fetchFn(url.toString());
    const body = await readJson(res, "oauth/access_token");
    if (typeof body.access_token !== "string" || !body.access_token) {
      throw new MetaGraphError("Meta OAuth sem access_token");
    }
    return { accessToken: body.access_token };
  }
}

export function buildOAuthStartUrl(params: {
  appId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL("https://www.facebook.com/v26.0/dialog/oauth");
  url.searchParams.set("client_id", params.appId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  url.searchParams.set("scope", OAUTH_SCOPES.join(","));
  url.searchParams.set("response_type", "code");
  return url.toString();
}

/** Mock determinístico: mesmos casos do fixture, sem rede. */
export class MockMetaGraphClient implements MetaGraphClient {
  async listAdAccounts(): Promise<MetaAdAccount[]> {
    return [{ id: "123", name: "Mock Ad Account", currency: "BRL" }];
  }

  async listAds(): Promise<MetaAd[]> {
    return [
      {
        id: "501",
        creative: {
          id: "1001",
          body: "Matrículas abertas — 20% off nesta semana",
          title: null,
          imageHash: "hash1001",
          videoId: null,
          thumbnailUrl: "https://mock.invalid/thumb/1001",
          isCarousel: false,
          isDynamic: false,
        },
      },
      {
        id: "502",
        creative: {
          id: "1001",
          body: "Matrículas abertas — 20% off nesta semana",
          title: null,
          imageHash: "hash1001",
          videoId: null,
          thumbnailUrl: "https://mock.invalid/thumb/1001",
          isCarousel: false,
          isDynamic: false,
        },
      },
      {
        id: "504",
        creative: {
          id: "2001",
          body: "Veja como funciona em 30 segundos",
          title: null,
          imageHash: null,
          videoId: "vid2001",
          thumbnailUrl: "https://mock.invalid/thumb/2001",
          isCarousel: false,
          isDynamic: false,
        },
      },
      {
        id: "505",
        creative: {
          id: "3001",
          body: "3 motivos para começar hoje",
          title: null,
          imageHash: null,
          videoId: null,
          thumbnailUrl: "https://mock.invalid/thumb/3001",
          isCarousel: true,
          isDynamic: false,
        },
      },
      // Sem creative.id: não entra na lista (#346 aceite 5).
      {
        id: "509",
        creative: {
          id: null,
          body: null,
          title: null,
          imageHash: null,
          videoId: null,
          thumbnailUrl: null,
          isCarousel: false,
          isDynamic: false,
        },
      },
    ];
  }

  async getInsights(_accountId: string, windowDays: 7 | 30 | 90): Promise<MetaInsight[]> {
    const scale = windowDays === 7 ? 0.25 : windowDays === 90 ? 2.5 : 1;
    const base: MetaInsight[] = [
      { adId: "501", impressions: 42000, clicks: 1260, spend: 1890, conversions: 96 },
      { adId: "502", impressions: 18000, clicks: 450, spend: 810, conversions: 34 },
      { adId: "504", impressions: 60000, clicks: 900, spend: 2400, conversions: 41 },
      { adId: "505", impressions: 15000, clicks: 600, spend: 750, conversions: 18 },
    ];
    return base.map((row) => ({
      adId: row.adId,
      impressions: Math.round(row.impressions * scale),
      clicks: Math.round(row.clicks * scale),
      spend: Math.round(row.spend * scale * 100) / 100,
      conversions: Math.round(row.conversions * scale),
    }));
  }

  async getCreativeMedia(_accountId: string, creative: MetaCreative): Promise<MetaMedia> {
    if (!creative.id) return { imageUrl: null, videoUrl: null, thumbUrl: null };
    return {
      imageUrl: creative.imageHash ? `https://mock.invalid/img/${creative.imageHash}` : null,
      videoUrl: creative.videoId ? `https://mock.invalid/video/${creative.videoId}` : null,
      thumbUrl: creative.thumbnailUrl,
    };
  }

  async exchangeCode(): Promise<{ accessToken: string }> {
    return { accessToken: "mock-system-user-token" };
  }
}

/** Mock quando pedido ou sem Meta App (#348); real só com app + token. */
export function getGraphClient(token?: string): MetaGraphClient {
  if (env.META_GRAPH_MOCK === "true" || !env.META_APP_ID || !token) {
    return new MockMetaGraphClient();
  }
  return new RealMetaGraphClient(token);
}

export function isMockMode(): boolean {
  return env.META_GRAPH_MOCK === "true" || !env.META_APP_ID;
}
