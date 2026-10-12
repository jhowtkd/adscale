import { z } from "zod";
import { NATUREZA_DAS_AFIRMACOES } from "@/server/shared-skills-texts";
import { getEquipePromptVersion } from "./prompt-version";
import { runVisualReview } from "./reviewers";
import { workOutputSchemas, workOutputWireSchemas } from "../module/agent-work-contract";
import { EquipeModelRefusalError, EquipeModelTruncatedError, type EquipeModelClient, type ModelCallUsage } from "./model-client";
import { defineModelOutput, type ModelOutput } from "./model-output";
import type { EquipeEffort } from "./provider";

export const itemWorkInputSchema = z.object({
  caption: z.string(), facts: z.array(z.string()), note: z.string(), now: z.string(), scheduledFor: z.string().nullable(), imageUrl: z.string().url().optional(),
});

/** One registered output per kind, each with the WIRE schema (the shape only); `workOutputSchemas` is what the answer is validated with. */
const ITEM_WORK_OUTPUTS = Object.fromEntries(
  Object.entries(workOutputWireSchemas).map(([kind, schema]) => [kind, defineModelOutput(`equipe_${kind}`, schema)]),
) as Record<keyof typeof workOutputWireSchemas, ModelOutput>;

const instructions = {
  review_caption: [
    "Revise a legenda sem reescrever. Liste achados e classifique TODAS as afirmações usando ao menos uma natureza conhecida.",
    NATUREZA_DAS_AFIRMACOES,
    "Falhas impeditivas têm severity blocking; observações têm warning; info é aceito. Nunca aprove publicação nem emita Recibo ou Aprovação humana.",
  ].join("\n"),
  plan_adjustment: [
    "Corrija somente a legenda conforme a nota do cliente. Preserve fatos autorizados, não invente ofertas ou promessas e não introduza afirmações não autorizadas.",
    NATUREZA_DAS_AFIRMACOES,
    "Devolva a legenda nova para revisão independente. Não aprove ou publique.",
  ].join("\n"),
  plan_replacement: "Proponha uma ideia de conteúdo para substituir o item recusado, considerando a razão na nota. Ela será apresentada ao cliente para decisão. Não aprove ou publique.",
  plan_reschedule: "Proponha um novo horário ISO UTC para o item que perdeu a janela. O horário deve ser futuro e deixar pelo menos 2 horas para a decisão do cliente. Não aprove ou publique.",
} as const;

export async function runItemWork(input: {
  kind: keyof typeof workOutputSchemas;
  input: z.infer<typeof itemWorkInputSchema>;
  client: EquipeModelClient;
  model: string;
  effort: EquipeEffort;
  setHash?: string | null;
  onModelCall: (usage: ModelCallUsage) => Promise<void>;
}) {
  const setHash = input.setHash ?? null;
  const schema = workOutputSchemas[input.kind];
  const response = await input.client.chat({
    model: input.model, effort: input.effort, maxTokens: 16000, setHash,
    messages: [{ role: "system", content: `${getEquipePromptVersion(input.kind).base}\n${instructions[input.kind]}` }, { role: "user", content: JSON.stringify(input.input) }],
    output: ITEM_WORK_OUTPUTS[input.kind],
  });
  await input.onModelCall({ model: input.model, ...response.usage, setHash });
  if (response.stopReason === "refusal") throw new EquipeModelRefusalError(input.kind);
  if (response.stopReason === "max_tokens") throw new EquipeModelTruncatedError(input.kind);
  const raw: unknown = JSON.parse(response.content ?? "null");
  // A nature listed twice is one nature: the answer is not thrown away over a repeated count (the schema sent has no maxItems).
  if (input.kind === "review_caption" && typeof raw === "object" && raw !== null && Array.isArray((raw as { natures?: unknown }).natures)) {
    (raw as { natures: unknown[] }).natures = [...new Set((raw as { natures: unknown[] }).natures)];
  }
  const output = schema.parse(raw);
  if (input.kind === "review_caption" && input.input.imageUrl && "findings" in output) {
    const visual = await runVisualReview({ client: input.client, model: input.model, effort: input.effort,
      imageUrl: input.input.imageUrl, brief: input.input.caption, onModelCall: input.onModelCall });
    output.findings.push(...visual.findings);
    output.summary += `\n${visual.summary}`;
  }
  return output;
}
