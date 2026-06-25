import type { ActionContract } from "./types";

function isMissingOptionalValue(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

export function buildRiskCopyLines(
  contract: ActionContract,
  snapshot: Record<string, unknown>
): string[] {
  return contract.optionalFields
    .filter((field) => isMissingOptionalValue(snapshot[field.key]))
    .map((field) => field.riskCopyWhenMissing);
}
