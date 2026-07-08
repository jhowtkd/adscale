import "server-only";

import type { ClientReferenceKind } from "@/server/repositories/client-reference";
import type {
  BrandTrainingCategory,
  BrandTrainingReviewStatus,
} from "@/server/brand-training/contracts";

/**
 * Minimal view of a `client_profiles` row needed to decide whether a brand
 * profile is "trained". Kept intentionally narrow so this module stays pure
 * and testable without dragging the full Drizzle row type.
 */
export interface BrandProfileTrainedInput {
  logoAssetKey: string | null;
  brandColors: string[] | null;
  brandFonts: string[] | null;
}

export interface BrandProfileReferenceInput {
  kind: ClientReferenceKind;
  /**
   * Brand-training category, populated only for references created through
   * the upload + analysis pipeline. `null`/`undefined` means the reference is
   * legacy (pre-training) and must keep satisfying the visual-signal gate.
   */
  trainingCategory?: BrandTrainingCategory | null;
  /**
   * Brand-training review status, populated only for references that flowed
   * through the upload + analysis pipeline. `null`/`undefined` means the
   * reference is legacy (pre-training) and is treated as approved for
   * readiness purposes.
   */
  reviewStatus?: BrandTrainingReviewStatus | null;
}

export interface BrandProfileStatus {
  trained: boolean;
  /**
   * Machine-readable keys describing what is still missing for the profile to
   * cross the "trained" hard gate. Empty when `trained` is true.
   */
  missing: BrandProfileStatusGap[];
}

export type BrandProfileStatusGap = "logo" | "visual-signal";

/**
 * A reference is treated as "brand-training-aware" once it has gone through
 * the upload pipeline (`reviewStatus !== null && reviewStatus !== undefined`).
 * Pre-pipeline (legacy) references carry no `reviewStatus` and continue to
 * satisfy readiness exactly as they did before this task.
 */
function isTrainedReference(
  reference: BrandProfileReferenceInput,
): reference is BrandProfileReferenceInput & {
  trainingCategory: BrandTrainingCategory | null | undefined;
  reviewStatus: BrandTrainingReviewStatus;
} {
  return (
    reference.reviewStatus !== null &&
    reference.reviewStatus !== undefined
  );
}

function isApprovedVisualCategory(
  category: BrandTrainingCategory | null | undefined,
): boolean {
  return (
    category === "visual_reference" ||
    category === "graphic" ||
    category === "character"
  );
}

/**
 * Hard gate for a "trained" brand profile (see plan Fase 2):
 *
 * - `logo` is present (non-empty `logoAssetKey`) OR an approved trained
 *   reference with `trainingCategory === "logo"`, AND
 * - at least one visual-signal source:
 *     (a) extracted palette + typography (`brandColors` and `brandFonts` both
 *         non-empty), OR
 *     (b) at least one legacy `style` reference image (no `reviewStatus`), OR
 *     (c) at least one approved trained reference with category
 *         `visual_reference` / `graphic` / `character`.
 *
 * Trained pending (`pending_analysis`, `pending_approval`) and `archived`
 * references satisfy neither requirement — they are excluded so the badge
 * reflects only approved, upload-pipeline-vetted evidence.
 *
 * "Trained" is a readiness badge — it never gates generation. A draft profile
 * is still injected into generation exactly like a trained one; this status
 * only signals onboarding completeness to the wizard and the chat surface.
 */
export function resolveBrandProfileStatus(
  profile: BrandProfileTrainedInput,
  references: readonly BrandProfileReferenceInput[],
): BrandProfileStatus {
  const missing: BrandProfileStatusGap[] = [];

  const hasLegacyLogo = Boolean(
    profile.logoAssetKey && profile.logoAssetKey.trim().length > 0,
  );
  const hasApprovedLogoReference = references.some(
    (r) =>
      isTrainedReference(r) &&
      r.reviewStatus === "approved" &&
      r.trainingCategory === "logo",
  );
  const hasLogo = hasLegacyLogo || hasApprovedLogoReference;
  if (!hasLogo) missing.push("logo");

  const hasPalette = Boolean(
    profile.brandColors && profile.brandColors.length > 0,
  );
  const hasTypography = Boolean(
    profile.brandFonts && profile.brandFonts.length > 0,
  );
  const hasExtractedVisuals = hasPalette && hasTypography;
  const hasLegacyStyleReference = references.some(
    (r) => r.kind === "style" && !isTrainedReference(r),
  );
  const hasApprovedVisualReference = references.some(
    (r) =>
      isTrainedReference(r) &&
      r.reviewStatus === "approved" &&
      isApprovedVisualCategory(r.trainingCategory),
  );
  const hasVisualSignal =
    hasExtractedVisuals ||
    hasLegacyStyleReference ||
    hasApprovedVisualReference;
  if (!hasVisualSignal) missing.push("visual-signal");

  return { trained: missing.length === 0, missing };
}

/**
 * Convenience boolean wrapper around {@link resolveBrandProfileStatus} for
 * callers that only need the gate verdict.
 */
export function isBrandProfileTrained(
  profile: BrandProfileTrainedInput,
  references: readonly BrandProfileReferenceInput[],
): boolean {
  return resolveBrandProfileStatus(profile, references).trained;
}
