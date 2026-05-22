/**
 * Rate limiting with in-memory LRU fallback.
 * Upstash Redis support can be added later by swapping the store.
 */


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

// Simple in-memory store with sliding window
class MemoryStore {
  private hits = new Map<string, Array<number>>();

  hit(key: string, windowMs: number, maxRequests: number): RateLimitResult {
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

const store = new MemoryStore();

function getClientIdentifier(request: Request): string {
  // Use X-Forwarded-For if behind a proxy, fallback to a generic key
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return "unknown";
}

export function rateLimit(
  request: Request,
  category: RateLimitCategory,
  identifier?: string
): RateLimitResult {
  const options = DEFAULTS[category];
  const key = `${category}:${identifier ?? getClientIdentifier(request)}`;
  return store.hit(key, options.windowMs, options.maxRequests);
}

export function rateLimitWorkspace(
  request: Request,
  workspaceId: string,
  category: RateLimitCategory = "ai"
): RateLimitResult {
  return rateLimit(request, category, workspaceId);
}
