import { createHash } from "node:crypto";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { getOpenAI } from "@/server/ai/utils";
import { isE2EControlledProviderEnabled } from "@/server/ai/providers/e2e-controlled-provider";
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

  const response = await getOpenAI().chat.completions.create({
    model: env.OPENAI_TEXT_MODEL,
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
  });
  const content = response.choices[0]?.message?.content;
  if (!content) return fallbackDirections(workItemId);
  return toDirections(workItemId, suggestionSchema.parse(JSON.parse(content)).directions);
}

export async function suggestCreativeDirections(input: {
  workspaceId: string;
  workItemId: string;
}): Promise<CreativeDirection[] | null> {
  const aggregate = await getCreativeWork(input.workspaceId, input.workItemId);
  if (!aggregate) return null;
  const context = sourceContext(aggregate);
  try {
    return await generateSuggestions(input.workItemId, aggregate.work.request, context);
  } catch {
    return fallbackDirections(input.workItemId);
  }
}

export { fallbackDirections };
