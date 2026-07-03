import "server-only";

import type { ClientReferenceKind } from "@/server/repositories/client-reference";

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
 * Hard gate for a "trained" brand profile (see plan Fase 2):
 *
 * - `logo` is present (non-empty `logoAssetKey`), AND
 * - at least one visual-signal source:
 *     (a) extracted palette + typography (`brandColors` and `brandFonts` both
 *         non-empty), OR
 *     (b) at least one `style` reference image.
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

  const hasLogo = Boolean(profile.logoAssetKey && profile.logoAssetKey.trim().length > 0);
  if (!hasLogo) missing.push("logo");

  const hasPalette = Boolean(
    profile.brandColors && profile.brandColors.length > 0,
  );
  const hasTypography = Boolean(
    profile.brandFonts && profile.brandFonts.length > 0,
  );
  const hasExtractedVisuals = hasPalette && hasTypography;
  const hasStyleReference = references.some((r) => r.kind === "style");
  const hasVisualSignal = hasExtractedVisuals || hasStyleReference;
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
