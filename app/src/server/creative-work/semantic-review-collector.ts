import "server-only";
import type { SemanticReviewRepository } from "./semantic-review-repository";

/** One policy, one page, no provider or creative effects. Off unless explicit. */
export async function collectSemanticReview(options: {
  repository: SemanticReviewRepository;
  enabled?: boolean;
  now?: Date;
}) {
  return options.repository.collectNextPage({
    enabled: options.enabled ?? process.env.JEV_OBSERVER_ENABLED === "true",
    now: options.now,
  });
}
