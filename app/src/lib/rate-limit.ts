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

import { logger } from "./logger";

export type RateLimitCategory = "auth" | "ai" | "general";

interface RateLimitResult {
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
};

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
    const expiresAt = Math.ceil((now + windowMs) / 1000);

    // Use Upstash Redis JSON array pipeline:
    // 1. RPUSH the new timestamp
    // 2. EXPIRE the key
    // 3. LRANGE to get all timestamps
    // 4. Filter out stale entries client-side (Upstash free tier doesn't support Redis streams easily)
    // A simpler approach: use a Redis sorted set (ZADD) with timestamp as score, then ZREMRANGEBYSCORE + ZCARD

    const pipeline = [
      ["ZADD", key, String(now), String(now)],
      ["ZREMRANGEBYSCORE", key, "0", String(windowStart)],
      ["ZCARD", key],
      ["EXPIRE", key, String(Math.ceil(windowMs / 1000) * 2)],
    ];

    const res = await fetch(`${this.url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(pipeline),
    });

    if (!res.ok) {
      logger.warn("Upstash Redis rate-limit pipeline failed", { status: res.status });
      // Fail open — allow request if Redis is down
      return { success: true, limit: maxRequests, remaining: maxRequests - 1, reset: now + windowMs };
    }

    const results = (await res.json()) as Array<{ result: number | null; error?: string }>;
    const count = (results[2]?.result ?? 0) as number;

    const success = count <= maxRequests;
    return {
      success,
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
  return "unknown";
}

export async function rateLimit(
  request: Request,
  category: RateLimitCategory,
  identifier?: string
): Promise<RateLimitResult> {
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
