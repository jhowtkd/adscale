import { requireRole } from "@/server/auth/workspace";
import {
  AssistantActionValidationError,
  getAssistantActionById,
  InvalidActionTransitionError,
} from "@/server/repositories/assistant-action";
import { getAssistantMessageById } from "@/server/repositories/assistant-message";
import type { ActionStatus } from "@/server/repositories/assistant-types";
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

export async function revalidateOnConfirm(
  workspaceId: string,
  actionId: string
): Promise<void> {
  const action = await getAssistantActionById(workspaceId, actionId);
  if (!action) {
    throw new AssistantActionValidationError("action_not_found");
  }

  if (action.status !== "pending") {
    throw new InvalidActionTransitionError(
      action.status as ActionStatus,
      "confirmed"
    );
  }

  const message = await getAssistantMessageById(workspaceId, action.messageId);
  const payload = (message?.payload ?? {}) as Record<string, unknown>;
  const display = payload.display as Record<string, unknown> | undefined;
  const actionType = display?.actionType;

  if (typeof actionType !== "string" || !actionType.trim()) {
    throw new AssistantActionValidationError("unknown_action_type");
  }

  const contract = getActionContract(actionType);
  if (!contract) {
    throw new AssistantActionValidationError("unknown_action_type");
  }

  const parseResult = contract.inputSchema.safeParse(action.inputSnapshot);
  if (!parseResult.success) {
    throw new AssistantActionValidationError("invalid_action_inputs");
  }
}
