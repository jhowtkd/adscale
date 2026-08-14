import sharp from "sharp";
import { env } from "@/server/validation/env";
import { getOpenAI, extractOutputText } from "./utils";
import type { CreativeContract } from "./creative-contract";
import { resolveAllowedEntitiesForCampaign } from "./creative-corpus";
import { isE2EControlledProviderEnabled } from "./providers/e2e-controlled-provider";
import type { GenerationMode } from "@/server/generation/canonical/types";
import type {
  CreativeWorkFactPack,
  SocialPostCopy,
} from "@/server/creative-work/contracts";
import type { CreativeWorkReferenceRole } from "@/server/creative-work/reference-plan";
import {
  CREATIVE_QA_CORE_CRITERIA,
  type CreativeQaCriterion,
} from "./creative-quality-taxonomy";
import {
  buildObservableQaRubricSection,
  extractObservableRubricSection,
} from "./observable-rubric";

export { extractObservableRubricSection };

export type { CreativeQaCriterion } from "./creative-quality-taxonomy";

export type CreativeQaStatus = "ready" | "warning" | "review" | "failed";
export type CreativeQaCheckStatus = "passed" | "warning" | "failed";

export interface CreativeQaCriterionResult {
  status: CreativeQaCheckStatus;
  note: string;
}

export type CreativeQaChecklist = Record<CreativeQaCriterion, CreativeQaCriterionResult>;

export interface CreativeQaResult {
  status: CreativeQaStatus;
  checklist: CreativeQaChecklist;
  issues: string[];
  suggestions: string[];
}

const FALLBACK_NOTE = "Needs a quick manual review.";

function asStatus(value: unknown): CreativeQaStatus {
  return value === "ready" || value === "warning" || value === "review" ? value : "warning";
}

function asCheckStatus(value: unknown): CreativeQaCheckStatus {
  return value === "passed" || value === "warning" || value === "failed" ? value : "warning";
}

function asShortList(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .slice(0, 3)
        .map((item) => item.trim())
    : [];
}

export function normalizeCreativeQaResult(value: unknown): CreativeQaResult {
  const input = (value && typeof value === "object" ? value : {}) as {
    status?: unknown;
    checklist?: Record<string, { status?: unknown; note?: unknown }>;
    issues?: unknown;
    suggestions?: unknown;
  };

  const checklist = CREATIVE_QA_CORE_CRITERIA.reduce((acc, criterion) => {
    const item = input.checklist?.[criterion];
    acc[criterion] = {
      status: asCheckStatus(item?.status),
      note:
        typeof item?.note === "string" && item.note.trim().length > 0
          ? item.note.trim()
          : FALLBACK_NOTE,
    };
    return acc;
  }, {} as CreativeQaChecklist);

  // styleFidelity: only include if model actually returned it — do NOT add warning fallback for non-restyling responses
  const rawStyleFidelity = input.checklist?.["styleFidelity"];
  if (rawStyleFidelity) {
    (checklist as Record<string, CreativeQaCriterionResult>)["styleFidelity"] = {
      status: asCheckStatus(rawStyleFidelity.status),
      note:
        typeof rawStyleFidelity.note === "string" && rawStyleFidelity.note.trim().length > 0
          ? rawStyleFidelity.note.trim()
          : FALLBACK_NOTE,
    };
  }

  const hasFallback = CREATIVE_QA_CORE_CRITERIA.some(
    (criterion) => checklist[criterion].note === FALLBACK_NOTE
  );
  const issues = asShortList(input.issues);
  const suggestions = asShortList(input.suggestions);

  return {
    status: hasFallback ? "warning" : asStatus(input.status),
    checklist,
    issues: issues.length > 0 ? issues : ["Review the creative before export."],
    suggestions: suggestions.length > 0 ? suggestions : ["Export is still available, but consider a quick visual check."],
  };
}

