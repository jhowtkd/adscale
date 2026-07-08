import { z } from "zod";
import type {
  BrandTrainingAnalysis,
  BrandTrainingCategory,
  BrandTrainingUsageMode,
} from "@/server/brand-training/contracts";

export const CREATIVE_LEVELS = ["conservative", "balanced", "bold"] as const;
export type CreativeLevel = (typeof CREATIVE_LEVELS)[number];
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

export const createCreativeWorkSchema = z.object({
  clientProfileId: z.string().uuid(),
  toolKind: z.literal("social_post"),
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