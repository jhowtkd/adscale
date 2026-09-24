import "server-only";
import { z } from "zod";
import { getOpenAI } from "@/server/ai/utils";
import {
  newModelCallId,
  observeModelCall,
  reportModelValidationFailed,
  summarizeChatCompletion,
} from "@/server/diagnostics/model-calls";
import { env } from "@/server/validation/env";
import {
  socialPostBriefSchema,
  type CreativeWorkFactPack,
  type InferredBriefing,
  type SocialPostBrief,
} from "./contracts";
import { hasFactOrigin, type BriefingCheckFinding } from "./briefing-check";
export { checkInferredBriefing } from "./briefing-check";
export type { BriefingCheck, BriefingCheckFinding } from "./briefing-check";

const reviewedBriefSchema = z.object({
  message: z.string().trim().max(240),
  objective: z.string().trim().max(240),
  audience: z.string().trim().max(240),
  offer: z.string().trim().max(240).nullable(),
});

function renderFactPack(factPack: CreativeWorkFactPack): string {
  const facts = factPack.facts.map((fact) =>
    `- [${fact.class}] "${fact.value}" (origin: ${fact.origin}${fact.sourceId ? `, source: ${fact.sourceId}` : ""})`,
  );
  return [
    `REQUEST: ${factPack.request}`,
    `BRAND: ${factPack.identity.brandName ?? "(none)"}`,
    "AUTHORIZED FACTS:",
    facts.length > 0 ? facts.join("\n") : "- (none)",
  ].join("\n");
}

function buildReviewPrompt(input: {
  briefing: InferredBriefing;
  factPack: CreativeWorkFactPack;
  findings: readonly BriefingCheckFinding[];
}): string {
  return [
    "CREATIVE WORK BRIEFING REVIEW — ONE ATTEMPT",
    "Repair only the findings listed below using the same authorized request, brand and facts.",
    "Do not use memory, history, style references or any new source.",
    "Never invent an offer, price, benefit, date, condition, modality, credential or guarantee.",
    "If the offer has no exact origin in the authorized facts, return null.",
    "Return ONLY JSON with keys message, objective, audience and offer.",
    "",
    "CURRENT ENVELOPE:",
    JSON.stringify(input.briefing),
    "",
    "CHECK FINDINGS:",
    input.findings.map((finding) => `- ${finding.code}`).join("\n") || "- none",
    "",
    renderFactPack(input.factPack),
  ].join("\n");
}

/** Exactly one provider-backed revision; callers own the no-loop boundary. */
export async function reviewInferredBriefingOnce(input: {
  briefing: InferredBriefing;
  factPack: CreativeWorkFactPack;
  findings: readonly BriefingCheckFinding[];
}): Promise<SocialPostBrief | null> {
  const model = env.OPENAI_TEXT_MODEL || "gpt-4o-mini";
  const trace = { callId: newModelCallId(), provider: "openai", requestedModel: model, stage: "briefing" as const };
  let response: Awaited<ReturnType<ReturnType<typeof getOpenAI>["chat"]["completions"]["create"]>>;
  try {
    response = await observeModelCall(trace, () => getOpenAI().chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You repair a Portuguese (pt-BR) creative briefing under a frozen factual contract. Return only JSON.",
        },
        { role: "user", content: buildReviewPrompt(input) },
      ],
    }), summarizeChatCompletion);
  } catch {
    return null;
  }
  try {
    const content = response.choices[0]?.message?.content;
    if (!content) {
      reportModelValidationFailed({ ...trace, reason: "empty-content" });
      return null;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      reportModelValidationFailed({ ...trace, reason: "invalid-json" });
      return null;
    }
    const reviewed = reviewedBriefSchema.parse(parsed);
    const offer = reviewed.offer?.trim() || null;
    return socialPostBriefSchema.parse({
      theme: reviewed.message,
      objective: reviewed.objective,
      audience: reviewed.audience,
      offer: offer && hasFactOrigin(offer, input.factPack) ? offer : null,
    });
  } catch {
    reportModelValidationFailed({ ...trace, reason: "schema-mismatch" });
    return null;
  }
}
