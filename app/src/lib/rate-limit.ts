/**
 * Rate limiting with pluggable storage backends.
 *
 * Backends (in priority order):
 * 1. Upstash Redis — set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 * 2. MemoryStore — fallback for local dev / single-instance deploys
 *
 * In serverless environments, always configure Upstash Redis (or another
 * external store) otherwise rate limits will be per-instance only.
 */

import { NextResponse } from "next/server";
import { logger } from "./logger";

export type RateLimitCategory = "auth" | "ai" | "general" | "read";

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

interface LimiterOptions {
  windowMs: number;
  maxRequests: number;
}

const DEFAULTS: Record<RateLimitCategory, LimiterOptions> = {
  auth: { windowMs: 60 * 1000, maxRequests: 10 },
  ai: { windowMs: 60 * 1000, maxRequests: 5 },
  general: { windowMs: 60 * 1000, maxRequests: 30 },
  read: { windowMs: 60 * 1000, maxRequests: 60 },
};

/** AI-heavy campaign mutations — keep on the strict `ai` bucket. */
const AI_CAMPAIGN_MUTATION_PATTERNS: RegExp[] = [
  /\/derivations\/?$/,
  /\/diagnosis(\/regenerate)?\/?$/,
  /\/auto-briefing\/?$/,
  /\/analyze\/?$/,
  /\/restyle\/?$/,
  /\/suggest-ctas\/?$/,
  /\/smart-resize-preview\/?$/,
  /\/competitors\/analyze\/?$/,
  /\/competitors\/strategy\/?$/,
  /\/assets\/[^/]+\/preflight\/?$/,
];

/* ------------------------------------------------------------------ */
// Storage interface
/* ------------------------------------------------------------------ */

interface RateLimitStore {
  hit(key: string, windowMs: number, maxRequests: number): Promise<RateLimitResult>;
}

/* ------------------------------------------------------------------ */
// MemoryStore (single-instance)
/* ------------------------------------------------------------------ */

class MemoryStore implements RateLimitStore {
  private hits = new Map<string, Array<number>>();

  async hit(key: string, windowMs: number, maxRequests: number): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - windowMs;

    const timestamps = this.hits.get(key) ?? [];
    const valid = timestamps.filter((t) => t > windowStart);

    const success = valid.length < maxRequests;
    if (success) {
      valid.push(now);
    }
    this.hits.set(key, valid);

    // Clean up old entries periodically
    if (Math.random() < 0.01) {
      this.gc(windowMs);
    }

    return {
      success,
      limit: maxRequests,
      remaining: Math.max(0, maxRequests - valid.length),
      reset: valid.length > 0 ? valid[0] + windowMs : now + windowMs,
    };
  }

  private gc(windowMs: number) {
    const cutoff = Date.now() - windowMs * 2;
    for (const [key, timestamps] of this.hits) {
      const valid = timestamps.filter((t) => t > cutoff);
      if (valid.length === 0) {
        this.hits.delete(key);
      } else {
        this.hits.set(key, valid);
      }
    }
  }
}

/* ------------------------------------------------------------------ */
// UpstashRedisStore (serverless-safe)
/* ------------------------------------------------------------------ */

const SLIDING_WINDOW_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowStart = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
local ttl = tonumber(ARGV[5])

redis.call('ZREMRANGEBYSCORE', key, '0', windowStart)
local count = redis.call('ZCARD', key)
if count >= limit then
  return {0, count}