export interface AnalyzeCreativeQaInput {
  imageBuffer: Buffer;
  mimeType: string;
  baseImageBuffer?: Buffer;
  baseMimeType?: string;
  styleImageBuffer?: Buffer;
  styleMimeType?: string;
  locale: string;
  campaign: {
    name: string;
    client: string;
    product: string;
    offer: string;
    objective: string;
    audience: string;
    tone?: string | null;
    creativeDiagnosis?: unknown;
  };
  derivation: {
    ctaText: string | null | undefined;
    format: string | null | undefined;
    generationMode: string | null | undefined;
  };
  contract?: CreativeContract | null;
}

type CreativeQaPromptInput = Omit<
  AnalyzeCreativeQaInput,
  | "imageBuffer"
  | "mimeType"
  | "baseImageBuffer"
  | "baseMimeType"
  | "styleImageBuffer"
  | "styleMimeType"
>;

export function buildCreativeQaPrompt(input: CreativeQaPromptInput) {
  const isRestyling = input.contract?.generationMode === "restyling" || input.derivation.generationMode === "restyling";
  const hasStyleRef = Boolean(input.contract?.styleAssetId);

  const checklistKeys = isRestyling && hasStyleRef
    ? [...CREATIVE_QA_CORE_CRITERIA, "styleFidelity"].join(", ")
    : CREATIVE_QA_CORE_CRITERIA.join(", ");

  const styleFidelityInstruction = isRestyling && hasStyleRef
    ? `\nFor styleFidelity (restyling mode only): Check whether the output contains factual claims (price, brand name, product name, offer text, CTA text, course name, location) that were copied from the style reference rather than the base image. Also fail when the output reproduces the style reference's full ad layout, hero composition, or copied text blocks instead of restyling the base campaign. Mark as failed if such contamination is detected, warning if uncertain, passed if all facts clearly come from the base image content and the composition reads as base-content restyled.`
    : "";

  const restylingBrandInstruction = isRestyling
    ? `\nFor briefMatch in restyling: compare OUTPUT against FACTUAL BASE pixel content. Campaign fields and registry entries are context only, never permission to add visible content. Any brand name, logo, or wordmark in OUTPUT that is not visibly present in FACTUAL BASE is a wrong_brand failure — even when it exactly matches the campaign client or allowed registry. If presence or identity is visually uncertain, return warning instead of failed. Mark invented_factual_entity when a fictional company, team, or trademark is invented.`
    : "";

  const allowedEntities = resolveAllowedEntitiesForCampaign({
    name: input.campaign.name,
    client: input.campaign.client,
  });
  const allowedEntitiesInstruction = allowedEntities && !isRestyling
    ? `\nFor briefMatch: compare visible people, brands, products, and claims against the campaign allowed entity registry — people: ${allowedEntities.people.join(", ") || "none"}; brands: ${allowedEntities.brands.join(", ")}; products: ${allowedEntities.products.join(", ")}; claims: ${allowedEntities.claims.join(", ")}. Flag invented_factual_entity when the output depicts entities absent from this list.`
    : "";

  const rubricSection = buildObservableQaRubricSection({
    generationMode: input.contract?.generationMode ?? input.derivation.generationMode ?? undefined,
    targetFormat: input.derivation.format ?? input.contract?.targetFormat ?? undefined,
    dominantIdea: input.contract?.canonicalCreative?.dominantIdea,
  });

  return `Run two passes on this final ad creative before export.

## Passagem Olhar (art direction)
Judge figure, gestalt, voice, and invite in the intended format and context.
Name what works and what blocks the creative idea.
Factual integrity problems (invented facts, wrong brand, unsupported offers) belong to Exportacao — do not soften them into art-direction opinion.

## Exportacao (compliance checklist)
Return only JSON with status, checklist, issues, and suggestions.

Allowed status values: ready, warning, review.
Checklist keys: ${checklistKeys}.
Each checklist item must include status passed/warning/failed and a short note.

Reserve status "failed" for objective defects only: invented or incorrect facts, an unusable output format, image corruption, or severe cropping of factual elements (offer, brand, required legal text).
Art-direction observations (hierarchy, overload, generic template feel, legibility trade-offs) go in the creativeRisk note as ranking advice — use "warning" plus a specific note, not "failed".
Overall QA status may be "review" when multiple warnings exist; do not mark "ready" if any criterion is "failed".

Campaign:
- Name: ${input.campaign.name}
- Client: ${input.campaign.client}
- Product: ${input.campaign.product}
- Offer: ${input.campaign.offer}
- Objective: ${input.campaign.objective}
- Audience: ${input.campaign.audience}
- Tone: ${input.campaign.tone ?? "not specified"}
- Creative diagnosis: ${JSON.stringify(input.campaign.creativeDiagnosis ?? null)}

Derivation:
- Exact CTA: ${input.derivation.ctaText ?? "none"}
- Format: ${input.derivation.format ?? "unknown"}
- Generation mode: ${input.derivation.generationMode ?? "unknown"}

Evaluate legibility, CTA and offer intent, information preservation, briefing fit, format fit, and simple creative risk.
CTA POLICY: CTA absence and paraphrase are allowed — a creative may omit the CTA or reword it. When a CTA is rendered, ask whether it preserves the same action intent as the campaign CTA; flag ctaOffer as failed only when the rendered CTA invents or changes an offer, price, or claim.
TEXT INTEGRITY: scan all visible copy for garbled or corrupted words (e.g. "ESPECIALITAS" instead of "ESPECIALISTAS") — these are objective rendering defects, not style choices.
For informationPreservation, check whether important text, offer, CTA, logo, product/service, badges, small print, faces, and other information-bearing elements from the brief or creative diagnosis were cropped, hidden, truncated, blurred, overlapped, deleted, or made too small to read.
For art_variation, also check whether the result rearranged elements intentionally instead of solving the variation by cropping the key ad.${styleFidelityInstruction}${restylingBrandInstruction}${allowedEntitiesInstruction}
${rubricSection}
Do not invent new facts, claims, offers, products, logos, or CTAs.
Keep issues and suggestions short and actionable.
Locale for user-facing notes: ${input.locale}.`;
}

