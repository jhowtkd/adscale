/**
 * Rate limiting with pluggable storage backends.
 *
 * Backends (in priority order):
 * 1. Upstash Redis — set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 * 2. MemoryStore — fallback for local dev / single-instance deploys
 *
 * Route handlers should import from here. proxy.ts must import from rate-limit-proxy.ts.
 */

import { NextResponse } from "next/server";
import { logger } from "./logger";
import { rateLimit, rateLimitWorkspace } from "./rate-limit-apply";
import {
  buildRateLimitExceededResponse,
  getMutationRateLimitCategory,
  isRateLimitDisabled,
  type RateLimitCategory,
  type RateLimitResult,
} from "./rate-limit-shared";

export type { RateLimitCategory, RateLimitResult };
export {
  buildRateLimitExceededResponse,
  getMutationRateLimitCategory,
  isRateLimitDisabled,
};
export { rateLimit, rateLimitWorkspace };

export interface CheckRateLimitOptions {
  category?: RateLimitCategory;
  workspaceId?: string;
  identifier?: string;
}

export async function checkRateLimit(
  pathname: string,
  request: Request,
  options: CheckRateLimitOptions = {}
): Promise<NextResponse | null> {
  const category = options.category ?? getMutationRateLimitCategory(pathname);
  const result = await (options.workspaceId
    ? rateLimitWorkspace(request, options.workspaceId, category)
    : options.identifier
      ? rateLimit(request, category, options.identifier)
      : rateLimit(request, category));

  if (!result.success) {
    logger.warn("Rate limit exceeded", {
      category,
      pathname,
      workspaceId: options.workspaceId,
      remaining: result.remaining,
    });
    return buildRateLimitExceededResponse(result);
  }

  return null;
}

/** @deprecated Use checkRateLimit(pathname, request) from rate-limit-proxy in proxy.ts */
export async function checkMutationRateLimit(
  request: Request,
  pathname: string
): Promise<NextResponse | null> {
  return checkRateLimit(pathname, request);
}
