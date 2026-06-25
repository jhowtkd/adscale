import { requireRole } from "@/server/auth/workspace";
import { AssistantActionValidationError } from "@/server/repositories/assistant-action";
import type { ToolHandlerContext } from "../tools/registry";
import type { ActionContract } from "./types";
import { getActionContract } from "./registry";
import { buildRiskCopyLines } from "./risk-copy";
import "./contracts";

export interface ValidateProposeActionInput {
  actionType: string;
  label: string;
  inputSnapshot: Record<string, unknown>;
}

export interface ValidateProposeActionResult {
  display: {
    label: string;
    actionType: string;
    riskLabel: string;
    creditImpact: ActionContract["creditImpact"];
    riskCopyLines: string[];
    confirmationPolicy: string;
  };
  contract: ActionContract;
}

export async function validateProposeAction(
  ctx: ToolHandlerContext,
  parsed: ValidateProposeActionInput
): Promise<ValidateProposeActionResult> {
  const contract = getActionContract(parsed.actionType);
  if (!contract) {
    throw new AssistantActionValidationError("unknown_action_type");
  }

  await requireRole(ctx.workspaceId, ctx.userId, contract.allowedRoles);

  const parseResult = contract.inputSchema.safeParse(parsed.inputSnapshot);
  if (!parseResult.success) {
    throw new AssistantActionValidationError("invalid_action_inputs");
  }

  const riskCopyLines = buildRiskCopyLines(contract, parsed.inputSnapshot);

  return {
    display: {
      label: parsed.label,
      actionType: parsed.actionType,
      riskLabel: contract.riskLabel,
      creditImpact: contract.creditImpact,
      riskCopyLines,
      confirmationPolicy: contract.confirmationPolicy,
    },
    contract,
  };
}
