import {
  isHumanQualitySourceLabel,
  type HumanQualitySourceLabel,
} from "./corpus";

export type OwnerPromotionSourceLabelResult =
  | { ok: true; value: HumanQualitySourceLabel }
  | { ok: false; error: string };

const OWNER_EXPLICIT_SOURCE_LABELS = ["operator_imported", "real_customer"] as const;

/**
 * Resolve the source label for owner/operator promotion.
 * Defaults to the candidate label; explicit values must be operator_imported or
 * real_customer unless the candidate already carries synthetic_fixture.
 */
export function parseOwnerPromotionSourceLabel(
  explicit: string | undefined,
  candidateSourceLabel: string
): OwnerPromotionSourceLabelResult {
  if (!isHumanQualitySourceLabel(candidateSourceLabel)) {
    return { ok: false, error: "candidate source label is invalid" };
  }

  if (explicit === undefined) {
    return { ok: true, value: candidateSourceLabel };
  }

  if (!isHumanQualitySourceLabel(explicit)) {
    return {
      ok: false,
      error: `sourceLabel must be one of: ${OWNER_EXPLICIT_SOURCE_LABELS.join(", ")}`,
    };
  }

  if (explicit === "synthetic_fixture") {
    if (candidateSourceLabel === "synthetic_fixture") {
      return { ok: true, value: "synthetic_fixture" };
    }
    return {
      ok: false,
      error: `sourceLabel must be one of: ${OWNER_EXPLICIT_SOURCE_LABELS.join(", ")}`,
    };
  }

  return { ok: true, value: explicit };
}

function parseSyntheticWorkspaceIds(): Set<string> {
  const raw = process.env.HUMAN_QUALITY_SYNTHETIC_WORKSPACE_IDS ?? "";
  return new Set(
    raw
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  );
}

/** Resolve source label for auto-captured derivation candidates. */
export function resolveAutoCaptureSourceLabel(workspaceId: string): HumanQualitySourceLabel {
  if (parseSyntheticWorkspaceIds().has(workspaceId)) {
    return "synthetic_fixture";
  }
  return "real_customer";
}

/** Resolve source label when an operator explicitly imports into corpus. */
export function resolveOperatorImportedSourceLabel(): HumanQualitySourceLabel {
  return "operator_imported";
}
