import "server-only";
import { env } from "@/server/validation/env";

/**
 * Instagram Graph API for the Equipe's own connection (#548): OAuth code
 * exchange, IG account lookup, two-step content publishing (container, then
 * publish), recent-media lookup for reconcile, and media deletion for
 * operations. The pilot publishes static image posts only.
 *
 * Real HTTP goes ONLY through the injected fetch — tests pass a fake Graph.
 * Errors are classified at the boundary: network/timeout/5xx/429 mean the
 * write may or may not have happened (`uncertain: true` → verifying, never
 * a blind re-publish); 4xx means it definitively did not happen.
 */

export const EQUIPE_IG_GRAPH_VERSION = "v26.0";
const GRAPH_BASE = `https://graph.facebook.com/${EQUIPE_IG_GRAPH_VERSION}`;

export type InstagramGraphFetch = typeof fetch;

export type MetaErrorBody = {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
};

export class InstagramGraphError extends Error {
  constructor(
    message: string,
    readonly options: {
      status?: number;
      metaCode?: number;
      metaSubcode?: number;
      uncertain: boolean;
      what: string;
    },
  ) {
    super(message);
    this.name = "InstagramGraphError";
  }

  get status(): number | undefined {
    return this.options.status;
  }

  get uncertain(): boolean {
    return this.options.uncertain;
  }
}

export type InstagramAccountRef = {
  igUserId: string;
  igUsername: string | null;
};

export type InstagramMediaRow = {
  id: string;
  caption: string | null;
  permalink: string | null;
  timestamp: string | null;
};

function metaErrorOf(body: Record<string, unknown>): MetaErrorBody {
  const nested = body.error as Record<string, unknown> | undefined;
  if (!nested || typeof nested !== "object") return {};
  return {
    message: typeof nested.message === "string" ? nested.message : undefined,
    type: typeof nested.type === "string" ? nested.type : undefined,
    code: typeof nested.code === "number" ? nested.code : undefined,
    error_subcode: typeof nested.error_subcode === "number" ? nested.error_subcode : undefined,
  };
}

function isUncertainStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export class InstagramGraphClient {
  constructor(
    private readonly opts: {
      fetchFn?: InstagramGraphFetch;
      appId?: string;
      appSecret?: string;
    } = {},
  ) {}

  private get fetchFn(): InstagramGraphFetch {
    return this.opts.fetchFn ?? fetch;
  }

  private appCredentials(): { appId: string; appSecret: string } {
    const appId = this.opts.appId ?? env.EQUIPE_IG_APP_ID;
    const appSecret = this.opts.appSecret ?? env.EQUIPE_IG_APP_SECRET;
    if (!appId || !appSecret) {
      throw new InstagramGraphError("Instagram App não configurado (EQUIPE_IG_APP_*)", {
        uncertain: false,
        what: "oauth",
      });
    }
    return { appId, appSecret };
  }

  private async request(
    what: string,
    url: string,
    init: { method?: string; token?: string; body?: URLSearchParams | undefined },
  ): Promise<Record<string, unknown>> {
    let res: Response;
    try {
      res = await this.fetchFn(url, {
        method: init.method ?? "GET",
        headers: {
          ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
          ...(init.body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
        },
        ...(init.body ? { body: init.body } : {}),
      });
    } catch (error) {
      // Network failure or timeout: the write may have happened.
      throw new InstagramGraphError(
        `Instagram ${what}: sem resposta (${error instanceof Error ? error.message : "rede"})`,
        { uncertain: true, what },
      );
    }
    let body: Record<string, unknown> = {};
    try {
      body = (await res.json()) as Record<string, unknown>;
    } catch {
      // Non-JSON body: generic error below.
    }
    if (!res.ok) {
      const meta = metaErrorOf(body);
      const uncertain = isUncertainStatus(res.status);
      throw new InstagramGraphError(
        meta.message ? `Instagram ${what}: ${meta.message}` : `Instagram ${what}: HTTP ${res.status}`,
        {
          status: res.status,
          metaCode: meta.code,
          metaSubcode: meta.error_subcode,
          uncertain,
          what,
        },
      );
    }
    return body;
  }

  /** Short-lived user token from the OAuth code. */
  async exchangeCode(code: string, redirectUri: string): Promise<{ accessToken: string }> {
    const { appId, appSecret } = this.appCredentials();
    const url = new URL(`${GRAPH_BASE}/oauth/access_token`);
    url.searchParams.set("client_id", appId);
    url.searchParams.set("client_secret", appSecret);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("code", code);
    const body = await this.request("oauth/access_token", url.toString(), {});
    if (typeof body.access_token !== "string" || !body.access_token) {
      throw new InstagramGraphError("Instagram OAuth sem access_token", {
        uncertain: false,
        what: "oauth/access_token",
      });
    }
    return { accessToken: body.access_token };
  }

  /** Swap the short-lived token for a long-lived one (~60 days). */
  async exchangeLongLivedToken(shortLived: string): Promise<{ accessToken: string }> {
    const { appId, appSecret } = this.appCredentials();
    const url = new URL(`${GRAPH_BASE}/oauth/access_token`);
    url.searchParams.set("grant_type", "fb_exchange_token");
    url.searchParams.set("client_id", appId);
    url.searchParams.set("client_secret", appSecret);
    url.searchParams.set("fb_exchange_token", shortLived);
    const body = await this.request("oauth/access_token", url.toString(), {});
    if (typeof body.access_token !== "string" || !body.access_token) {
      throw new InstagramGraphError("Instagram OAuth sem long-lived access_token", {
        uncertain: false,
        what: "oauth/access_token",
      });
    }
    return { accessToken: body.access_token };
  }

  /**
   * First professional Instagram account behind the user's Pages, or null
   * when none is linked (→ plain-language "no account" failure).
   */
  async resolveInstagramAccount(accessToken: string): Promise<InstagramAccountRef | null> {
    const url = new URL(`${GRAPH_BASE}/me/accounts`);
    url.searchParams.set("fields", "id,name,instagram_business_account{id,username}");
    url.searchParams.set("limit", "50");
    const body = await this.request("me/accounts", url.toString(), { token: accessToken });
    const rows = (body.data ?? []) as Array<{
      instagram_business_account?: { id?: string; username?: string };
    }>;
    for (const row of rows) {
      const ig = row.instagram_business_account;
      if (ig?.id) return { igUserId: ig.id, igUsername: ig.username ?? null };
    }
    return null;
  }

  /** Step 1 of content publishing: create the image container. */
  async createImageContainer(
    accessToken: string,
    igUserId: string,
    input: { imageUrl: string; caption: string },
  ): Promise<{ containerId: string }> {
    const params = new URLSearchParams();
    params.set("image_url", input.imageUrl);
    params.set("caption", input.caption);
    params.set("access_token", accessToken);
    const body = await this.request("create container", `${GRAPH_BASE}/${igUserId}/media`, {
      method: "POST",
      body: params,
    });
    if (typeof body.id !== "string" || !body.id) {
      throw new InstagramGraphError("Instagram criou o container sem id", {
        uncertain: true,
        what: "create container",
      });
    }
    return { containerId: body.id };
  }

  /** Step 2: publish a container created before (id reused on retry). */
  async publishContainer(
    accessToken: string,
    igUserId: string,
    containerId: string,
  ): Promise<{ mediaId: string }> {
    const params = new URLSearchParams();
    params.set("creation_id", containerId);
    params.set("access_token", accessToken);
    const body = await this.request("publish container", `${GRAPH_BASE}/${igUserId}/media_publish`, {
      method: "POST",
      body: params,
    });
    if (typeof body.id !== "string" || !body.id) {
      throw new InstagramGraphError("Instagram publicou sem media id", {
        uncertain: true,
        what: "publish container",
      });
    }
    return { mediaId: body.id };
  }

  /** Permalink of a published media (best-effort; null when unreadable). */
  async getPermalink(accessToken: string, mediaId: string): Promise<string | null> {
    const url = new URL(`${GRAPH_BASE}/${mediaId}`);
    url.searchParams.set("fields", "permalink");
    try {
      const body = await this.request("media permalink", url.toString(), { token: accessToken });
      return typeof body.permalink === "string" ? body.permalink : null;
    } catch {
      return null;
    }
  }

  /** Recent media of this account; a listing alone does not prove which send created it. */
  async listRecentMedia(
    accessToken: string,
    igUserId: string,
    limit = 25,
  ): Promise<InstagramMediaRow[]> {
    const url = new URL(`${GRAPH_BASE}/${igUserId}/media`);
    url.searchParams.set("fields", "id,caption,permalink,timestamp");
    url.searchParams.set("limit", String(limit));
    const body = await this.request("list media", url.toString(), { token: accessToken });
    const rows = (body.data ?? []) as Array<Record<string, unknown>>;
    return rows
      .filter((row): row is Record<string, unknown> & { id: string } => typeof row.id === "string")
      .map((row) => ({
        id: row.id,
        caption: typeof row.caption === "string" ? row.caption : null,
        permalink: typeof row.permalink === "string" ? row.permalink : null,
        timestamp: typeof row.timestamp === "string" ? row.timestamp : null,
      }));
  }

  /**
   * Delete a media published through the API (operations). Already gone
   * (404) counts as deleted — removal is idempotent.
   */
  async deleteMedia(accessToken: string, mediaId: string): Promise<{ deleted: boolean }> {
    const url = new URL(`${GRAPH_BASE}/${mediaId}`);
    try {
      const body = await this.request("delete media", url.toString(), {
        method: "DELETE",
        token: accessToken,
      });
      return { deleted: body.success !== false };
    } catch (error) {
      if (error instanceof InstagramGraphError && error.status === 404 && !error.uncertain) {
        return { deleted: true };
      }
      throw error;
    }
  }
}
