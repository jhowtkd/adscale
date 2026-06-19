import { z } from "zod";
import { getOpenAI, extractOutputText } from "./utils";
import sharp from "sharp";
import { env } from "@/server/validation/env";
import {
  buildBaseReadingPromptSection,
  normalizeBaseCreativeReading,
  type BaseCreativeReading,
} from "./olhar/base-reading";

// ============================================
// Zod Schema
// ============================================

const preflightDimensionSchema = z.object({
  score: z.number().min(0).max(100),
  suggestion: z.string(),
});

const baseCreativeReadingSchema = z.object({
  dominantIdea: z.string(),
  gestaltRead: z.string(),
  inviteWeight: z.enum(["absent", "weak", "balanced", "overpowering"]),
  thumbnailRead: z.string(),
  brandPresence: z.enum(["absent", "weak", "present", "dominant"]),
  risks: z.array(z.string()).max(2),
});

export const preflightResultSchema = z.object({
  baseReading: baseCreativeReadingSchema.optional(),
  overallScore: z.number().min(0).max(100),
  breakdown: z.object({
    technicalQuality: preflightDimensionSchema,
    textLegibility: preflightDimensionSchema,
    visualHierarchy: preflightDimensionSchema,
    ctaProminence: preflightDimensionSchema,
    composition: preflightDimensionSchema,
    brandConsistency: preflightDimensionSchema,
    platformReadiness: preflightDimensionSchema,
  }),
  criticalIssues: z.array(z.string()),
  suggestions: z.array(z.string()),
  technical: z.object({
    actualWidth: z.number().int(),
    actualHeight: z.number().int(),
    claimedWidth: z.number().int().nullable(),
    claimedHeight: z.number().int().nullable(),
    aspectRatio: z.string(),
    format: z.string(),
    fileSizeBytes: z.number().int(),
    hasAlpha: z.boolean(),
    estimatedContrast: z.number().min(0).max(1),
  }),
});

export type PreflightResult = z.infer<typeof preflightResultSchema>;

export interface CampaignBrief {
  name?: string | null;
  client?: string | null;
  product?: string | null;
  objective?: string | null;
  audience?: string | null;
  platforms?: string[] | null;
  tone?: string | null;
  offer?: string | null;
  constraints?: string | null;
  notes?: string | null;
  ctaVariants?: string[] | null;
}

export interface PreflightInput {
  assetBuffer: Buffer;
  mimeType: string;
  claimedWidth?: number | null;
  claimedHeight?: number | null;
  campaignBrief?: CampaignBrief;
  locale?: string;
}

// ============================================
// Technical Analysis with sharp
// ============================================

interface TechnicalAnalysis {
  actualWidth: number;
  actualHeight: number;
  claimedWidth: number | null;
  claimedHeight: number | null;
  aspectRatio: string;
  format: string;
  fileSizeBytes: number;
  hasAlpha: boolean;
  estimatedContrast: number;
}

async function analyzeTechnical(
  buffer: Buffer,
  claimedWidth?: number | null,
  claimedHeight?: number | null
): Promise<TechnicalAnalysis> {
  const metadata = await sharp(buffer).metadata();

  const actualWidth = metadata.width ?? 0;
  const actualHeight = metadata.height ?? 0;

  // Estimate contrast using luminance standard deviation (grayscale)
  const grayStats = await sharp(buffer).greyscale().stats();
  const luminanceStd = grayStats.channels[0]?.stdev ?? 0;
  // Normalize roughly: sRGB std max is around 128, so divide by 128
  const estimatedContrast = Math.min(1, Math.max(0, luminanceStd / 128));

  const aspectRatio =
    actualHeight > 0
      ? simplifyRatio(actualWidth, actualHeight)
      : "unknown";

  return {
    actualWidth,
    actualHeight,
    claimedWidth: claimedWidth ?? null,
    claimedHeight: claimedHeight ?? null,
    aspectRatio,
    format: metadata.format ?? "unknown",
    fileSizeBytes: buffer.length,
    hasAlpha: metadata.hasAlpha ?? false,
    estimatedContrast: Math.round(estimatedContrast * 100) / 100,
  };
}

function simplifyRatio(w: number, h: number): string {
  if (w === 0 || h === 0) return "unknown";
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const d = gcd(w, h);
  return `${w / d}:${h / d}`;
}

// ============================================
// Creative Analysis with OpenAI Vision
// ============================================

