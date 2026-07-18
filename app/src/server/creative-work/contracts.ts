import { z } from "zod";
import type {
  BrandTrainingAnalysis,
  BrandTrainingCategory,
  BrandTrainingUsageMode,
} from "@/server/brand-training/contracts";
import type { ContentBrief, StyleBrief } from "@/server/ai/image-analysis";

export const CREATIVE_LEVELS = ["conservative", "balanced", "bold"] as const;
export const CREATIVE_WORK_INTENTS = [
  "social_post",
  "variations",
  "single",
  "format_adaptation",
  "restyle",
] as const;
export const CREATIVE_SOURCE_USAGES = ["content", "style", "both"] as const;
export const CREATIVE_SOURCE_STATUSES = ["uploaded", "analyzing", "ready", "failed"] as const;
export type CreativeLevel = (typeof CREATIVE_LEVELS)[number];
export type CreativeWorkIntent = (typeof CREATIVE_WORK_INTENTS)[number];
export type CreativeSourceUsage = (typeof CREATIVE_SOURCE_USAGES)[number];
export type CreativeSourceStatus = (typeof CREATIVE_SOURCE_STATUSES)[number];
export type CreativeWorkFormat = "1:1" | "4:5" | "9:16";
export type CreativeWorkSettings = { targetFormats: CreativeWorkFormat[]; formatMode?: "auto" | "manual" };
export type CreativeWorkInputSnapshot = {
  request: string;
  settings: CreativeWorkSettings;
  sources: Array<{
    sourceId: string;
    updatedAt: string;
    assetKey: string | null;
    mimeType: string | null;
    usage: CreativeSourceUsage;
    content: ContentBrief | null;
    style: StyleBrief | null;
  }>;
};
export type CreativeWorkStatus = "draft" | "ready" | "generating" | "partial" | "completed" | "failed";
export type CreativeWorkOutputStatus = "queued" | "processing" | "completed" | "failed";
export type CreativeWorkOutputPlan = {
  creativeLevel: CreativeLevel;
  targetFormat: CreativeWorkFormat;
  versionNumber: 1;
};

export const creativeWorkIntentSchema = z.enum(CREATIVE_WORK_INTENTS);
export const creativeWorkFormatSchema = z.enum(["1:1", "4:5", "9:16"]);
export const creativeWorkSettingsSchema = z.object({
  targetFormats: z.array(creativeWorkFormatSchema),
  formatMode: z.enum(["auto", "manual"]).optional(),
});
export const creativeWorkPreparationSchema = z.object({
  intent: creativeWorkIntentSchema,
  format: creativeWorkFormatSchema,
  settings: creativeWorkSettingsSchema,
}).superRefine((value, context) => {
  if (value.intent === "format_adaptation" && value.settings.targetFormats.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["settings", "targetFormats"], message: "targetFormatsRequired" });
  }
});

export const socialPostBriefSchema = z.object({
  theme: z.string().trim().min(1).max(240),
  objective: z.string().trim().min(1).max(240),
  audience: z.string().trim().min(1).max(240),
  offer: z.string().trim().min(1).max(240),
});

export const socialPostCopySchema = z.object({
  headline: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(600),
  cta: z.string().trim().min(1).max(80),
});

export type SocialPostBrief = z.infer<typeof socialPostBriefSchema>;
export type SocialPostCopy = z.infer<typeof socialPostCopySchema>;

/** Human-readable request for the composer; never raw JSON. */
export function requestTextFromBrief(
  brief: Pick<SocialPostBrief, "theme" | "objective" | "offer"> | Record<string, unknown>,
): string {
  const theme = typeof brief.theme === "string" ? brief.theme.trim() : "";
  const offer = typeof brief.offer === "string" ? brief.offer.trim() : "";
  const objective = typeof brief.objective === "string" ? brief.objective.trim() : "";
  const composed = [theme, offer].filter(Boolean).join(" — ");
  return composed || objective || theme || "Trabalho criativo";
}

/** Recover a readable request when legacy rows stored `JSON.stringify(brief)`. */
export function displayRequestForCreativeWork(work: {
  request: string;
  brief?: Pick<SocialPostBrief, "theme" | "objective" | "offer"> | Record<string, unknown> | null;
}): string {
  if (typeof work.request !== "string") return "";
  const trimmed = work.request.trim();
  if (!trimmed.startsWith("{")) return work.request;
  if (work.brief && typeof work.brief === "object") {
    return requestTextFromBrief(work.brief);
  }
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (parsed && typeof parsed === "object") return requestTextFromBrief(parsed);
  } catch {
    /* keep original */
  }
  return work.request;
}

export function quoteCreativeWork(input: {
  intent: CreativeWorkIntent;
  format: CreativeWorkFormat;
  targetFormats: readonly CreativeWorkFormat[];
}): { plans: CreativeWorkOutputPlan[]; unitCount: number; credits: number } {
  const plans: CreativeWorkOutputPlan[] = input.intent === "variations" || input.intent === "social_post"
    ? CREATIVE_LEVELS.map((creativeLevel) => ({ creativeLevel, targetFormat: input.format, versionNumber: 1 }))
    : (input.intent === "format_adaptation" ? input.targetFormats : [input.format])
      .map((targetFormat) => ({ creativeLevel: "balanced", targetFormat, versionNumber: 1 }));
  return { plans, unitCount: plans.length, credits: plans.length * 5 };
}

export interface CreativeWorkIdentityAssetSnapshot {
  referenceId: string;
  assetKey: string;
  label: string;
  category: BrandTrainingCategory;
  usageMode: BrandTrainingUsageMode;
  analysis: BrandTrainingAnalysis;
  mimeType: string;
  hasAlpha: boolean;
  placement: { gravity: "northwest" | "northeast" | "southwest" | "southeast" | "center"; widthRatio: number } | null;
}

export interface CreativeWorkIdentitySnapshot {
  clientProfileId: string;
  confirmedAt: string;
  assets: CreativeWorkIdentityAssetSnapshot[];
  brandKit: {
    colors: string[];
    fonts: string[];
    toneOfVoice: string | null;
    prohibitedElements: string | null;
    requiredElements: string | null;
  };
}

/**
 * Create-body for Criar Post. `toolKind` is optional and ignored for routing —
 * the server always starts with intent social_post (Phase 5 / item 34).
 */
export const createCreativeWorkSchema = z.object({
  clientProfileId: z.string().uuid(),
  toolKind: z.literal("social_post").optional().default("social_post"),
  format: z.enum(["1:1", "4:5", "9:16"]),
  brief: socialPostBriefSchema,
});

export function resolveCreativeWorkStatus(statuses: CreativeWorkOutputStatus[]): CreativeWorkStatus {
  if (statuses.length === 0) return "ready";
  if (statuses.every((status) => status === "completed")) return "completed";
  if (statuses.every((status) => status === "failed")) return "failed";
  if (statuses.some((status) => status === "queued" || status === "processing")) return "generating";
  return "partial";
}
