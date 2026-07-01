/**
 * Edge-safe rate-limit entry for proxy.ts.
 * Imports only shared classification/response helpers and lazy store access.
 * Does not import server route helpers or logger.
 */
import { NextResponse } from "next/server";
import {
  buildRateLimitExceededResponse,
  getMutationRateLimitCategory,
} from "./rate-limit-shared";
import { rateLimit } from "./rate-limit-apply";

export { buildRateLimitExceededResponse, getMutationRateLimitCategory } from "./rate-limit-shared";

export async function checkRateLimit(
  pathname: string,
  request: Request
): Promise<NextResponse | null> {
  const category = getMutationRateLimitCategory(pathname);
  const result = await rateLimit(request, category);
  if (!result.success) {
    return buildRateLimitExceededResponse(result);
  }
  return null;
}

/** @deprecated Use checkRateLimit(pathname, request) */
export async function checkMutationRateLimit(
  request: Request,
  pathname: string
): Promise<NextResponse | null> {
  return checkRateLimit(pathname, request);
}
