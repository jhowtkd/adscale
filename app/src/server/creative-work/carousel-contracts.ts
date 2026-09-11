import { z } from "zod";
import { GENERATION_CREDIT_COSTS } from "@/lib/billing/credit-units";
import type { CreativeWorkInputSnapshot } from "./contracts";
import { slideDirectionSchema } from "./carousel-editorial-state";

export {
  validateTextFieldsAgainstFactPack,
  type GroundedTextField,
  type TextClaimViolation,
} from "./fact-pack";

export const CAROUSEL_NARRATIVE_ROLES = [
  "hook", "context", "problem", "argument", "evidence",
  "method", "bridge", "closing", "cta",
] as const;
export const CAROUSEL_LAYOUT_FAMILIES = ["impact", "development", "respite"] as const;
export const CAROUSEL_SLIDE_STATUSES = ["draft", "queued", "processing", "completed", "failed"] as const;

export type CarouselNarrativeRole = (typeof CAROUSEL_NARRATIVE_ROLES)[number];
export type CarouselLayoutFamily = (typeof CAROUSEL_LAYOUT_FAMILIES)[number];
export type CarouselCopyAuthority = "user_input" | "ai_proposal" | "human_edit";
export type CarouselSlideStatus = (typeof CAROUSEL_SLIDE_STATUSES)[number];

export function carouselLayoutFamilyForRole(role: CarouselNarrativeRole): CarouselLayoutFamily {
  if (role === "hook" || role === "problem" || role === "cta") return "impact";
  if (role === "bridge" || role === "closing") return "respite";
  return "development";
}

export const carouselSlidePlanSchema = z.object({
  slideId: z.string().trim().min(1),
  position: z.number().int().min(1).max(8),
  role: z.enum(CAROUSEL_NARRATIVE_ROLES),
  purpose: z.string().trim().min(1).max(320),
  primaryText: z.string().trim().min(1),
  secondaryText: z.string().nullable(),
  authority: z.enum(["user_input", "ai_proposal", "human_edit"]),
  sourceFactIds: z.array(z.string().trim().min(1)),
  layoutFamily: z.enum(CAROUSEL_LAYOUT_FAMILIES),
}).strict();
export type CarouselSlidePlanV1 = z.infer<typeof carouselSlidePlanSchema>;

export const carouselDeckPlanSchema = z.object({
  version: z.literal(1),
  revision: z.string().trim().min(1),
  workId: z.string().trim().min(1),
  objective: z.string().trim().min(1).max(240),
  audience: z.string().trim().max(240).nullable(),
  tone: z.string().trim().max(240).nullable(),
  promise: z.string().trim().min(1).max(320),
  format: z.enum(["4:5", "1:1"]),
  slides: z.array(carouselSlidePlanSchema).min(5).max(8),
}).strict();
export type CarouselDeckPlanV1 = z.infer<typeof carouselDeckPlanSchema>;

export const carouselBlockingQuestionSchema = z.object({
  id: z.string().trim().min(1),
  field: z.enum(["objective", "fact", "offer", "cta", "brand_conflict"]),
  question: z.string().trim().min(1),
  reason: z.string().trim().min(1),
}).strict();
export type CarouselBlockingQuestionV1 = z.infer<typeof carouselBlockingQuestionSchema>;

export const carouselEditorialChangeSchema = z.object({
  id: z.string().trim().min(1),
  slideId: z.string().trim().min(1).nullable(),
  field: z.enum(["position", "role", "purpose", "primaryText", "secondaryText"]),
  before: z.union([z.string(), z.number()]).nullable(),
  after: z.union([z.string(), z.number()]).nullable(),
  reason: z.string().trim().min(1),
  status: z.enum(["pending", "accepted", "rejected", "superseded"]),
}).strict();
export type CarouselEditorialChangeV1 = z.infer<typeof carouselEditorialChangeSchema>;

