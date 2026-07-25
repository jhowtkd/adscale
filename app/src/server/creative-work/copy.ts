import "server-only";
import { getOpenAI } from "@/server/ai/utils";
import { env } from "@/server/validation/env";
import type {
  CreativeFact,
  CreativeWorkFactPack,
  SocialPostBrief,
  SocialPostCopy,
} from "./contracts";
import { socialPostCopySchema } from "./contracts";
import {
  validateSocialPostCopyAgainstFactPack,
  type CopyClaimViolation,
} from "./fact-pack";
import { isE2EControlledProviderEnabled } from "@/server/ai/providers/e2e-controlled-provider";

const SOCIAL_POST_COPY_SYSTEM_PROMPT = [
  "You are a senior Portuguese (pt-BR) social-media copywriter.",
  "",
  "Return ONLY a JSON object with exactly these three string keys and no other keys, commentary, or markdown:",
  "{",
  '  "headline": "<short, punchy headline (<=120 chars)>",',
  '  "body": "<supporting paragraph (<=600 chars)>",',
  '  "cta": "<call to action verb phrase (<=80 chars)>"',
  "}",
  "",
  "Constraints:",
  "- Write in pt-BR.",
  "- Headline, body, and CTA must be on-brand and consistent with the brief.",
  "- Do not include emojis unless explicitly required.",
  "- Do not include trailing whitespace.",
].join("\n");

const FACT_PACK_GROUNDING_PROMPT = [
  "",
  "FACTUAL GROUNDING (mandatory):",
  "- Use ONLY facts present in the user request or in the FACT PACK below.",
  "- NEVER invent or assume prices, discounts, dates, deadlines, offers, benefits, proofs, conditions, credentials, brands, products, services or numbers.",
  "- Information that is absent from the request and the fact pack must stay absent from the copy.",
  "- Required brand elements must be respected; prohibited brand elements must never appear.",
].join("\n");

/**
 * Typed failure for copy that cannot be grounded in the fact pack (R-002).
 * The application layer maps it to the typed `invalid_context` error before
 * any billing or image call.
 */
export class CreativeCopyContextError extends Error {
  readonly code = "invalid_context" as const;
  readonly violations: readonly CopyClaimViolation[];
  constructor(violations: readonly CopyClaimViolation[]) {
    super(
      `Creative work copy contains claims without factual origin: ${
        violations.map((violation) => `[${violation.class}] "${violation.value}" in ${violation.field}`).join(", ")
      }`,
    );
    this.name = "CreativeCopyContextError";
    this.violations = violations;
  }
}

function renderVoiceBlock(
  toneOfVoice: string | null,
  requiredElements: string | null,
  prohibitedElements: string | null,
): string {
  const lines: string[] = [];
  if (toneOfVoice && toneOfVoice.trim().length > 0) {
    lines.push(`- Tone of voice: ${toneOfVoice.trim()}`);
  }
  if (requiredElements && requiredElements.trim().length > 0) {
    lines.push(`- Required elements: ${requiredElements.trim()}`);
  }
  if (prohibitedElements && prohibitedElements.trim().length > 0) {
    lines.push(`- Prohibited elements: ${prohibitedElements.trim()}`);
  }
  return lines.join("\n");
}

function renderFactLine(fact: CreativeFact): string {
  const origin = fact.origin === "source"
    ? `source ${fact.sourceId ?? "?"}`
    : fact.origin;
  return `- [${fact.class}] "${fact.value}" (origin: ${origin}; ${fact.required ? "required" : "allowed"})`;
}

function renderFactPackPrompt(input: {
  factPack: CreativeWorkFactPack;
  brandName: string;
  toneOfVoice: string | null;
  requiredElements: string | null;
  prohibitedElements: string | null;
}): string {
  const { factPack, brandName, toneOfVoice, requiredElements, prohibitedElements } = input;
  const voiceBlock = renderVoiceBlock(toneOfVoice, requiredElements, prohibitedElements);
  const factLines = factPack.facts.map(renderFactLine);
  return [
    `Brand: ${factPack.identity.brandName ?? brandName}`,
    "",
    "User request (full, authoritative — never truncated):",
    factPack.request,
    "",
    "FACT PACK (the only claims allowed in the copy):",
    factLines.length > 0 ? factLines.join("\n") : "- (no sourced facts — only the user request above)",
    "",
    `Brand required elements: ${factPack.brand.requiredElements.join("; ") || "(none)"}`,
    `Brand prohibited elements: ${factPack.brand.prohibitedElements.join("; ") || "(none)"}`,
    "",
    "Approved brand voice:",
    voiceBlock.length > 0 ? voiceBlock : "- (no voice notes provided)",
    "",
    "Write the social post copy in pt-BR following the JSON contract in the system prompt. Every factual claim in the copy must trace to the request or the fact pack above.",
  ].join("\n");
}

