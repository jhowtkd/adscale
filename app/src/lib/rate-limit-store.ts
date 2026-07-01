import {
  RATE_LIMIT_DEFAULTS,
  type RateLimitResult,
  isRateLimitDisabled,
} from "./rate-limit-shared";

interface RateLimitStore {
  hit(key: string, windowMs: number, maxRequests: number): Promise<RateLimitResult>;
}

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
  constructor(
    private readonly url: string,
    private readonly token: string
  ) {}

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

function createStore(): RateLimitStore {
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (upstashUrl && upstashToken) {
    return new UpstashRedisStore(upstashUrl, upstashToken);
  }

  return new MemoryStore();
}

let store: RateLimitStore | undefined;

/** Lazy singleton — no store initialization at module import time. */
export function getRateLimitStore(): RateLimitStore {
  if (!store) {
    store = createStore();
  }
  return store;
}

export async function hitRateLimitStore(
  key: string,
  category: keyof typeof RATE_LIMIT_DEFAULTS
): Promise<RateLimitResult> {
  if (isRateLimitDisabled()) {
    const options = RATE_LIMIT_DEFAULTS[category];
    const now = Date.now();
    return {
      success: true,
      limit: options.maxRequests,
      remaining: options.maxRequests,
      reset: now + options.windowMs,
    };
  }

  const options = RATE_LIMIT_DEFAULTS[category];
  return getRateLimitStore().hit(key, options.windowMs, options.maxRequests);
}
