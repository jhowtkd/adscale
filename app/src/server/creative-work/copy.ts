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
import {
  copySafeBrandElements,
  partitionBrandKitForCopy,
  type CopySafeBrandVoice,
} from "./brand-field-routing";
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
  "- NEVER write visual production instructions as copy (no logo placement, hex colors, background colors, typography rules, or layout directions).",
].join("\n");

const FACT_PACK_GROUNDING_PROMPT = [
  "",
  "FACTUAL GROUNDING (mandatory):",
  "- Use ONLY facts present in the user request or in the FACT PACK below.",
  "- NEVER invent or assume prices, discounts, dates, deadlines, offers, benefits, proofs, conditions, credentials, brands, products, services or numbers.",
  "- Information that is absent from the request and the fact pack must stay absent from the copy.",
  "- Prohibited claims must never appear.",
  "- If a LEGAL DISCLAIMER is listed, include its exact text once in the body (never paraphrase, never repeat).",
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

function renderVoiceBlock(voice: CopySafeBrandVoice): string {
  const lines: string[] = [];
  if (voice.toneOfVoice && voice.toneOfVoice.trim().length > 0) {
    lines.push(`- Tone of voice: ${voice.toneOfVoice.trim()}`);
  }
  for (const disclaimer of voice.legalDisclaimers) {
    lines.push(`- LEGAL DISCLAIMER (include exact text once in body): ${disclaimer}`);
  }
  if (voice.prohibitedClaims.length > 0) {
    lines.push(`- Prohibited claims: ${voice.prohibitedClaims.join("; ")}`);
  }
  return lines.join("\n");
}

function renderFactLine(fact: CreativeFact): string {
  const origin = fact.origin === "source"
    ? `source ${fact.sourceId ?? "?"}`
    : fact.origin;
  return `- [${fact.class}] "${fact.value}" (origin: ${origin}; ${fact.required ? "required" : "allowed"})`;
}

/** Project the fact pack's brand slice to copy-safe elements only. */
function factPackForCopyPrompt(factPack: CreativeWorkFactPack): CreativeWorkFactPack {
  const safe = copySafeBrandElements({
    requiredElements: factPack.brand.requiredElements.join("\n"),
    prohibitedElements: factPack.brand.prohibitedElements.join("\n"),
  });
  return {
    ...factPack,
    brand: {
      requiredElements: safe.requiredElements,
      prohibitedElements: safe.prohibitedElements,
    },
  };
}

function renderFactPackPrompt(input: {
  factPack: CreativeWorkFactPack;
  brandName: string;
  voice: CopySafeBrandVoice;
}): string {
  const { brandName, voice } = input;
  const factPack = factPackForCopyPrompt(input.factPack);
  const voiceBlock = renderVoiceBlock(voice);
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
    `Legal disclaimers (exact text, once): ${factPack.brand.requiredElements.join("; ") || "(none)"}`,
    `Prohibited claims: ${factPack.brand.prohibitedElements.join("; ") || "(none)"}`,
    "",
    "Approved brand voice:",
    voiceBlock.length > 0 ? voiceBlock : "- (no voice notes provided)",
    "",
    "Write the social post copy in pt-BR following the JSON contract in the system prompt. Every factual claim in the copy must trace to the request or the fact pack above. Do not turn brand-kit visual rules into headline, body, or CTA.",
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
  const legal = copySafeBrandElements({
    requiredElements: factPack.brand.requiredElements.join("\n"),
  }).requiredElements[0];
  const body = legal
    ? truncateAtWordBoundary(`${base} ${legal}`, 600)
    : truncateAtWordBoundary(base, 600);
  return socialPostCopySchema.parse({
    headline: truncateAtWordBoundary(`UAT: ${base}`, 120),
    body,
    cta: "Saiba mais",
  });
}

function resolveCopyVoice(input: {
  toneOfVoice: string | null;
  requiredElements: string | null;
  prohibitedElements: string | null;
  toneNotes?: string | null;
  description?: string | null;
  constraints?: string | null;
}): CopySafeBrandVoice {
  return partitionBrandKitForCopy({
    toneOfVoice: input.toneOfVoice,
    toneNotes: input.toneNotes ?? null,
    description: input.description ?? null,
    requiredElements: input.requiredElements,
    prohibitedElements: input.prohibitedElements,
    constraints: input.constraints ?? null,
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
  toneNotes?: string | null;
  description?: string | null;
  constraints?: string | null;
}): Promise<SocialPostCopy> {
  const { brief, factPack, brandName } = input;
  const voice = resolveCopyVoice(input);

  if (isE2EControlledProviderEnabled()) {
    if (factPack) {
      const copy = buildControlledCopyFromFactPack(factPack);
      const violations = validateSocialPostCopyAgainstFactPack(
        copy,
        factPackForCopyPrompt(factPack),
      );
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
    const voiceBlock = renderVoiceBlock(voice);
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
      "Write the social post copy in pt-BR following the JSON contract in the system prompt. Never write visual production instructions as copy.",
    ].join("\n");
    return requestCopy(SOCIAL_POST_COPY_SYSTEM_PROMPT, legacyPrompt);
  }

  const systemPrompt = SOCIAL_POST_COPY_SYSTEM_PROMPT + "\n" + FACT_PACK_GROUNDING_PROMPT;
  const groundedPack = factPackForCopyPrompt(factPack);
  const factPackPrompt = renderFactPackPrompt({
    factPack,
    brandName,
    voice,
  });

  const first = await requestCopy(systemPrompt, factPackPrompt);
  const firstViolations = validateSocialPostCopyAgainstFactPack(first, groundedPack);
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
  const secondViolations = validateSocialPostCopyAgainstFactPack(rewritten, groundedPack);
  if (secondViolations.length > 0) throw new CreativeCopyContextError(secondViolations);
  return rewritten;
}
