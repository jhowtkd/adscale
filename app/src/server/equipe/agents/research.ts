// Pesquisa IA: structured facts + diagnosis from registered materials (#550).

import { withTextInputBound } from "./free-budget";
import { z } from "zod";
import {
  EquipeModelRefusalError,
  EquipeModelTruncatedError,
  type EquipeModelClient,
  type ModelCallUsage,
} from "./model-client";
import { defineModelOutput } from "./model-output";
import type { EquipeEffort } from "./provider";
import {
  researchSystemPrompt,
  researchUserMessage,
  type ResearchMaterial,
} from "./prompts";
import { resolveResearchEffort, resolveResearchModel } from "./roles";

export const researchOutputSchema = z.object({
  facts: z.array(
    z.object({
      claim: z.string().min(1),
      source: z.string().min(1),
      // Nullable (not optional): structured output requires every field.
      section: z.string().nullable(),
    }),
  ),
  diagnosis: z.string().min(1),
});

export type ResearchOutput = z.infer<typeof researchOutputSchema>;
const RESEARCH_OUTPUT = defineModelOutput("equipe_research", researchOutputSchema);

/** Reasoning tokens count toward the output limit: room for both. */
export const RESEARCH_MAX_TOKENS = 16000;

export type ResearchInput = {
  client: EquipeModelClient;
  materials: ResearchMaterial[];
  model?: string;
  effort?: EquipeEffort;
  onModelCall?: (call: ModelCallUsage) => Promise<void>;
};

export async function runResearch(input: ResearchInput): Promise<ResearchOutput> {
  if (input.materials.length === 0) {
    throw new Error("research_requires_materials");
  }
  const model = input.model ?? resolveResearchModel();
  const effort = input.effort ?? resolveResearchEffort();
  const response = await input.client.chat(withTextInputBound({
    model,
    messages: [
      { role: "system", content: researchSystemPrompt() },
      { role: "user", content: researchUserMessage(input.materials) },
    ],
    output: RESEARCH_OUTPUT,
    effort,
    maxTokens: RESEARCH_MAX_TOKENS,
  }));
  await input.onModelCall?.({ model, ...response.usage });
  // A cut or refused answer is a failed task — never parsed as research.
  if (response.stopReason === "refusal") {
    throw new EquipeModelRefusalError("research_refused");
  }
  if (response.stopReason === "max_tokens") {
    throw new EquipeModelTruncatedError("research_truncated");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(response.content ?? "null");
  } catch {
    throw new Error("research_invalid_json");
  }
  const validated = researchOutputSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(`research_schema_mismatch: ${validated.error.issues[0]?.message ?? "invalid"}`);
  }
  return validated.data;
}
