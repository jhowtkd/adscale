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
/**
 * Brand authority chosen by the user when a restyle content art carries an
 * explicit brand that conflicts with the active workspace brand (R-003 /
 * spec 8.4). Optional: drafts without a detected conflict never carry it.
 */
export const CREATIVE_WORK_BRAND_CHOICES = ["source", "active"] as const;
export type CreativeWorkBrandChoice = (typeof CREATIVE_WORK_BRAND_CHOICES)[number];

export type CreativeDirectionId = string;
export type CreativeDirectionSafetyBand = "safe" | "experimental";
export type CreativeDirectionProvenance = "default" | "ai-suggestion" | "manual";

export interface CreativeDirection {
  id: CreativeDirectionId;
  label: string;
  instruction: string;
  order: number;
  safetyBand: CreativeDirectionSafetyBand;
  provenance: CreativeDirectionProvenance;
}

export interface CreativeDirectionPool {
  version: number;
  directions: CreativeDirection[];
  selectedIds: CreativeDirectionId[];
  manualInstruction: string | null;
}

export const DEFAULT_CREATIVE_DIRECTIONS: CreativeDirection[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    label: "Conservadora",
    instruction: "Preserve a composição, a hierarquia e os elementos essenciais da referência, variando apenas a execução com segurança.",
    order: 0,
    safetyBand: "safe",
    provenance: "default",
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    label: "Equilibrada",
    instruction: "Mantenha a identidade da referência e proponha uma variação clara de composição, copy e tratamento visual.",
    order: 1,
    safetyBand: "safe",
    provenance: "default",
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    label: "Ousada",
    instruction: "Explore uma direção visual mais expressiva e contrastante, sem perder os fatos, a marca e a intenção do pedido.",
    order: 2,
    safetyBand: "experimental",
    provenance: "default",
  },
];

export function createDefaultCreativeDirectionPool(): CreativeDirectionPool {
  return {
    version: 1,
    directions: DEFAULT_CREATIVE_DIRECTIONS.map((direction) => ({ ...direction })),
    selectedIds: DEFAULT_CREATIVE_DIRECTIONS.map((direction) => direction.id),
    manualInstruction: null,
  };
}

export type CreativeWorkSettings = {
  targetFormats: CreativeWorkFormat[];
  formatMode?: "auto" | "manual";
  /**
   * Brand-authority choice for the restyle conflict (R-003). It only
   * auto-resolves the conflict it answered — see `brandConflictDetectedBrand`.
   */
  brandConflictChoice?: CreativeWorkBrandChoice;
  /**
   * The `detectedBrand` of the conflict `brandConflictChoice` answered. A
   * choice whose detected brand does not match the current conflict never
   * auto-resolves it: prepare asks again. Absent on settings persisted before
   * the two were bound on this branch (never shipped to production); those
   * behave as unbound and also ask again.
   */
  brandConflictDetectedBrand?: string;
  /**
   * Ordered pool of persistent creative directions, the active selection and
   * an optional manual instruction. Absent on drafts created before the
   * directions feature; those keep the historical three-level behavior.
   */
  directionPool?: CreativeDirectionPool;
};
export const CREATIVE_WORK_GENERATION_POLICY_VERSIONS = ["legacy", "quality_recovery_v1"] as const;
export type CreativeWorkGenerationPolicyVersion = (typeof CREATIVE_WORK_GENERATION_POLICY_VERSIONS)[number];

/** Auditable origin of a normalized fact (R-002 / spec 7.1). */
export const CREATIVE_FACT_ORIGINS = ["request", "source", "brand"] as const;
export type CreativeFactOrigin = (typeof CREATIVE_FACT_ORIGINS)[number];

/**
 * Claim classes the IA may never invent (spec 7.2) plus `text` for the
 * essential text of an original art that adaptations must preserve (R-002
 * criterion 4). Facts only exist when explicitly present in an origin.
 */
export const CREATIVE_FACT_CLASSES = [
  "price",
  "date",
  "offer",
  "benefit",
  "proof",
  "condition",
  "credential",
  "modality",
  "guarantee",
  "brand",
  "product",
  "service",
  "text",
] as const;
export type CreativeFactClass = (typeof CREATIVE_FACT_CLASSES)[number];

