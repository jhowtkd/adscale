// Equipe model providers (#588).
//
// Each role picks its provider from its model id. This module is
// dependency-free on purpose: validation/env.ts imports the resolver to
// require the key of every provider in use, and it must not pull the
// model clients (or anything importing env) into a cycle.

export type EquipeProvider = "anthropic" | "meta" | "openai";

/** Reasoning level shared by the Meta and Anthropic APIs. */
export type EquipeEffort = "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

/**
 * Resolve the provider from a model id prefix: `claude-` → Anthropic
 * Messages API, `muse-` → Meta Model API, anything else → OpenAI.
 */
export function resolveEquipeProvider(modelId: string): EquipeProvider {
  if (modelId.startsWith("claude-")) return "anthropic";
  if (modelId.startsWith("muse-")) return "meta";
  return "openai";
}
