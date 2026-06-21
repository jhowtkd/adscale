import type { HumanQualitySourceLabel } from "./corpus";

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
