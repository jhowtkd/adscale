// Pesquisa IA: structured facts + diagnosis from registered materials (#550).

import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import type { EquipeModelClient } from "./model-client";
import {
  researchSystemPrompt,
  researchUserMessage,
  type ResearchMaterial,
} from "./prompts";
import { resolveResearchModel } from "./roles";

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

export type ResearchInput = {
  client: EquipeModelClient;
  materials: ResearchMaterial[];
  model?: string;
  onModelCall?: (call: { model: string; inputTokens: number; outputTokens: number }) => Promise<void>;
};

export async function runResearch(input: ResearchInput): Promise<ResearchOutput> {
  if (input.materials.length === 0) {
    throw new Error("research_requires_materials");
  }
  const model = input.model ?? resolveResearchModel();
  const response = await input.client.chat({
    model,
    messages: [
      { role: "system", content: researchSystemPrompt() },
      { role: "user", content: researchUserMessage(input.materials) },
    ],
    responseFormat: zodResponseFormat(researchOutputSchema, "equipe_research"),
    maxTokens: 2000,
  });
  await input.onModelCall?.({
    model,
    inputTokens: response.usage.inputTokens,
    outputTokens: response.usage.outputTokens,
  });
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