export const creativeFactSchema = z.object({
  value: z.string().trim().min(1),
  class: z.enum(CREATIVE_FACT_CLASSES),
  /** True when the fact must survive into the piece, false when only allowed. */
  required: z.boolean(),
  origin: z.enum(CREATIVE_FACT_ORIGINS),
  /** Present when origin is "source": the creative work source that stated the fact. */
  sourceId: z.string().trim().min(1).optional(),
});
export type CreativeFact = z.infer<typeof creativeFactSchema>;

export const CREATIVE_WORK_FACT_PACK_VERSION = 1 as const;

/**
 * Versioned, optional snapshot block (R-002 / spec 7.1). It is an auditable
 * projection only — the request, the source analyses and the brand kit remain
 * the sources of truth. Rows written before R-002 simply lack the block.
 */
export const creativeWorkFactPackSchema = z.object({
  version: z.literal(CREATIVE_WORK_FACT_PACK_VERSION),
  /** Full, untruncated user request — the factual authority for origin "request". */
  request: z.string(),
  facts: z.array(creativeFactSchema),
  brand: z.object({
    requiredElements: z.array(z.string()),
    prohibitedElements: z.array(z.string()),
  }),
  /** Brand identity resolved as authoritative for this execution. */
  identity: z.object({
    clientProfileId: z.string(),
    brandName: z.string().nullable(),
    /**
     * Which brand governs the piece (R-003): the active workspace brand or
     * the explicit brand found in the content art (user-chosen). Absent on
     * fact packs written before R-003; those behave as "active".
     */
    brandAuthority: z.enum(["active", "source"]).optional(),
  }),
});
export type CreativeWorkFactPack = z.infer<typeof creativeWorkFactPackSchema>;

export type CreativeWorkInputSnapshot = {
  /**
   * Generation policy frozen at prepare time (R-011). Jobs obey this value
   * instead of the live env switch. Absent on snapshots written before the
   * switch existed; those behave as "legacy".
   */
  generationPolicyVersion?: CreativeWorkGenerationPolicyVersion;
  /**
   * Fact pack frozen at prepare time (R-002). Absent on snapshots written
   * before the fact pack existed; those stay readable and are rebuilt.
   */
  factPack?: CreativeWorkFactPack;
  request: string;
  settings: CreativeWorkSettings;
  sources: Array<{
    sourceId: string;
    updatedAt: string;
    assetKey: string | null;
    mimeType: string | null;
    /**
     * Frozen display name (asset file name) used for provider-facing
     * reference labels. Absent on snapshots frozen before the label existed;
     * the reference plan falls back to a role label, never the raw id.
     */
    label?: string | null;
    usage: CreativeSourceUsage;
    content: ContentBrief | null;
    style: StyleBrief | null;
  }>;
};

/**
 * Read the optional fact pack from an input snapshot. Snapshots written
 * before R-002 have no block and resolve to null; an unrecognizable block is
 * treated as absent instead of failing reads of legacy rows.
 */
export function resolveCreativeWorkFactPack(
  snapshot: Pick<CreativeWorkInputSnapshot, "factPack"> | null | undefined,
): CreativeWorkFactPack | null {
  if (!snapshot?.factPack) return null;
  const parsed = creativeWorkFactPackSchema.safeParse(snapshot.factPack);
  return parsed.success ? parsed.data : null;
}

/**
 * Resolve the generation policy frozen in an input snapshot. Snapshots
 * written before the temporary rollout switch have no version and behave as
 * "legacy"; unknown values never activate the new routing.
 */
export function resolveGenerationPolicyVersion(
  snapshot: Pick<CreativeWorkInputSnapshot, "generationPolicyVersion"> | null | undefined,
): CreativeWorkGenerationPolicyVersion {
  return snapshot?.generationPolicyVersion === "quality_recovery_v1" ? "quality_recovery_v1" : "legacy";
}

