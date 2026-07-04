import type { ActionContract } from "./types";

function isMissingOptionalValue(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

export function buildRiskCopyLines(
  contract: ActionContract,
  snapshot: Record<string, unknown>
): string[] {
  const conditional = contract.optionalFields
    .filter((field) => isMissingOptionalValue(snapshot[field.key]))
    .map((field) => field.riskCopyWhenMissing);
  // alwaysRiskCopy leads so the non-refundable billing policy is the first line
  // the user reads on a goal-agent confirmation card.
  return [...(contract.alwaysRiskCopy ?? []), ...conditional];
}