export async function analyzeCreativeQa(input: AnalyzeCreativeQaInput): Promise<CreativeQaResult> {
  if (isE2EControlledProviderEnabled()) {
    const checklist = CREATIVE_QA_CORE_CRITERIA.reduce((acc, criterion) => {
      acc[criterion] = {
        status: "passed",
        note: "Deterministic local E2E quality check passed.",
      };
      return acc;
    }, {} as CreativeQaChecklist);
    if (
      input.contract?.generationMode === "restyling" &&
      input.contract.styleAssetId
    ) {
      (checklist as Record<string, CreativeQaCriterionResult>).styleFidelity = {
        status: "passed",
        note: "Deterministic local E2E style fidelity check passed.",
      };
    }
    return {
      status: "ready",
      checklist,
      issues: [],
      suggestions: [],
    };
  }

  const dataUrl = `data:${input.mimeType};base64,${input.imageBuffer.toString("base64")}`;
  const content: Array<
    | { type: "input_text"; text: string }
    | { type: "input_image"; image_url: string; detail: "high" }
  > = [
    { type: "input_text", text: buildCreativeQaPrompt(input) },
    { type: "input_text", text: "OUTPUT:" },
    { type: "input_image", image_url: dataUrl, detail: "high" },
  ];

  if (input.baseImageBuffer) {
    content.push(
      { type: "input_text", text: "FACTUAL BASE:" },
      {
        type: "input_image",
        image_url: `data:${input.baseMimeType ?? "image/png"};base64,${input.baseImageBuffer.toString("base64")}`,
        detail: "high",
      }
    );
  }
  if (input.styleImageBuffer) {
    content.push(
      { type: "input_text", text: "STYLE REFERENCE:" },
      {
        type: "input_image",
        image_url: `data:${input.styleMimeType ?? "image/png"};base64,${input.styleImageBuffer.toString("base64")}`,
        detail: "high",
      }
    );
  }
  const checklistKeys = [
    ...CREATIVE_QA_CORE_CRITERIA,
    ...(input.contract?.generationMode === "restyling" && input.contract.styleAssetId
      ? ["styleFidelity" as const]
      : []),
  ];
  const checklistItemSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      status: { type: "string", enum: ["passed", "warning", "failed"] },
      note: { type: "string" },
    },
    required: ["status", "note"],
  } as const;
  const response = await getOpenAI().responses.create(
    {
      model: env.OPENAI_TEXT_MODEL,
      input: [
        { role: "system", content: "You are an expert creative QA reviewer for paid social ads." },
        {
          role: "user",
          content,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "creative_qa",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              status: { type: "string", enum: ["ready", "warning", "review"] },
              checklist: {
                type: "object",
                additionalProperties: false,
                properties: Object.fromEntries(
                  checklistKeys.map((key) => [key, checklistItemSchema])
                ),
                required: checklistKeys,
              },
              issues: { type: "array", items: { type: "string" }, maxItems: 3 },
              suggestions: { type: "array", items: { type: "string" }, maxItems: 3 },
            },
            required: ["status", "checklist", "issues", "suggestions"],
          },
        },
      },
    },
    { timeout: 180_000, maxRetries: 0 }
  );

  const raw = extractOutputText(response);
  if (!raw) throw new Error("Empty vision response for creative QA");
  return normalizeCreativeQaResult(JSON.parse(raw));
}

