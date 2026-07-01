import { getClientIdentifier, type RateLimitCategory } from "./rate-limit-shared";
import { hitRateLimitStore } from "./rate-limit-store";

export async function rateLimit(
  request: Request,
  category: RateLimitCategory,
  identifier?: string
) {
  const key = `${category}:${identifier ?? getClientIdentifier(request)}`;
  return hitRateLimitStore(key, category);
}

export async function rateLimitWorkspace(
  request: Request,
  workspaceId: string,
  category: RateLimitCategory = "ai"
) {
  return rateLimit(request, category, workspaceId);
}