export const carouselDraftStateSchema = z.object({
  version: z.literal(1),
  revision: z.string().trim().min(1),
  answers: z.record(z.string(), z.string()),
  blockingQuestions: z.array(carouselBlockingQuestionSchema),
  plan: carouselDeckPlanSchema.nullable(),
  changes: z.array(carouselEditorialChangeSchema),
}).strict();
export type CarouselDraftStateV1 = z.infer<typeof carouselDraftStateSchema>;

export const carouselTextRegionSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  minFontPx: z.number().positive(),
  maxFontPx: z.number().positive(),
  align: z.enum(["left", "center", "right"]),
}).strict();
export type CarouselTextRegion = z.infer<typeof carouselTextRegionSchema>;

export const carouselLayoutPlanSchema = z.object({
  id: z.string().trim().min(1),
  density: z.enum(["high", "medium", "low"]),
  primaryRegion: carouselTextRegionSchema,
  secondaryRegion: carouselTextRegionSchema.nullable(),
  exactAssetSlots: z.array(z.object({
    assetKey: z.string().trim().min(1),
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
  }).strict()),
  backgroundInstruction: z.string().trim().min(1),
}).strict();
export type CarouselLayoutPlan = z.infer<typeof carouselLayoutPlanSchema>;

export const carouselVisualContractSchema = z.object({
  version: z.literal(1),
  brandSnapshotHash: z.string().trim().min(1),
  temporaryReferenceId: z.string().trim().min(1).nullable(),
  palette: z.array(z.string().trim().min(1)),
  typography: z.object({
    fontAssetKey: z.string().trim().min(1).nullable(),
    fallbackFamily: z.literal("sans").nullable(),
    authority: z.enum(["approved", "fallback"]),
  }).strict(),
  directionInstruction: z.string().trim().min(1).nullable(),
  layoutFamilies: z.object({
    impact: carouselLayoutPlanSchema,
    development: carouselLayoutPlanSchema,
    respite: carouselLayoutPlanSchema,
  }).strict(),
  recurringMotifs: z.array(z.string().trim().min(1)),
  exactAssetKeys: z.array(z.string().trim().min(1)),
  prohibitedElements: z.array(z.string().trim().min(1)),
  safeAreaPx: z.number().int().nonnegative(),
  contractHash: z.string().trim().min(1),
}).strict();
export type CarouselVisualContractV1 = z.infer<typeof carouselVisualContractSchema>;

export const carouselDeckQualitySchema = z.object({
  version: z.literal(1),
  objectivePassed: z.boolean(),
  advisoryWarnings: z.array(z.string()),
  contactSheetKey: z.string().trim().min(1).nullable(),
  reviewedAt: z.string().trim().min(1).nullable(),
}).strict();
export type CarouselDeckQualityV1 = z.infer<typeof carouselDeckQualitySchema>;

export const CAROUSEL_GENERATION_SCOPES = ["cover", "interiors"] as const;
export type CarouselGenerationScope = (typeof CAROUSEL_GENERATION_SCOPES)[number];

export const carouselPreparedSnapshotSchema = z.object({
  version: z.literal(1),
  preparedRevision: z.string().trim().min(1),
  deck: carouselDeckPlanSchema,
  visualContract: carouselVisualContractSchema,
  generationScope: z.enum(CAROUSEL_GENERATION_SCOPES).optional(),
  scriptRevision: z.string().trim().min(1).optional(),
  storyboard: z.array(slideDirectionSchema).max(8).optional(),
  caption: z.string().trim().max(400).nullable().optional(),
}).strict();
export type CarouselPreparedSnapshotV1 = z.infer<typeof carouselPreparedSnapshotSchema>;

/**
 * Resolve the frozen carousel deck/visual envelope from an input snapshot.
 * Legacy and non-carousel snapshots have no block and resolve to null; an
 * unrecognizable block is treated as absent instead of failing reads.
 */