// ---------------------------------------------------------------------------
// Creative Work v1 objective QA (R-005 / spec 9).
//
// The objective evaluator decides integrity only — never taste. Three kinds of
// evidence feed the persisted tri-state verdict:
//   1. deterministic file/dimension/reference checks (no vision model);
//   2. this visual evaluation, contextualized by the frozen fact pack and the
//      role-bound reference plan;
//   3. the evaluator's own technical status — timeout/error/ambiguity persists
//      `inconclusive`, never a rejection and never a retry trigger.
// Subjective scoring lives in creative-score.ts and stays advisory.
// ---------------------------------------------------------------------------

/** Tri-state objective verdict persisted in `creative_work_outputs.quality`. */
export type CreativeWorkObjectiveVerdict = "pass" | "fail" | "inconclusive";

/**
 * Objective failure codes for Creative Work v1 (spec 9.1). The persisted
 * `quality.objectiveCodes` array feeds the surgical correction contract
 * (`CreativeWorkObjectiveCorrection`, T6/T8) — keep values stable.
 */
export const CREATIVE_WORK_OBJECTIVE_FAILURE_CODES = [
  /** A required fact is absent from — or altered in — the rendered piece. */
  "missing_required_fact",
  /** A rendered claim has no origin in the fact pack or request. */
  "unsupported_claim",
  /** Wrong brand, logo, product or service is rendered. */
  "wrong_brand",
  /** Facts/copy/brand/layout leaked from the style reference. */
  "style_reference_contamination",
  /** A mandatory reference was not honored by the generation. */
  "ignored_mandatory_reference",
  /** Rendered dimensions differ from the canonical target format. */
  "wrong_dimensions",
  /** The produced file is corrupted or otherwise unusable. */
  "unusable_file",
  /** Factual elements are severely cropped out of the piece. */
  "cropped_critical_content",
  /** Factual text chosen by the output is illegible or garbled. */
  "unreadable_required_text",
] as const;

export type CreativeWorkObjectiveFailureCode =
  (typeof CREATIVE_WORK_OBJECTIVE_FAILURE_CODES)[number];

