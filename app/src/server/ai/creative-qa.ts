import OpenAI from "openai";
import { env } from "@/server/validation/env";

export type CreativeQaStatus = "ready" | "warning" | "review" | "failed";
export type CreativeQaCheckStatus = "passed" | "warning" | "failed";
export type CreativeQaCriterion =
  | "legibility"
  | "ctaOffer"
  | "informationPreservation"
  | "briefMatch"
  | "formatFit"
  | "creativeRisk";

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

const CRITERIA: CreativeQaCriterion[] = [
  "legibility",
  "ctaOffer",
  "informationPreservation",
  "briefMatch",
  "formatFit",
  "creativeRisk",
];

function getOpenAI() {
  return new OpenAI({ apiKey: env.OPENAI_API_KEY });
}

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

  const checklist = CRITERIA.reduce((acc, criterion) => {
    const item = input.checklist?.[criterion];
    acc[criterion] = {
      status: asCheckStatus(item?.status),
      note:
        typeof item?.note === "string" && item.note.trim().length > 0
          ? item.note.trim()
          : "Needs a quick manual review.",
    };
    return acc;
  }, {} as CreativeQaChecklist);

  const hasFallback = CRITERIA.some((criterion) => checklist[criterion].note === "Needs a quick manual review.");
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
}

export function buildCreativeQaPrompt(input: Omit<AnalyzeCreativeQaInput, "imageBuffer" | "mimeType">) {
  return `Review this final ad creative before export.
Return only JSON with status, checklist, issues, and suggestions.

Allowed status values: ready, warning, review.
Checklist keys: legibility, ctaOffer, informationPreservation, briefMatch, formatFit, creativeRisk.
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
For art_variation, also check whether the result rearranged elements intentionally instead of solving the variation by cropping the key ad.
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

  const raw = (response as unknown as { output_text?: string }).output_text;
  if (!raw) throw new Error("Empty vision response for creative QA");
  return normalizeCreativeQaResult(JSON.parse(raw));
}
