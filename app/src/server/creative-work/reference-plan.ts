import type { GenerationMode } from "@/server/generation/canonical/types";
import type { CreativeSourceUsage } from "./contracts";

/**
 * R-003 / spec 8 — protocol-derived reference plan.
 *
 * Content, style and brand are explicit, ordered authorities and mandatory
 * references are NEVER evicted by the provider limit: required slots are
 * reserved first and Brand Training identity assets only fill what remains.
 *
 * - format_adaptation: the original art is mandatory and occupies the first
 *   position; the mode can never fall back to reference-less generation.
 * - restyling: the content reference first, the style reference second, both
 *   mandatory; style transfers visual language only.
 * - social_post / art_variation / creative_revision: attached style|both
 *   sources guide visually (optional); content-only sources stay textual
 *   (fact pack / prompt).
 *
 * A plan that cannot honor a mandatory authority — missing/invalid ready
 * asset, incomplete restyle combination, cross-workspace reference frozen
 * without asset key, or required references exceeding the provider limit —
 * fails as `reference_failure` BEFORE any provider call.
 */

export const CREATIVE_WORK_REFERENCE_FAILURE_CODE = "reference_failure" as const;

/** Typed pre-provider failure; the job persists `code` as the failure code. */
export class CreativeWorkReferenceError extends Error {
  readonly code = CREATIVE_WORK_REFERENCE_FAILURE_CODE;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "CreativeWorkReferenceError";
    // ES2022-style cause, assigned manually like CampaignLoadError (the
    // codebase targets ES2017, so `super(message, { cause })` is unavailable).
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export type CreativeWorkReferenceRole =
  | "revision"
  | "original"
  | "content"
  | "style"
  | "brand_identity";

export interface CreativeWorkReferenceSlot {
  role: CreativeWorkReferenceRole;
  /** Required slots are never evicted by the provider limit. */
  required: boolean;
  assetKey: string;
  mimeType: string;
  label: string;
}

export interface CreativeWorkReferencePlanSource {
  sourceId: string;
  usage: CreativeSourceUsage;
  assetKey: string | null;
  mimeType: string | null;
  /**
   * Frozen display name (asset file name) from the input snapshot. Absent on
   * snapshots frozen before the label existed — those fall back to a role
   * label, never the raw internal source id.
   */
  label?: string | null;
}

export interface CreativeWorkReferencePlanAsset {
  assetKey: string;
  mimeType: string;
  label: string;
}

/** Provider-facing fallback labels by role — internal source ids never leak. */
const SOURCE_ROLE_FALLBACK_LABELS = {
  original: "Original art",
  content: "Content source",
  style: "Style source",
} as const;

function sourceLabel(
  source: CreativeWorkReferencePlanSource,
  role: keyof typeof SOURCE_ROLE_FALLBACK_LABELS,
): string {
  const frozen = source.label?.trim();
  return frozen ? frozen : SOURCE_ROLE_FALLBACK_LABELS[role];
}

function requiredSourceSlots(
  sources: readonly VisualSource[],
  role: "original" | "content" | "style",
): CreativeWorkReferenceSlot[] {
  return sources.map((source) => ({
    role,
    required: true,
    assetKey: source.assetKey,
    mimeType: source.mimeType,
    label: sourceLabel(source, role),
  }));
}

interface VisualSource extends CreativeWorkReferencePlanSource {
  assetKey: string;
  mimeType: string;
}

function isVisualSource(source: CreativeWorkReferencePlanSource): source is VisualSource {
  return Boolean(source.assetKey && source.mimeType);
}

/**
 * Build the ordered reference plan for one output. Pure and deterministic:
 * no I/O, no env reads — the same frozen snapshot always yields the same plan.
 */
export function planCreativeWorkReferences(input: {
  /** Canonical mode resolved for THIS output by the protocol translation. */
  mode: GenerationMode;
  /** Source entries frozen in the input snapshot (asset-backed only are visual). */
  sources: readonly CreativeWorkReferencePlanSource[];
  /** Ranked Brand Training reference-mode identity assets (optional). */
  identityReferenceAssets: readonly CreativeWorkReferencePlanAsset[];
  /** Parent output / revision asset references, already validated by the caller. */
  revisionReferences?: readonly CreativeWorkReferencePlanAsset[];
  /** Provider reference cap (today: 4). */
  limit: number;
}): CreativeWorkReferenceSlot[] {
  const revisionSlots: CreativeWorkReferenceSlot[] = (input.revisionReferences ?? []).map(
    (reference) => ({
      role: "revision",
      required: true,
      assetKey: reference.assetKey,
      mimeType: reference.mimeType,
      label: reference.label,
    }),
  );

  // Only asset-backed sources can occupy a visual slot. Template/text sources
  // still contribute through the fact pack and the prompt, never as pixels.
  const visualSources = input.sources.filter(isVisualSource);

  let sourceSlots: CreativeWorkReferenceSlot[] = [];
  if (input.mode === "format_adaptation") {
    const original = visualSources.filter((source) => source.usage !== "style");
    if (original.length === 0) {
      throw new CreativeWorkReferenceError(
        "format_adaptation requires the ready original art reference",
      );
    }
    sourceSlots = requiredSourceSlots(original, "original");
  } else if (input.mode === "restyling") {
    const content = visualSources.filter((source) => source.usage !== "style");
    const style = visualSources.filter((source) => source.usage === "style");
    if (content.length === 0 || style.length === 0) {
      throw new CreativeWorkReferenceError(
        "restyling requires a ready content reference and a ready style reference",
      );
    }
    // Content authority first, style authority second — mandatory and ordered.
    sourceSlots = [...requiredSourceSlots(content, "content"), ...requiredSourceSlots(style, "style")];
  } else {
    // social_post / art_variation / creative_revision: style|both sources are
    // optional visual guidance; content-only sources stay textual.
    sourceSlots = visualSources
      .filter((source) => source.usage !== "content")
      .map((source) => ({
        role: "style" as const,
        required: false,
        assetKey: source.assetKey,
        mimeType: source.mimeType,
        label: sourceLabel(source, "style"),
      }));
  }

  const identitySlots: CreativeWorkReferenceSlot[] = input.identityReferenceAssets.map(
    (asset) => ({
      role: "brand_identity",
      required: false,
      assetKey: asset.assetKey,
      mimeType: asset.mimeType,
      label: asset.label,
    }),
  );

  const required = [...revisionSlots, ...sourceSlots.filter((slot) => slot.required)];
  const optional = [...sourceSlots.filter((slot) => !slot.required), ...identitySlots];
  if (required.length > input.limit) {
    throw new CreativeWorkReferenceError(
      `mandatory references (${required.length}) exceed the provider reference limit (${input.limit})`,
    );
  }
  // Brand Training identity occupies only the slots left by every authority.
  return [...required, ...optional.slice(0, input.limit - required.length)];
}