function renderRewritePrompt(input: {
  factPackPrompt: string;
  copy: SocialPostCopy;
  violations: readonly CopyClaimViolation[];
}): string {
  const violationLines = input.violations.map(
    (violation) => `- [${violation.class}] "${violation.value}" in ${violation.field}`,
  );
  return [
    "The copy below states claims that have NO origin in the request or fact pack.",
    "Rewrite it removing or replacing ONLY the unbacked claims with grounded text; keep everything else stable and follow the same JSON contract.",
    "",
    "Copy to fix:",
    JSON.stringify(input.copy),
    "",
    "Claims without origin:",
    violationLines.join("\n"),
    "",
    "Original instructions:",
    input.factPackPrompt,
  ].join("\n");
}

async function requestCopy(systemPrompt: string, userPrompt: string): Promise<SocialPostCopy> {
  const model = env.OPENAI_TEXT_MODEL || "gpt-4o-mini";
  const response = await getOpenAI().chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Social post copy generation returned an empty response");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(
      `Social post copy generation returned invalid JSON: ${(error as Error).message}`,
    );
  }

  // Fail loudly on schema mismatch — no silent defaults.
  return socialPostCopySchema.parse(parsed);
}

function truncateAtWordBoundary(text: string, max: number): string {
  if (text.length <= max) return text;
  const sliced = text.slice(0, max);
  const lastSpace = sliced.lastIndexOf(" ");
  return (lastSpace > 0 ? sliced.slice(0, lastSpace) : sliced).trim();
}

/** Deterministic E2E copy built exclusively from fact pack content. */
function buildControlledCopyFromFactPack(factPack: CreativeWorkFactPack): SocialPostCopy {
  const base = factPack.request.trim() || factPack.facts[0]?.value || "Trabalho criativo";
  return socialPostCopySchema.parse({
    headline: truncateAtWordBoundary(`UAT: ${base}`, 120),
    body: truncateAtWordBoundary(base, 600),
    cta: "Saiba mais",
  });
}

export async function generateSocialPostCopy(input: {
  brief: SocialPostBrief;
  /**
   * When present, the copy is generated from this frozen contract (full
   * request + sourced facts + brand) and passes through structured provenance
   * validation: one textual rewrite is allowed for claims without origin, then
   * the copy is blocked with CreativeCopyContextError (R-002 / spec 7.3).
   */
  factPack?: CreativeWorkFactPack;
  brandName: string;
  toneOfVoice: string | null;
  requiredElements: string | null;
  prohibitedElements: string | null;
}): Promise<SocialPostCopy> {
  const { brief, factPack, brandName, toneOfVoice, requiredElements, prohibitedElements } =
    input;

  if (isE2EControlledProviderEnabled()) {
    if (factPack) {
      const copy = buildControlledCopyFromFactPack(factPack);
      const violations = validateSocialPostCopyAgainstFactPack(copy, factPack);
      if (violations.length > 0) throw new CreativeCopyContextError(violations);
      return copy;
    }
    return socialPostCopySchema.parse({
      headline: `UAT: ${brief.theme}`,
      body: `${brief.objective} para ${brief.audience}. Oferta: ${brief.offer}.`,
      cta: "Saiba mais",
    });
  }

  if (!factPack) {
    // Legacy single-shot path kept for callers without a fact pack (e.g. the
    // paid copy regeneration endpoint); no provenance contract applies there.
    const voiceBlock = renderVoiceBlock(toneOfVoice, requiredElements, prohibitedElements);
    const legacyPrompt = [
      `Brand: ${brandName}`,
      "",
      "Brief:",
      `- Theme: ${brief.theme}`,
      `- Objective: ${brief.objective}`,
      `- Audience: ${brief.audience}`,
      `- Offer: ${brief.offer}`,
      "",
      "Approved brand voice:",
      voiceBlock.length > 0 ? voiceBlock : "- (no voice notes provided)",
      "",
      "Write the social post copy in pt-BR following the JSON contract in the system prompt.",
    ].join("\n");
    return requestCopy(SOCIAL_POST_COPY_SYSTEM_PROMPT, legacyPrompt);
  }

  const systemPrompt = SOCIAL_POST_COPY_SYSTEM_PROMPT + "\n" + FACT_PACK_GROUNDING_PROMPT;
  const factPackPrompt = renderFactPackPrompt({
    factPack,
    brandName,
    toneOfVoice,
    requiredElements,
    prohibitedElements,
  });

  const first = await requestCopy(systemPrompt, factPackPrompt);
  const firstViolations = validateSocialPostCopyAgainstFactPack(first, factPack);
  if (firstViolations.length === 0) return first;

  // Exactly one textual rewrite — it never consumes an image call (spec 7.3).
  let rewritten: SocialPostCopy;
  try {
    rewritten = await requestCopy(systemPrompt, renderRewritePrompt({
      factPackPrompt,
      copy: first,
      violations: firstViolations,
    }));
  } catch {
    // Unsafe validation: without a parsable rewrite the copy cannot be
    // trusted, so the preparation must fail as invalid_context.
    throw new CreativeCopyContextError(firstViolations);
  }
  const secondViolations = validateSocialPostCopyAgainstFactPack(rewritten, factPack);
  if (secondViolations.length > 0) throw new CreativeCopyContextError(secondViolations);
  return rewritten;
}
