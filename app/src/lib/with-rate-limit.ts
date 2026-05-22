import { NextResponse } from "next/server";
import { rateLimit, rateLimitWorkspace, type RateLimitCategory } from "./rate-limit";
import { logger } from "./logger";

interface RateLimitOptions {
  category?: RateLimitCategory;
  workspaceId?: string;
}

export async function checkRateLimit(request: Request, options: RateLimitOptions = {}) {
  const result = await (options.workspaceId
    ? rateLimitWorkspace(request, options.workspaceId, options.category ?? "ai")
    : rateLimit(request, options.category ?? "general"));

  if (!result.success) {
    logger.warn("Rate limit exceeded", {
      category: options.category ?? "general",
      workspaceId: options.workspaceId,
      remaining: result.remaining,
    });

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

  return null;
}
