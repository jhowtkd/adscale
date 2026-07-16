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
export type CreativeWorkSettings = { targetFormats: CreativeWorkFormat[] };
export type CreativeWorkInputSnapshot = {
  request: string;
  sources: Array<{
    sourceId: string;
    assetKey: string | null;
    mimeType: string | null;
    usage: CreativeSourceUsage;
    content: ContentBrief | null;
    style: StyleBrief | null;
  }>;
};
export type CreativeWorkStatus = "draft" | "ready" | "generating" | "partial" | "completed" | "failed";
export type CreativeWorkOutputStatus = "queued" | "processing" | "completed" | "failed";

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

export function quoteCreativeWork(input: {
  intent: CreativeWorkIntent;
  format: CreativeWorkFormat;
  targetFormats: readonly CreativeWorkFormat[];
}): { unitCount: number; credits: number } {
  const unitCount = input.intent === "format_adaptation"
    ? input.targetFormats.length
    : input.intent === "variations" || input.intent === "social_post"
      ? CREATIVE_LEVELS.length
      : 1;
  return { unitCount, credits: unitCount * 5 };
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
