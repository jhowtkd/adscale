import { z } from "zod";

/** Versioned vision/structure inference — never mixed with deterministic metrics. */
export const VISION_STRUCTURE_VERSION = 1 as const;

export const LAYOUT_ROLES = [
  "logo",
  "headline",
  "body",
  "media",
  "proof",
  "cta",
  "legal",
  "chip",
  "other",
] as const;

export const LAYOUT_ARCHETYPES = [
  "text_led_card",
  "modular_card",
  "evidence_pyramid",
  "device_showcase",
  "institutional_photo",
  "split_media_copy",
  "other",
] as const;

export const MEDIA_TYPES = [
  "photo",
  "illustration",
  "device",
  "abstract",
  "none",
  "other",
] as const;

const confidence = z.number().min(0).max(1);

const unitInterval = z.number().min(0).max(1);

/**
 * Layout zone with normalized coordinates (0–1 of canvas).
 * Impossible boxes (outside canvas) are rejected by the schema.
 */
export const layoutZoneSchema = z
  .object({
    role: z.enum(LAYOUT_ROLES),
    x: unitInterval,
    y: unitInterval,
    width: unitInterval,
    height: unitInterval,
    confidence,
  })
  .superRefine((zone, ctx) => {
    if (zone.x + zone.width > 1.001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "zone extends past right edge",
        path: ["width"],
      });
    }
    if (zone.y + zone.height > 1.001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "zone extends past bottom edge",
        path: ["height"],
      });
    }
  });

export const visionStructureSchema = z.object({
  version: z.literal(VISION_STRUCTURE_VERSION),
  /** provenance of this block — never "measurement". */
  source: z.enum(["vision", "human"]),
  inferredAt: z.string().min(1),
  zones: z.array(layoutZoneSchema).max(24).nullable(),
  archetype: z
    .object({
      id: z.enum(LAYOUT_ARCHETYPES),
      confidence,
    })
    .nullable(),
  typography: z
    .object({
      titleBodyScaleRatio: z.number().positive().max(20).nullable(),
      hierarchyNotes: z.string().trim().max(240).nullable(),
      confidence,
    })
    .nullable(),
  grid: z
    .object({
      columns: z.number().int().min(1).max(12).nullable(),
      alignment: z
        .enum(["left", "center", "right", "justified", "mixed"])
        .nullable(),
      confidence,
    })
    .nullable(),
  media: z
    .object({
      type: z.enum(MEDIA_TYPES).nullable(),
      treatment: z.string().trim().max(120).nullable(),
      confidence,
    })
    .nullable(),
  contentPattern: z
    .object({
      centralMessages: z.number().int().min(0).max(20).nullable(),
      listItems: z.number().int().min(0).max(50).nullable(),
      ctaStyle: z.string().trim().max(80).nullable(),
      hasLegalDisclaimer: z.boolean().nullable(),
      confidence,
    })
    .nullable(),
  /** Whether brand accent sits in a highlight *position* (not coverage %). */
  accentPlacement: z
    .object({
      inHighlightPosition: z.boolean().nullable(),
      notes: z.string().trim().max(240).nullable(),
      confidence,
    })
    .nullable(),
  authenticityRisk: z
    .object({
      level: z.enum(["low", "medium", "high"]).nullable(),
      confidence,
    })
    .nullable(),
  overallConfidence: confidence,
});

export type VisionStructure = z.infer<typeof visionStructureSchema>;
export type LayoutZone = z.infer<typeof layoutZoneSchema>;

/**
 * Parse model JSON into structure. Unknown roles / impossible coords fail.
 * Low-confidence or missing branches stay null — never invented by this helper.
 */
export function parseVisionStructure(
  raw: unknown,
  options?: { now?: () => Date; source?: "vision" | "human" },
): VisionStructure | null {
  if (raw == null || typeof raw !== "object") return null;
  const now = options?.now ?? (() => new Date());
  const source = options?.source ?? "vision";
  const candidate = {
    version: VISION_STRUCTURE_VERSION,
    source,
    inferredAt:
      typeof (raw as { inferredAt?: unknown }).inferredAt === "string"
        ? (raw as { inferredAt: string }).inferredAt
        : now().toISOString(),
    ...raw,
    version: VISION_STRUCTURE_VERSION,
    source,
  };
  const parsed = visionStructureSchema.safeParse(candidate);
  if (!parsed.success) return null;
  return parsed.data;
}

/** Drop fields below a confidence floor to null (uncertain → null, never invent). */
export function nullifyLowConfidence(
  structure: VisionStructure,
  floor = 0.35,
): VisionStructure {
  const gate = <T extends { confidence: number }>(
    block: T | null,
  ): T | null => {
    if (!block) return null;
    return block.confidence < floor ? null : block;
  };

  return {
    ...structure,
    zones:
      structure.zones
        ?.map((z) => (z.confidence < floor ? null : z))
        .filter((z): z is LayoutZone => z != null) ?? null,
    archetype: gate(structure.archetype),
    typography: gate(structure.typography),
    grid: gate(structure.grid),
    media: gate(structure.media),
    contentPattern: gate(structure.contentPattern),
    accentPlacement: gate(structure.accentPlacement),
    authenticityRisk: gate(structure.authenticityRisk),
  };
}
