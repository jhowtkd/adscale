import type { CreditAction } from "./credits";

/** UX-facing credit operation keys for owner surprise analytics (CRED-03). */
export type CreditOperationKey =
  | "preview"
  | "batch"
  | "creative_qa"
  | string;

export function resolveCreditOperationKey(
  action: CreditAction,
  metadata?: Record<string, unknown>
): CreditOperationKey {
  const meta = metadata ?? {};
  if (typeof meta.operation_key === "string" && meta.operation_key.length > 0) {
    return meta.operation_key;
  }
  if (meta.preview === true) return "preview";
  if (meta.preview === false) return "batch";
  if (action === "creative_qa") return "creative_qa";
  return action;
}
