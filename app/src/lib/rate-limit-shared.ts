import { NextResponse } from "next/server";

export type RateLimitCategory = "auth" | "ai" | "general" | "read";

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

export interface LimiterOptions {
  windowMs: number;
  maxRequests: number;
}

export const RATE_LIMIT_DEFAULTS: Record<RateLimitCategory, LimiterOptions> = {
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

export function getClientIdentifier(request: Request): string {
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