end
redis.call('ZADD', key, now, member)
redis.call('EXPIRE', key, ttl)
return {1, count + 1}
`;

class UpstashRedisStore implements RateLimitStore {
  private url: string;
  private token: string;

  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
  }

  async hit(key: string, windowMs: number, maxRequests: number): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - windowMs;
    const member = `${now}:${crypto.randomUUID()}`;
    const ttlSeconds = Math.ceil(windowMs / 1000) * 2;

    const res = await fetch(this.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        "EVAL",
        SLIDING_WINDOW_LUA,
        "1",
        key,
        String(now),
        String(windowStart),
        String(maxRequests),
        member,
        String(ttlSeconds),
      ]),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      logger.warn("Upstash Redis rate-limit eval failed", { status: res.status });
      return { success: false, limit: maxRequests, remaining: 0, reset: now + windowMs };
    }

    const payload = (await res.json()) as { result?: number[] | null };
    const result = payload.result ?? [0, maxRequests];
    const allowed = result[0] === 1;
    const count = result[1] ?? maxRequests;

    return {
      success: allowed,
      limit: maxRequests,
      remaining: Math.max(0, maxRequests - count),
      reset: now + windowMs,
    };
  }
}

/* ------------------------------------------------------------------ */
// Store factory
/* ------------------------------------------------------------------ */

function createStore(): RateLimitStore {
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (upstashUrl && upstashToken) {
    logger.info("Rate limiter using Upstash Redis");
    return new UpstashRedisStore(upstashUrl, upstashToken);
  }

  if (process.env.NODE_ENV === "production") {
    logger.warn(
      "Rate limiter falling back to in-memory store. In serverless environments this is unreliable. " +
        "Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to use Redis."
    );
  }

  return new MemoryStore();
}

const store = createStore();

/* ------------------------------------------------------------------ */
// Helpers
/* ------------------------------------------------------------------ */

function getClientIdentifier(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
  return "unknown";
}

/** Skip rate limits for local E2E (TestSprite, Playwright). Set E2E_DISABLE_RATE_LIMIT=true on the server. */
export function isRateLimitDisabled(): boolean {
  const flag = process.env.E2E_DISABLE_RATE_LIMIT;
  return flag === "1" || flag === "true" || flag === "yes";
}

export async function rateLimit(
  request: Request,
  category: RateLimitCategory,
  identifier?: string
): Promise<RateLimitResult> {
  if (isRateLimitDisabled()) {
    const options = DEFAULTS[category];
    const now = Date.now();
    return {
      success: true,
      limit: options.maxRequests,
      remaining: options.maxRequests,
      reset: now + options.windowMs,
    };
  }

  const options = DEFAULTS[category];
  const key = `${category}:${identifier ?? getClientIdentifier(request)}`;
  return store.hit(key, options.windowMs, options.maxRequests);
}

export async function rateLimitWorkspace(
  request: Request,
  workspaceId: string,
  category: RateLimitCategory = "ai"
): Promise<RateLimitResult> {
  return rateLimit(request, category, workspaceId);
}

export function getMutationRateLimitCategory(pathname: string): RateLimitCategory {
  if (pathname.startsWith("/api/auth")) {
    return "auth";
  }

  if (pathname.includes("/assets/upload")) {
    return "general";
  }

  if (
    pathname.startsWith("/api/derivations") ||
    pathname.startsWith("/api/restyling") ||
    pathname.startsWith("/api/quick-tools")
  ) {
    return "ai";
  }

  if (pathname.startsWith("/api/campaigns")) {
    const isAiMutation = AI_CAMPAIGN_MUTATION_PATTERNS.some((pattern) =>
      pattern.test(pathname)
    );
    return isAiMutation ? "ai" : "general";
  }

  return "general";
}

export function buildRateLimitExceededResponse(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    {
      error: "rateLimitExceeded",
      message: "Too many requests. Please try again later.",
      retryAfter: Math.ceil((result.reset - Date.now()) / 1000),
    },
    {
      status: 429,
      headers: {
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(Math.ceil(result.reset / 1000)),
      },
    }
  );
}

export interface CheckRateLimitOptions {
  category?: RateLimitCategory;
  workspaceId?: string;
  identifier?: string;
}

export async function checkRateLimit(
  request: Request,
  options: CheckRateLimitOptions = {}
): Promise<NextResponse | null> {
  const category = options.category ?? "general";
  const result = await (options.workspaceId
    ? rateLimitWorkspace(request, options.workspaceId, category)
    : options.identifier
      ? rateLimit(request, category, options.identifier)
      : rateLimit(request, category));

  if (!result.success) {
    logger.warn("Rate limit exceeded", {
      category,
      workspaceId: options.workspaceId,
      remaining: result.remaining,
    });
    return buildRateLimitExceededResponse(result);
  }

  return null;
}

/** Edge-safe entry used by proxy.ts for API mutation rate limiting. */
export async function checkMutationRateLimit(
  request: Request,
  pathname: string
): Promise<NextResponse | null> {
  const category = getMutationRateLimitCategory(pathname);
  const result = await rateLimit(request, category);
  if (!result.success) {
    return buildRateLimitExceededResponse(result);
  }
  return null;
}