export function resolveCarouselPreparedSnapshot(
  snapshot: Pick<CreativeWorkInputSnapshot, "carousel"> | null | undefined,
): CarouselPreparedSnapshotV1 | null {
  if (!snapshot?.carousel) return null;
  const parsed = carouselPreparedSnapshotSchema.safeParse(snapshot.carousel);
  return parsed.success ? parsed.data : null;
}

/** Cover, ceil-middle and closing anchor positions of a 5-8 slide deck. */
export function carouselAnchorPositions(slideCount: number): [number, number, number] {
  if (!Number.isInteger(slideCount) || slideCount < 5 || slideCount > 8) {
    throw new Error("carousel_deck_slide_count_out_of_range");
  }
  return [1, Math.ceil(slideCount / 2), slideCount];
}

/** One credit unit per billed image, settled only on dispatch. */
export function quoteCarouselUnits(unitCount: number): { unitCount: number; credits: number } {
  if (!Number.isInteger(unitCount) || unitCount < 0) {
    throw new Error("carousel_quote_unit_count_out_of_range");
  }
  return {
    unitCount,
    credits: unitCount * GENERATION_CREDIT_COSTS.creativeWorkOutput,
  };
}

/** Deck-size quote: one credit unit per slide, settled only on dispatch. */
export function quoteCarouselDeck(slideCount: number): { unitCount: number; credits: number } {
  return quoteCarouselUnits(slideCount);
}

export type CarouselStructureFindingCode =
  | "invalid_format"
  | "slide_count"
  | "missing_hook"
  | "duplicate_position"
  | "duplicate_slide_id"
  | "multiple_cta"
  | "blank_copy";

export type CarouselStructureFinding = {
  path: string;
  code: CarouselStructureFindingCode;
  message: string;
};

/**
 * Objective integrity of a deck (never a quality score): 5-8 slides, 4:5|1:1,
 * position 1 is the hook, at most one CTA, unique positions and slide ids and
 * no blank copy. Pure and deterministic.
 */
export function validateCarouselDeckStructure(deck: CarouselDeckPlanV1): CarouselStructureFinding[] {
  const findings: CarouselStructureFinding[] = [];
  if (deck.format !== "4:5" && deck.format !== "1:1") {
    findings.push({ path: "format", code: "invalid_format", message: "carousel format must be 4:5 or 1:1" });
  }
  if (deck.slides.length < 5 || deck.slides.length > 8) {
    findings.push({ path: "slides", code: "slide_count", message: "carousel deck must have between 5 and 8 slides" });
  }
  const seenIds = new Set<string>();
  const seenPositions = new Set<number>();
  let ctaSeen = false;
  deck.slides.forEach((slide, index) => {
    if (seenIds.has(slide.slideId)) {
      findings.push({ path: `slides.${index}.slideId`, code: "duplicate_slide_id", message: "slideId is not unique in the deck" });
    }
    seenIds.add(slide.slideId);
    if (seenPositions.has(slide.position)) {
      findings.push({ path: `slides.${index}.position`, code: "duplicate_position", message: "position is not unique in the deck" });
    }
    seenPositions.add(slide.position);
    if (index === 0 && slide.role !== "hook") {
      findings.push({ path: "slides.0.role", code: "missing_hook", message: "the first slide must be the hook" });
    }
    if (slide.role === "cta") {
      if (ctaSeen) {
        findings.push({ path: `slides.${index}.role`, code: "multiple_cta", message: "the deck must have at most one CTA slide" });
      }
      ctaSeen = true;
    }
    if (!slide.primaryText.trim()) {
      findings.push({ path: `slides.${index}.primaryText`, code: "blank_copy", message: "primaryText is blank" });
    }
    if (slide.secondaryText !== null && !slide.secondaryText.trim()) {
      findings.push({ path: `slides.${index}.secondaryText`, code: "blank_copy", message: "secondaryText is blank" });
    }
  });
  return findings;
}