/**
 * Codes the vision evaluator may assign. Deterministic-only codes
 * (`wrong_dimensions`, `unusable_file`) are never model-emitted — they come
 * from the file/dimension checks, which do not depend on the vision model.
 */
export const CREATIVE_WORK_VISION_FAILURE_CODES: readonly CreativeWorkObjectiveFailureCode[] =
  CREATIVE_WORK_OBJECTIVE_FAILURE_CODES.filter(
    (code) => code !== "wrong_dimensions" && code !== "unusable_file",
  );

export interface CreativeWorkQaFinding {
  code: CreativeWorkObjectiveFailureCode;
  /**
   * `confirmed` forces `objectiveVerdict: "fail"` regardless of any score.
   * `suspected` is evaluator ambiguity and resolves to `inconclusive`.
   */
  status: "confirmed" | "suspected";
  /** Model-reported confidence for advisory review; never changes the verdict policy. */
  confidence?: number;
  note: string;
}

export interface CreativeWorkQaResult {
  findings: CreativeWorkQaFinding[];
  summary: string;
}

/**
 * Deterministic file check result — no vision model involved (criterion 5).
 * Discriminated union: a decodable file always carries concrete
 * width/height, a failed one always carries the error — callers never need
 * non-null assertions.
 */
export type CreativeWorkFileInspection =
  | {
      ok: true;
      width: number;
      height: number;
      format: string | null;
      bytes: number;
      error: null;
    }
  | {
      ok: false;
      width: number | null;
      height: number | null;
      format: string | null;
      bytes: number;
      error: string;
    };

function shortErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").trim().slice(0, 160) || "unknown error";
}

/**
 * Decode the produced image and report its real dimensions. A buffer sharp
 * cannot parse is an objective `unusable_file` failure; a parseable file with
 * unexpected dimensions is `wrong_dimensions` (decided by the caller).
 */
export async function inspectCreativeWorkImageFile(
  imageBuffer: Buffer,
): Promise<CreativeWorkFileInspection> {
  const bytes = imageBuffer.byteLength;
  try {
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width ?? null;
    const height = metadata.height ?? null;
    if (!width || !height) {
      return {
        ok: false,
        width,
        height,
        format: metadata.format ?? null,
        bytes,
        error: "image dimensions could not be determined",
      };
    }
    return {
      ok: true,
      width,
      height,
      format: metadata.format ?? null,
      bytes,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      width: null,
      height: null,
      format: null,
      bytes,
      error: shortErrorMessage(error),
    };
  }
}

export interface AnalyzeCreativeWorkQaReference {
  role: CreativeWorkReferenceRole;
  label: string;
  required: boolean;
  buffer: Buffer;
  mimeType: string;
}

export interface AnalyzeCreativeWorkQaInput {
  imageBuffer: Buffer;
  mimeType: string;
  /** Canonical mode resolved by the protocol translation (R-001). */
  mode: GenerationMode;
  format: string;
  /** Full untruncated user request — factual authority of origin "request". */
  request: string;
  copy: Pick<SocialPostCopy, "headline" | "body" | "cta">;
  /** Fact pack frozen at prepare time (R-002); null only on anomalous snapshots. */
  factPack: CreativeWorkFactPack | null;
  brandName: string | null;
  /** References actually attached to the generation call, in provider order. */
  references: readonly AnalyzeCreativeWorkQaReference[];
  locale: string;
  /**
   * 1-based attempt of the provider call that produced the assessed image.
   * Only consumed by the deterministic local E2E branch (R-010 markers) —
   * the production evaluator is attempt-agnostic.
   */
  attempt?: number;
}

type CreativeWorkQaPromptInput = Omit<
  AnalyzeCreativeWorkQaInput,
  "imageBuffer" | "mimeType" | "references"
> & { references: readonly AnalyzeCreativeWorkQaReference[] };

