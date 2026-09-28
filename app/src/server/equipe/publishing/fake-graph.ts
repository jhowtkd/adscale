// Fake Instagram Graph for the publishing tests: a scriptable fetch that
// records requests and replays endpoint behaviors. No network, ever.

export type FakeGraphRequest = {
  method: string;
  path: string;
  params: Record<string, string>;
};

export type FakeGraphFailure =
  | { status: number; body?: Record<string, unknown> }
  | { throws: Error };

export type FakeGraphMedia = {
  id: string;
  caption: string | null;
  permalink: string | null;
  timestamp: string | null;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export class FakeGraph {
  readonly requests: FakeGraphRequest[] = [];
  containers = new Map<string, { imageUrl: string; caption: string }>();
  media: FakeGraphMedia[] = [];
  pages: Array<{ id: string; igUserId?: string; igUsername?: string }> = [
    { id: "page_1", igUserId: "ig_1", igUsername: "marca" },
  ];
  permalinkOf: Record<string, string> = {};
  /** One-shot failures per endpoint key (consumed in order). */
  private readonly failures = new Map<string, FakeGraphFailure[]>();
  private containerSeq = 0;
  private mediaSeq = 0;

  readonly fetch: typeof fetch = (async (url: unknown, init?: unknown) => {
    const raw = String(url);
    const parsed = new URL(raw);
    const method = (
      (init as { method?: string } | undefined)?.method ?? "GET"
    ).toUpperCase();
    const params: Record<string, string> = {};
    parsed.searchParams.forEach((value, key) => {
      params[key] = value;
    });
    const body = (init as { body?: unknown } | undefined)?.body;
    if (typeof body === "string") {
      new URLSearchParams(body).forEach((value, key) => {
        params[key] = value;
      });
    } else if (body instanceof URLSearchParams) {
      body.forEach((value, key) => {
        params[key] = value;
      });
    }
    const path = parsed.pathname.replace(/^\/v\d+\.\d+/, "");
    this.requests.push({ method, path, params });

    const endpoint = this.endpointOf(method, path);
    const failure = this.failures.get(endpoint)?.shift();
    if (failure) {
      if ("throws" in failure) throw failure.throws;
      return jsonResponse(failure.body ?? { error: { message: "fake failure" } }, failure.status);
    }
    return this.handle(endpoint, path, params);
  }) as typeof fetch;

  failNext(endpoint: string, failure: FakeGraphFailure): void {
    const list = this.failures.get(endpoint) ?? [];
    list.push(failure);
    this.failures.set(endpoint, list);
  }

  private endpointOf(method: string, path: string): string {
    if (path === "/oauth/access_token") return "oauth";
    if (path === "/me/accounts") return "accounts";
    const mediaCreate = path.match(/^\/([^/]+)\/media$/);
    if (mediaCreate && method === "POST") return "media.create";
    if (mediaCreate && method === "GET") return "media.list";
    if (path.match(/^\/([^/]+)\/media_publish$/) && method === "POST") return "media.publish";
    if (method === "DELETE") return "media.delete";
    if (method === "GET") return "media.get";
    return `${method} ${path}`;
  }

  private handle(endpoint: string, path: string, params: Record<string, string>): Response {
    switch (endpoint) {
      case "oauth": {
        if (params.grant_type === "fb_exchange_token") {
          return jsonResponse({ access_token: "long-lived-token", expires_in: 5_000_000 });
        }
        return jsonResponse({ access_token: "short-lived-token", expires_in: 3600 });
      }
      case "accounts":
        return jsonResponse({
          data: this.pages.map((page) => ({
            id: page.id,
            instagram_business_account: page.igUserId
              ? { id: page.igUserId, username: page.igUsername ?? null }
              : undefined,
          })),
        });
      case "media.create": {
        this.containerSeq += 1;
        const id = `container_${this.containerSeq}`;
        this.containers.set(id, {
          imageUrl: params.image_url ?? "",
          caption: params.caption ?? "",
        });
        return jsonResponse({ id });
      }
      case "media.publish": {
        this.mediaSeq += 1;
        const id = `media_${this.mediaSeq}`;
        const container = this.containers.get(params.creation_id ?? "");
        this.media.unshift({
          id,
          caption: container?.caption ?? null,
          permalink: `https://instagram.test/p/${id}`,
          timestamp: new Date().toISOString(),
        });
        return jsonResponse({ id });
      }
      case "media.list":
        return jsonResponse({ data: this.media });
      case "media.get": {
        const id = path.slice(1);
        const permalink = this.permalinkOf[id] ?? `https://instagram.test/p/${id}`;
        return jsonResponse({ permalink });
      }
      case "media.delete":
        return jsonResponse({ success: true });
      default:
        return jsonResponse({ error: { message: `fake: unknown ${endpoint}` } }, 400);
    }
  }
}
