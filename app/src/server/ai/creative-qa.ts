import { env } from "@/server/validation/env";
import { getOpenAI, extractOutputText } from "./utils";
import type { CreativeContract } from "./creative-contract";
import {
  CREATIVE_QA_CORE_CRITERIA,
  type CreativeQaCriterion,
} from "./creative-quality-taxonomy";

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
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 3)
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

export function buildCreativeQaPrompt(input: Omit<AnalyzeCreativeQaInput, "imageBuffer" | "mimeType">) {
  const isRestyling = input.contract?.generationMode === "restyling" || input.derivation.generationMode === "restyling";
  const hasStyleRef = Boolean(input.contract?.styleAssetId);

  const checklistKeys = isRestyling && hasStyleRef
    ? [...CREATIVE_QA_CORE_CRITERIA, "styleFidelity"].join(", ")
    : CREATIVE_QA_CORE_CRITERIA.join(", ");

  const styleFidelityInstruction = isRestyling && hasStyleRef
    ? `\nFor styleFidelity (restyling mode only): Check whether the output contains factual claims (price, brand name, product name, offer text, CTA text, course name, location) that were copied from the style reference rather than the base image. Mark as failed if such contamination is detected, warning if uncertain, passed if all facts clearly come from the base image content.`
    : "";

  return `Review this final ad creative before export.
Return only JSON with status, checklist, issues, and suggestions.

Allowed status values: ready, warning, review.
Checklist keys: ${checklistKeys}.
Each checklist item must include status passed/warning/failed and a short note.

Export must remain allowed. Use warning or review to guide the user, not to block them.

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

Evaluate legibility, exact CTA and offer preservation, information preservation, briefing fit, format fit, and simple creative risk.
For informationPreservation, check whether important text, offer, CTA, logo, product/service, badges, small print, faces, and other information-bearing elements from the brief or creative diagnosis were cropped, hidden, truncated, blurred, overlapped, deleted, or made too small to read.
For art_variation, also check whether the result rearranged elements intentionally instead of solving the variation by cropping the key ad.${styleFidelityInstruction}
Do not invent new facts, claims, offers, products, logos, or CTAs.
Keep issues and suggestions short and actionable.
Locale for user-facing notes: ${input.locale}.`;
}

export async function analyzeCreativeQa(input: AnalyzeCreativeQaInput): Promise<CreativeQaResult> {
  const dataUrl = `data:${input.mimeType};base64,${input.imageBuffer.toString("base64")}`;
  const response = await getOpenAI().responses.create({
    model: env.OPENAI_TEXT_MODEL,
    input: [
      { role: "system", content: "You are an expert creative QA reviewer for paid social ads." },
      {
        role: "user",
        content: [
          { type: "input_text", text: buildCreativeQaPrompt(input) },
          { type: "input_image", image_url: dataUrl, detail: "high" },
        ],
      },
    ],
    text: { format: { type: "json_object" } },
  });

  const raw = extractOutputText(response);
  if (!raw) throw new Error("Empty vision response for creative QA");
  return normalizeCreativeQaResult(JSON.parse(raw));
}