function creativeWorkQaModePolicy(mode: GenerationMode): string {
  switch (mode) {
    case "format_adaptation":
      return [
        "MODE POLICY — FORMAT ADAPTATION:",
        "- The output must be the SAME piece as the original art: same facts, essential text, brand, concept and visual direction. Only composition, scale and spatial distribution change for the new format.",
        "- A result that reinvents the concept, drops the original art or changes brand/facts is an objective failure (ignored_mandatory_reference, missing_required_fact or wrong_brand).",
      ].join("\n");
    case "restyling":
      return [
        "MODE POLICY — RESTYLE:",
        "- The CONTENT authority preserves facts, subject and essential elements; the STYLE authority transfers only palette, typography, texture, light, rhythm and atmosphere.",
        "- Any brand name, product, copy, price or complete ad layout copied from the STYLE reference is style_reference_contamination.",
        "- Required facts or the content subject that vanished are missing_required_fact or ignored_mandatory_reference.",
      ].join("\n");
    case "creative_revision":
      return [
        "MODE POLICY — REVISION:",
        "- The revision instruction must be applied WITHOUT breaking required facts, brand or the contract of the parent piece.",
        "- A revision that alters facts, brand or offer while applying the instruction is an objective failure.",
      ].join("\n");
    case "art_variation":
    case "social_post":
    default:
      return [
        "MODE POLICY — SINGLE PIECE / VARIATION:",
        "- The piece must preserve every REQUIRED fact and the authoritative brand exactly; visual language may vary freely within the creative level.",
        "- Rendered facts or claims with no origin in the fact pack, request, validated copy or authoritative brand are unsupported_claim; a rendered brand different from the authoritative one is wrong_brand.",
      ].join("\n");
  }
}

function factPackSection(input: CreativeWorkQaPromptInput): string {
  const factPack = input.factPack;
  if (!factPack) {
    // Anomalous snapshot (prepare always freezes one): the request is the
    // sole factual authority — same defensive posture as the job.
    return [
      "FACT PACK — AUDITABLE FACTUAL CONTRACT:",
      "(no frozen fact pack — the REQUEST below is the sole factual authority)",
      `REQUEST: ${input.request}`,
      `BRAND NAME: ${input.brandName ?? "none declared"}`,
    ].join("\n");
  }
  const required = factPack.facts.filter((fact) => fact.required);
  const allowed = factPack.facts.filter((fact) => !fact.required);
  const factLine = (fact: (typeof factPack.facts)[number]) =>
    `- [${fact.class}] "${fact.value}" (origin: ${fact.origin}${fact.sourceId ? `, source: ${fact.sourceId}` : ""})`;
  return [
    "FACT PACK — AUDITABLE FACTUAL CONTRACT:",
    `REQUEST: ${factPack.request}`,
    "REQUIRED FACTS (each must survive into the piece; absence or alteration is missing_required_fact):",
    ...(required.length > 0 ? required.map(factLine) : ["- none"]),
    "ALLOWED FACTS (may appear; never required):",
    ...(allowed.length > 0 ? allowed.map(factLine) : ["- none"]),
    `BRAND NAME: ${factPack.identity.brandName ?? input.brandName ?? "none declared"}`,
    `REQUIRED BRAND ELEMENTS: ${factPack.brand.requiredElements.join("; ") || "none"}`,
    `PROHIBITED BRAND ELEMENTS (their presence is an objective failure): ${factPack.brand.prohibitedElements.join("; ") || "none"}`,
  ].join("\n");
}

