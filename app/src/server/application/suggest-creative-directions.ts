import { createHash } from "node:crypto";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { getOpenAI } from "@/server/ai/utils";
import { isE2EControlledProviderEnabled } from "@/server/ai/providers/e2e-controlled-provider";
import {
  newModelCallId,
  observeModelCall,
  reportModelValidationFailed,
  summarizeChatCompletion,
} from "@/server/diagnostics/model-calls";
import { env } from "@/server/validation/env";
import {
  createDefaultCreativeDirectionPool,
  type CreativeDirection,
} from "@/server/creative-work/contracts";
import { getCreativeWork } from "@/server/repositories/creative-work";

const suggestionSchema = z.object({
  directions: z.array(z.object({
    label: z.string().trim().min(1).max(80),
    instruction: z.string().trim().min(1).max(500),
    safetyBand: z.enum(["safe", "experimental"]),
  })).length(5),
});

type SuggestionDraft = z.infer<typeof suggestionSchema>["directions"][number];

function stableDirectionId(workItemId: string, direction: SuggestionDraft, index: number): string {
  const hex = createHash("sha256")
    .update(`${workItemId}:${index}:${direction.label}:${direction.instruction}`)
    .digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${(8 | (Number.parseInt(hex[16], 16) & 3)).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function toDirections(workItemId: string, drafts: SuggestionDraft[]): CreativeDirection[] {
  return drafts.map((direction, order) => ({
    id: stableDirectionId(workItemId, direction, order),
    label: direction.label,
    instruction: direction.instruction,
    order,
    safetyBand: direction.safetyBand,
    provenance: "ai-suggestion" as const,
  }));
}

function fallbackDirections(workItemId: string): CreativeDirection[] {
  const defaults = createDefaultCreativeDirectionPool().directions;
  return toDirections(workItemId, [
    ...defaults.map(({ label, instruction, safetyBand }) => ({ label, instruction, safetyBand })),
    {
      label: "Foco no produto",
      instruction: "Destaque o produto como protagonista, com leitura imediata e poucos elementos concorrentes.",
      safetyBand: "safe",
    },
    {
      label: "Foco na oferta",
      instruction: "Priorize a oferta e o benefício principal com hierarquia visual forte e CTA claro.",
      safetyBand: "safe",
    },
  ]);
}

function sourceContext(aggregate: NonNullable<Awaited<ReturnType<typeof getCreativeWork>>>) {
  return aggregate.sources
    .filter((source) => source.status === "ready")
    .map((source) => ({
      usage: source.usage,
      content: source.contentAnalysis,
      style: source.styleAnalysis,
    }));
}

async function generateSuggestions(
  workItemId: string,
  request: string,
  context: unknown,
): Promise<CreativeDirection[]> {
  if (isE2EControlledProviderEnabled()) return fallbackDirections(workItemId);

  const model = env.OPENAI_TEXT_MODEL;
  const trace = { callId: newModelCallId(), provider: "openai", requestedModel: model, stage: "briefing" as const };
  const response = await observeModelCall(trace, () => getOpenAI().chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: `Você é diretor de criação para anúncios digitais no Brasil.
Gere exatamente 5 direcionamentos visuais e de copy, contextualizados pela arte analisada e pelo pedido.
Cada direcionamento deve ter um rótulo curto em português brasileiro, uma instrução concreta e safetyBand safe ou experimental.
Não invente fatos, ofertas, marcas ou texto que não estejam no contexto. Retorne apenas o JSON do schema.`,
      },
      {
        role: "user",
        content: `Pedido: ${request || "sem pedido adicional"}
Contexto das fontes analisadas: ${JSON.stringify(context).slice(0, 8_000)}`,
      },
    ],
    response_format: zodResponseFormat(suggestionSchema, "creative_direction_suggestions"),
    max_completion_tokens: 1_500,
  }), summarizeChatCompletion);
  const content = response.choices[0]?.message?.content;
  if (!content) {
    reportModelValidationFailed({ ...trace, reason: "empty-content" });
    return fallbackDirections(workItemId);
  }
  try {
    return toDirections(workItemId, suggestionSchema.parse(JSON.parse(content)).directions);
  } catch (error) {
    reportModelValidationFailed({ ...trace, reason: error instanceof SyntaxError ? "invalid-json" : "schema-mismatch" });
    throw error;
  }
}

export type SuggestCreativeDirectionsError =
  | { code: "work_not_found" }
  | { code: "work_not_draft"; status: string }
  | { code: "intent_not_supported"; toolKind: string }
  | { code: "source_not_ready" };

export type SuggestCreativeDirectionsResult =
  | { ok: true; directions: CreativeDirection[] }
  | { ok: false; error: SuggestCreativeDirectionsError };

export async function suggestCreativeDirections(input: {
  workspaceId: string;
  workItemId: string;
}): Promise<SuggestCreativeDirectionsResult> {
  const aggregate = await getCreativeWork(input.workspaceId, input.workItemId);
  if (!aggregate) return { ok: false, error: { code: "work_not_found" } };
  // Same eligibility the composer UI enforces, duplicated server-side so a
  // direct POST cannot suggest for works outside the variations draft state.
  if (aggregate.work.status !== "draft") {
    return { ok: false, error: { code: "work_not_draft", status: aggregate.work.status } };
  }
  if (aggregate.work.toolKind !== "variations") {
    return { ok: false, error: { code: "intent_not_supported", toolKind: aggregate.work.toolKind } };
  }
  const context = sourceContext(aggregate);
  if (context.length === 0) {
    return { ok: false, error: { code: "source_not_ready" } };
  }
  try {
    return { ok: true, directions: await generateSuggestions(input.workItemId, aggregate.work.request, context) };
  } catch {
    return { ok: true, directions: fallbackDirections(input.workItemId) };
  }
}

export { fallbackDirections };