function buildPreflightSystemPrompt(locale?: string): string {
  const lang = locale === "pt-BR" ? "pt-BR" : "en";

  return `You are a senior art director analyzing a BASE creative BEFORE any derivations are generated.

Start with a creative reading ("Leitura do base"), then keep the compatibility score fields for downstream analytics.

Return ONLY a JSON object:

{
  "baseReading": {
    "dominantIdea": "string — the single visual/communicative idea anchoring the piece",
    "gestaltRead": "string — how figure, ground, and reading path work together",
    "inviteWeight": "absent|weak|balanced|overpowering",
    "thumbnailRead": "string — what reads at feed thumbnail scale",
    "brandPresence": "absent|weak|present|dominant",
    "risks": ["string"]
  },
  "overallScore": 0-100,
  "breakdown": {
    "technicalQuality": { "score": 0-100, "suggestion": "string" },
    "textLegibility": { "score": 0-100, "suggestion": "string" },
    "visualHierarchy": { "score": 0-100, "suggestion": "string" },
    "ctaProminence": { "score": 0-100, "suggestion": "string" },
    "composition": { "score": 0-100, "suggestion": "string" },
    "brandConsistency": { "score": 0-100, "suggestion": "string" },
    "platformReadiness": { "score": 0-100, "suggestion": "string" }
  },
  "criticalIssues": ["string"],
  "suggestions": ["string"]
}

Scoring guidelines:
- technicalQuality: resolution, clarity, compression artifacts, color banding
- textLegibility: can you read the headline? CTA? Any text? Is font size adequate?
- visualHierarchy: is the offer clear? Do you know what is being sold within 1 second?
- ctaProminence: is the call-to-action visible, contrasting, and clear in the reading path?
- composition: rule of thirds, balance, negative space, alignment
- brandConsistency: if brand info is provided, does it match? Otherwise judge general professionalism
- platformReadiness: is it optimized for the chosen platforms? (e.g., too much text for Meta, wrong ratio for Stories)

Rules:
- Leitura do base is the primary judgment: dominant idea, gestalt, invite weight, thumbnail read, brand presence, and at most two real pre-generation risks
- overallScore remains a weighted average with heavy weight on textLegibility, ctaProminence, and visualHierarchy for compatibility
- Scores < 50 in any dimension create a critical issue
- Provide 1-3 criticalIssues max. Be specific: "Headline is too small to read on mobile" not "Bad text"
- Provide 3-5 actionable suggestions max. Each should be a concrete improvement
- Do not invent campaign details not visible in the image or brief
- Respond in ${lang === "pt-BR" ? "Brazilian Portuguese (pt-BR)" : "English"}`;
}

function buildPreflightUserPrompt(
  technical: TechnicalAnalysis,
  brief?: CampaignBrief
): string {
  const parts: string[] = [];

  parts.push(`Technical metadata:
- Actual dimensions: ${technical.actualWidth}x${technical.actualHeight}px
- Claimed dimensions: ${technical.claimedWidth ?? "N/A"}x${technical.claimedHeight ?? "N/A"}px
- Aspect ratio: ${technical.aspectRatio}
- Format: ${technical.format}
- File size: ${(technical.fileSizeBytes / 1024 / 1024).toFixed(2)}MB
- Has transparency: ${technical.hasAlpha ? "yes" : "no"}
- Estimated contrast: ${Math.round(technical.estimatedContrast * 100)}%`);

  if (brief) {
    parts.push(`Campaign brief:
- Name: ${brief.name || "N/A"}
- Client/Product: ${brief.client || brief.product || "N/A"}
- Objective: ${brief.objective || "N/A"}
- Audience: ${brief.audience || "N/A"}
- Platforms: ${brief.platforms?.join(", ") || "N/A"}
- Tone: ${brief.tone || "N/A"}
- Offer: ${brief.offer || "N/A"}
- Constraints: ${brief.constraints || "None"}
- CTAs: ${brief.ctaVariants?.join(", ") || "N/A"}`);
  }

  return parts.join("\n\n");
}

async function analyzeCreative(
  buffer: Buffer,
  mimeType: string,
  technical: TechnicalAnalysis,
  brief?: CampaignBrief,
  locale?: string
): Promise<Omit<PreflightResult, "technical">> {
  // Resize to reasonable max dimension before sending to OpenAI (max 20MB, tokens scale with size)
  const resized = await sharp(buffer)
    .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
    .toBuffer();

  const base64 = resized.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const prompt = buildPreflightUserPrompt(technical, brief);

  const response = await getOpenAI().responses.create({
    model: env.OPENAI_TEXT_MODEL,
    input: [
      { role: "system", content: buildPreflightSystemPrompt(locale) },
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: dataUrl, detail: "high" },
        ],
      },
    ],
    text: {
      format: {
        type: "json_object",
      },
    },
  });

  const raw = extractOutputText(response);
  if (!raw) {
    throw new Error("Empty vision response for preflight analysis");
  }

  const parsed = JSON.parse(raw) as unknown;

  const normalized = normalizePreflightResult(parsed);
  if (!normalized) {
    throw new Error("Malformed preflight analysis response");
  }

  return normalized;
}