export function buildCreativeWorkQaPrompt(input: CreativeWorkQaPromptInput): string {
  const referenceLines =
    input.references.length > 0
      ? input.references.map(
          (reference, index) =>
            `- #${index + 1} [${reference.role}] "${reference.label}"${reference.required ? " (required)" : ""} — image #${index + 1} is the attached image in this position`,
        )
      : ["- none — the output was generated without visual references"];

  return `Run the objective integrity evaluation of this generated ad creative.

You decide ONLY objective integrity. Composition, impact, originality, rhythm, density, CTA prominence and generic-looking aesthetics are SUBJECTIVE signals scored elsewhere — they must never appear in your findings.

## Objective failure codes (the only values allowed in findings[].code)
- missing_required_fact: a REQUIRED fact from the fact pack is absent or altered in the rendered piece.
- unsupported_claim: the piece renders a factual claim (price, date, offer, condition, credential, guarantee, benefit, proof, named entity) with no origin in the fact pack, request, validated copy or authoritative brand.
- wrong_brand: the rendered brand, logo, product or service is wrong — including a prohibited brand element.
- style_reference_contamination: facts, copy, brand or the complete ad layout were copied from the STYLE reference instead of the content authority.
- ignored_mandatory_reference: a required reference was visibly ignored (for example an adaptation that does not preserve the original art).
- cropped_critical_content: factual elements (offer, brand, required text, product) are severely cropped.
- unreadable_required_text: factual text rendered by the output is illegible, garbled or corrupted.

## Verdict discipline
- findings[].status is "confirmed" ONLY when you are visually certain; use "suspected" when the evidence is genuinely ambiguous.
- Dimensions and file integrity are validated deterministically elsewhere — never report them.
- An empty findings array means the output is objectively sound.

${factPackSection(input)}

## VALIDATED COPY (approved textual authority chosen before generation)
- Exact or semantically equivalent rendering of this headline, body or CTA is authorized and is not an unsupported_claim merely because it is not repeated in the fact pack.
- HEADLINE: ${input.copy.headline}
- BODY: ${input.copy.body}
- CTA: ${input.copy.cta}

## DETERMINISTIC COMPOSITION AND REFERENCE AUTHORITY
- In a single social_post, the exact logo/brand assets and approved copy may be composited after the provider image. Their presence in the OUTPUT is authorized; do not require a matching provider reference or flag the deterministic layer as ignored_mandatory_reference.
- A reference marked optional is guidance only. In social_post, optional style and brand_identity references are never mandatory.
- Use ignored_mandatory_reference only when a reference explicitly marked required is visibly omitted, or when the mode policy says a required original/content/style authority was not preserved.

${creativeWorkQaModePolicy(input.mode)}

## REFERENCES ATTACHED TO THE GENERATION CALL
${referenceLines.join("\n")}

TARGET FORMAT: ${input.format}

Return only JSON: { "findings": [{ "code", "status", "confidence": 0.0, "note" }], "summary": "<one sentence>" }.
Keep notes short and evidence-based. Locale for notes: ${input.locale}.`;
}

const MAX_CREATIVE_WORK_QA_FINDINGS = 6;

function asFindingStatus(value: unknown): "confirmed" | "suspected" | null {
  return value === "confirmed" || value === "suspected" ? value : null;
}

export function normalizeCreativeWorkQaResult(value: unknown): CreativeWorkQaResult {
  const input = (value && typeof value === "object" ? value : {}) as {
    findings?: unknown;
    summary?: unknown;
  };
  const allowedCodes = new Set<string>(CREATIVE_WORK_VISION_FAILURE_CODES);
  const byCode = new Map<string, CreativeWorkQaFinding>();
  const rawFindings = Array.isArray(input.findings) ? input.findings : [];
  for (const raw of rawFindings) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as { code?: unknown; status?: unknown; confidence?: unknown; note?: unknown };
    const code = typeof item.code === "string" ? item.code.trim() : "";
    const status = asFindingStatus(item.status);
    const note = typeof item.note === "string" ? item.note.trim() : "";
    const confidence = typeof item.confidence === "number" && Number.isFinite(item.confidence)
      ? Math.min(1, Math.max(0, item.confidence))
      : undefined;
    if (!allowedCodes.has(code) || !status || note.length === 0) continue;
    const typedCode = code as CreativeWorkObjectiveFailureCode;
    const existing = byCode.get(code);
    // One finding per code; a confirmed observation always wins over a
    // suspected one for the same defect.
    if (!existing || (existing.status === "suspected" && status === "confirmed")) {
      byCode.set(code, { code: typedCode, status, ...(confidence === undefined ? {} : { confidence }), note });
    }
  }
  return {
    findings: [...byCode.values()].slice(0, MAX_CREATIVE_WORK_QA_FINDINGS),
    summary: typeof input.summary === "string" ? input.summary.trim() : "",
  };
}

