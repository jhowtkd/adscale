import { z } from "zod";
import type { WorkspaceMemberRole } from "@/server/auth/workspace";
import type { CreditAction } from "@/server/billing/credits";

export type ConfirmationPolicy = "required" | "none";
export type RiskLabel = "low" | "medium" | "high";
export type IntentFamily = "quick_action" | "complete_campaign";

export type CreditImpact =
  | { kind: "fixed"; credits: number; label?: string }
  | { kind: "creditAction"; action: CreditAction; amount?: number; label?: string };

export interface OptionalFieldMeta {
  key: string;
  riskCopyWhenMissing: string;
}

export interface ActionContract<T extends z.ZodType = z.ZodType> {
  actionType: string;
  intentFamily: IntentFamily;
  label: string;
  inputSchema: T;
  requiredFields: readonly string[];
  optionalFields: readonly OptionalFieldMeta[];
  allowedRoles: WorkspaceMemberRole[];
  riskLabel: RiskLabel;
  creditImpact: CreditImpact;
  confirmationPolicy: ConfirmationPolicy;
  /**
   * Risk-copy lines shown on every confirmation card for this action, regardless
   * of which optional fields are present. Goal-agent actions use this to state
   * the non-refundable billing policy explicitly and unconditionally.
   */
  alwaysRiskCopy?: readonly string[];
}