function normalizePreflightResult(raw: unknown): Omit<PreflightResult, "technical"> | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n)));

  const getDim = (key: string) => {
    const d = (obj.breakdown as Record<string, unknown> | undefined)?.[key] as
      | Record<string, unknown>
      | undefined;
    return {
      score: clamp(Number(d?.score ?? 70)),
      suggestion: String(d?.suggestion ?? ""),
    };
  };

  const breakdown = {
    technicalQuality: getDim("technicalQuality"),
    textLegibility: getDim("textLegibility"),
    visualHierarchy: getDim("visualHierarchy"),
    ctaProminence: getDim("ctaProminence"),
    composition: getDim("composition"),
    brandConsistency: getDim("brandConsistency"),
    platformReadiness: getDim("platformReadiness"),
  };

  const overallScore = clamp(Number(obj.overallScore ?? 70));

  const suggestions = Array.isArray(obj.suggestions)
    ? obj.suggestions.filter((s): s is string => typeof s === "string")
    : [];

  // Ensure critical issues reflect any score < 50
  const dims = [
    { name: "textLegibility", ...breakdown.textLegibility },
    { name: "ctaProminence", ...breakdown.ctaProminence },
    { name: "visualHierarchy", ...breakdown.visualHierarchy },
    { name: "composition", ...breakdown.composition },
    { name: "brandConsistency", ...breakdown.brandConsistency },
    { name: "platformReadiness", ...breakdown.platformReadiness },
    { name: "technicalQuality", ...breakdown.technicalQuality },
  ];

  const criticalIssuesSet = new Set<string>();
  for (const dim of dims) {
    if (dim.score < 50) {
      criticalIssuesSet.add(`${dim.name}: ${dim.suggestion}`);
    }
  }
  const criticalIssues = [...criticalIssuesSet];

  const baseReading = normalizeBaseCreativeReading(
    (obj as { baseReading?: unknown }).baseReading
  );

  return {
    ...(baseReading ? { baseReading } : {}),
    overallScore,
    breakdown,
    criticalIssues,
    suggestions,
  };
}

// ============================================
// Public API
// ============================================

const ALLOWED_PREFLIGHT_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

export async function analyzePreflight(input: PreflightInput): Promise<PreflightResult> {
  if (!ALLOWED_PREFLIGHT_TYPES.includes(input.mimeType)) {
    throw new Error(`Unsupported file type for preflight analysis: ${input.mimeType}`);
  }

  const technical = await analyzeTechnical(
    input.assetBuffer,
    input.claimedWidth,
    input.claimedHeight
  );

  if (technical.actualWidth < 100 || technical.actualHeight < 100) {
    throw new Error(`Image dimensions too small for meaningful analysis: ${technical.actualWidth}x${technical.actualHeight}`);
  }

  const creative = await analyzeCreative(
    input.assetBuffer,
    input.mimeType,
    technical,
    input.campaignBrief,
    input.locale
  );

  return {
    ...creative,
    technical,
  };
}

// ============================================
// Prompt Builder Helper (for downstream use)
// ============================================

export function buildPreflightPromptSection(preflightResult: PreflightResult): string {
  const dims = preflightResult.breakdown;
  const lines: string[] = [];

  if (preflightResult.baseReading) {
    lines.push(buildBaseReadingPromptSection(preflightResult.baseReading), "");
  }

  lines.push(
    "## Pre-flight Analysis Results",
    `Overall Score: ${preflightResult.overallScore}/100`,
    "",
    "### Dimension Scores",
    `- Technical Quality: ${dims.technicalQuality.score}/100 — ${dims.technicalQuality.suggestion}`,
    `- Text Legibility: ${dims.textLegibility.score}/100 — ${dims.textLegibility.suggestion}`,
    `- Visual Hierarchy: ${dims.visualHierarchy.score}/100 — ${dims.visualHierarchy.suggestion}`,
    `- CTA Prominence: ${dims.ctaProminence.score}/100 — ${dims.ctaProminence.suggestion}`,
    `- Composition: ${dims.composition.score}/100 — ${dims.composition.suggestion}`,
    `- Brand Consistency: ${dims.brandConsistency.score}/100 — ${dims.brandConsistency.suggestion}`,
    `- Platform Readiness: ${dims.platformReadiness.score}/100 — ${dims.platformReadiness.suggestion}`,
    ""
  );

  if (preflightResult.criticalIssues.length > 0) {
    lines.push("### Critical Issues");
    for (const issue of preflightResult.criticalIssues) {
      lines.push(`- ${issue}`);
    }
    lines.push("");
  }

  if (preflightResult.suggestions.length > 0) {
    lines.push("### Suggestions");
    for (const suggestion of preflightResult.suggestions) {
      lines.push(`- ${suggestion}`);
    }
    lines.push("");
  }

  lines.push("### Technical Metadata");
  lines.push(`- Dimensions: ${preflightResult.technical.actualWidth}x${preflightResult.technical.actualHeight}px`);
  lines.push(`- Aspect Ratio: ${preflightResult.technical.aspectRatio}`);
  lines.push(`- Format: ${preflightResult.technical.format}`);
  lines.push(`- Estimated Contrast: ${Math.round(preflightResult.technical.estimatedContrast * 100)}%`);
  lines.push(`- Has Transparency: ${preflightResult.technical.hasAlpha ? "yes" : "no"}`);

  return lines.join("\n");
}