export async function analyzeCreativeWorkQa(
  input: AnalyzeCreativeWorkQaInput,
): Promise<CreativeWorkQaResult> {
  if (isE2EControlledProviderEnabled()) {
    // R-010 deterministic objective-QA matrix (markers travel in the frozen
    // request): qa-error → evaluator failure (inconclusive); qa-fail-always
    // → confirmed objective failure on every attempt (terminal + refund);
    // qa-fail-once → confirmed failure only on the first attempt so the
    // exclusive correction can succeed on the second.
    if (input.request.includes("[e2e:qa-error]")) {
      throw new Error("controlled_e2e_qa_evaluator_failure");
    }
    const failAlways = input.request.includes("[e2e:qa-fail-always]");
    const failOnce =
      input.request.includes("[e2e:qa-fail-once]") && (input.attempt ?? 1) === 1;
    if (failAlways || failOnce) {
      return {
        findings: [{
          code: "unsupported_claim",
          status: "confirmed",
          confidence: 0.99,
          note: "[e2e] alegação controlada sem origem factual.",
        }],
        summary: "Deterministic local E2E objective QA failed.",
      };
    }
    return {
      findings: [],
      summary: "Deterministic local E2E objective QA passed.",
    };
  }

  const content: Array<
    | { type: "input_text"; text: string }
    | { type: "input_image"; image_url: string; detail: "high" }
  > = [
    { type: "input_text", text: buildCreativeWorkQaPrompt(input) },
    { type: "input_text", text: "OUTPUT UNDER REVIEW:" },
    {
      type: "input_image",
      image_url: `data:${input.mimeType};base64,${input.imageBuffer.toString("base64")}`,
      detail: "high",
    },
  ];
  input.references.forEach((reference, index) => {
    content.push(
      {
        type: "input_text",
        text: `REFERENCE #${index + 1} [${reference.role}] "${reference.label}"${reference.required ? " (required)" : ""}:`,
      },
      {
        type: "input_image",
        image_url: `data:${reference.mimeType};base64,${reference.buffer.toString("base64")}`,
        detail: "high",
      },
    );
  });

  const response = await getOpenAI().responses.create(
    {
      model: env.OPENAI_TEXT_MODEL,
      input: [
        {
          role: "system",
          content:
            "You are the objective integrity evaluator for generated ad creatives. You report only factual/brand/reference defects with structured codes — never taste.",
        },
        { role: "user", content },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "creative_work_objective_qa",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              findings: {
                type: "array",
                maxItems: MAX_CREATIVE_WORK_QA_FINDINGS,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    code: {
                      type: "string",
                      enum: [...CREATIVE_WORK_VISION_FAILURE_CODES],
                    },
                    status: { type: "string", enum: ["confirmed", "suspected"] },
                    confidence: { type: "number", minimum: 0, maximum: 1 },
                    note: { type: "string" },
                  },
                  required: ["code", "status", "confidence", "note"],
                },
              },
              summary: { type: "string" },
            },
            required: ["findings", "summary"],
          },
        },
      },
    },
    { timeout: 180_000, maxRetries: 0 },
  );

  const raw = extractOutputText(response);
  if (!raw) throw new Error("Empty vision response for creative work QA");
  return normalizeCreativeWorkQaResult(JSON.parse(raw));
}