/** Map the temporary env switch to the version frozen into new snapshots. */
export function generationPolicyVersionFromSwitch(enabled: string | undefined): CreativeWorkGenerationPolicyVersion {
  return enabled === "true" ? "quality_recovery_v1" : "legacy";
}
export type CreativeWorkStatus = "draft" | "ready" | "generating" | "partial" | "completed" | "failed";
export type CreativeWorkOutputStatus = "queued" | "processing" | "completed" | "failed";
export type CreativeWorkOutputPlan = {
  creativeLevel: CreativeLevel;
  targetFormat: CreativeWorkFormat;
  versionNumber: 1;
  directionId?: string;
  directionSnapshot?: { label: string; instruction: string; order: number };
};

export const creativeWorkIntentSchema = z.enum(CREATIVE_WORK_INTENTS);
export const creativeWorkFormatSchema = z.enum(["1:1", "4:5", "9:16"]);

export const creativeDirectionSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1),
  instruction: z.string().trim().min(1),
  order: z.number().int().min(0),
  safetyBand: z.enum(["safe", "experimental"]),
  provenance: z.enum(["default", "ai-suggestion", "manual"]),
});

export const creativeDirectionPoolSchema = z.object({
  version: z.number().int().nonnegative(),
  directions: z.array(creativeDirectionSchema).min(1),
  selectedIds: z.array(z.string().trim().min(1)).min(1).max(5),
  manualInstruction: z.string().nullable(),
}).superRefine((value, context) => {
  const ids = value.directions.map((direction) => direction.id);
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["directions"],
      message: "directionIdsMustBeUnique",
    });
  }
  for (let index = 0; index < value.selectedIds.length; index += 1) {
    const selectedId = value.selectedIds[index];
    if (!uniqueIds.has(selectedId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["selectedIds", index],
        message: "selectedIdNotInPool",
      });
    }
    // Each selected direction prices and persists exactly one output — a
    // duplicate id would double-charge a single persisted row.
    if (value.selectedIds.indexOf(selectedId) !== index) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["selectedIds", index],
        message: "selectedIdsMustBeUnique",
      });
    }
  }
});

export const creativeWorkSettingsSchema = z.object({
  targetFormats: z.array(creativeWorkFormatSchema),
  formatMode: z.enum(["auto", "manual"]).optional(),
  brandConflictChoice: z.enum(CREATIVE_WORK_BRAND_CHOICES).optional(),
  brandConflictDetectedBrand: z.string().trim().min(1).optional(),
  directionPool: creativeDirectionPoolSchema.optional(),
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
  // Audience may be empty: unknown targeting stays absent instead of
  // receiving a generic placeholder like "Público da marca" (R-002 / spec 7.2).
  audience: z.string().trim().max(240),
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
  directionPool?: CreativeDirectionPool;
}): { plans: CreativeWorkOutputPlan[]; unitCount: number; credits: number } {
  if (input.directionPool && input.directionPool.selectedIds.length > 0) {
    const byId = new Map(input.directionPool.directions.map((direction) => [direction.id, direction]));
    const plans: CreativeWorkOutputPlan[] = input.directionPool.selectedIds.map((id) => {
      const direction = byId.get(id);
      if (!direction) {
        throw new Error(`selected direction id not found in pool: ${id}`);
      }
      return {
        creativeLevel: "balanced" as const,
        targetFormat: input.format,
        versionNumber: 1,
        directionId: direction.id,
        directionSnapshot: {
          label: direction.label,
          instruction: direction.instruction,
          order: direction.order,
        },
      };
    });
    return { plans, unitCount: plans.length, credits: plans.length * 5 };
  }
  const plans: CreativeWorkOutputPlan[] = input.intent === "variations" || input.intent === "social_post"
    ? CREATIVE_LEVELS.map((creativeLevel) => ({ creativeLevel, targetFormat: input.format, versionNumber: 1 }))
    // Exactly one output per target format, without duplicates (R-001).
    : (input.intent === "format_adaptation" ? [...new Set(input.targetFormats)] : [input.format])
      .map((targetFormat) => ({ creativeLevel: "balanced" as const, targetFormat, versionNumber: 1 }));
  return { plans, unitCount: plans.length, credits: plans.length * 5 };
}

export interface CreativeWorkIdentityAssetSnapshot {
  referenceId: string;
  assetKey: string;
  label: string;
  category: BrandTrainingCategory;
  usageMode: BrandTrainingUsageMode;
  /** May be null for legacy / incomplete training rows persisted before approval gates. */
  analysis: BrandTrainingAnalysis | null;
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
