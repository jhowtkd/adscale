import type { z } from "zod";
import type {
  ActionContract,
  ConfirmationPolicy,
  RiskLabel,
  CreditImpact,
} from "@/server/assistant/action-contracts/types";
import type { CreditAction } from "@/server/billing/credits";
import {
  parseActionCardDisplay,
  type ActionCardStatus,
} from "@/lib/assistant/contract-display";

/**
 * Permissive placeholder schema. The generic {@link ActionCard} never validates
 * inputs against `inputSchema` (validation happens server-side before the card
 * is ever proposed), so we avoid importing the full `zod` runtime just to
 * satisfy the contract type.
 */
const PERMISSIVE_SCHEMA = {
  safeParse: (value: unknown) => ({ success: true, data: value }),
} as unknown as z.ZodType;

/**
 * Lifecycle status used by the new {@link ActionCard} component (Task 7).
 * It collapses the broader 6-state action record lifecycle down to the four
 * states the generic card knows how to render.
 */
export type ActionCardLifecycleStatus = "pending" | "executing" | "completed" | "error";

/**
 * Maps an action record's lifecycle status (pending/confirmed/running/completed/
 * failed/canceled) onto the four states the generic ActionCard understands.
 */
export function toActionCardLifecycleStatus(
  status: string | undefined
): ActionCardLifecycleStatus {
  switch (status) {
    case "completed":
      return "completed";
    case "confirmed":
    case "running":
      return "executing";
    case "failed":
    case "canceled":
      return "error";
    case "pending":
    default:
      return "pending";
  }
}

/**
 * Action types whose proposals are rendered by the new contract-driven
 * ActionCard. Everything else keeps the bespoke legacy AssistantActionCard,
 * which carries credit-confirmation gating, version-comparison shortcuts and
 * reference thumbnails that the generic card does not (yet) replicate.
 *
 * These mirror the `intentFamily: "quick_action"` contracts registered on the
 * server. Keeping this list explicit (rather than resolving the family from the
 * server registry, which is "server-only") lets the client decide without a
 * server round-trip. Any actionType not listed here falls back to the legacy
 * card, so newly-registered quick actions degrade gracefully.
 */
export const QUICK_ACTION_TYPES = new Set<string>([
  "quick_restyle",
  "quick_format_adapt",
  "quick_regenerate",
  "quick_review",
  "quick_save_reference",
  "quick_package",
  "quick_persona_simulate",
]);

export function isQuickAction(actionType: string | undefined): boolean {
  return typeof actionType === "string" && QUICK_ACTION_TYPES.has(actionType);
}

function asRiskLabel(value: unknown): RiskLabel {
  return value === "low" || value === "medium" || value === "high"
    ? value
    : "medium";
}

function asConfirmationPolicy(value: unknown): ConfirmationPolicy {
  return value === "required" || value === "none" ? value : "required";
}

function asCreditImpact(value: unknown): CreditImpact {
  if (!value || typeof value !== "object") {
    return { kind: "fixed", credits: 0 };
  }
  const record = value as Record<string, unknown>;
  if (record.kind === "fixed" && typeof record.credits === "number") {
    return {
      kind: "fixed",
      credits: record.credits,
      label: typeof record.label === "string" ? record.label : undefined,
    };
  }
  if (record.kind === "creditAction" && typeof record.action === "string") {
    return {
      kind: "creditAction",
      action: record.action as CreditAction,
      label: typeof record.label === "string" ? record.label : undefined,
    };
  }
  return { kind: "fixed", credits: 0 };
}

/**
 * Builds a minimal, client-safe {@link ActionContract} from the action card
 * payload that the server serializes into the message thread.
 *
 * The server registry (`getActionContract`) cannot be imported on the client:
 * the contract files pull `CREDIT_COSTS` from `@/server/billing/credits`,
 * which transitively imports `db` guarded by `"server-only"`. Instead, the
 * server already serializes everything the generic card needs (label,
 * actionType, riskLabel, riskCopyLines, confirmationPolicy, creditImpact)
 * into `payload.display`, so we reconstruct a contract-shaped object here.
 *
 * `inputSchema`/`requiredFields` are best-effort placeholders: the generic
 * ActionCard never validates inputs (that happens server-side before the card
 * is ever proposed). `optionalFields` is reconstructed from the already-computed
 * `riskCopyLines`: we key each entry on the line text itself (which is never a
 * real snapshot key), so {@link buildRiskCopyLines} re-emits exactly those lines
 * and the card shows precisely what the server determined applied at proposal
 * time.
 */
export function resolveDisplayContract(
  display: unknown
): ActionContract | null {
  const parsed = parseActionCardDisplay(display);
  if (!parsed || !parsed.actionType) {
    return null;
  }

  return {
    actionType: parsed.actionType,
    intentFamily: isQuickAction(parsed.actionType)
      ? "quick_action"
      : "complete_campaign",
    label: parsed.label,
    inputSchema: PERMISSIVE_SCHEMA,
    requiredFields: [],
    optionalFields:
      parsed.riskCopyLines && parsed.riskCopyLines.length > 0
        ? parsed.riskCopyLines.map((line) => ({
            key: line,
            riskCopyWhenMissing: line,
          }))
        : [],
    allowedRoles: ["owner", "admin", "member"],
    riskLabel: asRiskLabel(parsed.riskLabel),
    creditImpact: asCreditImpact(parsed.creditImpact),
    confirmationPolicy: asConfirmationPolicy(parsed.confirmationPolicy),
  };
}

export type { ActionCardStatus };
