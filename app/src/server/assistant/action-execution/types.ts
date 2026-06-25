import type { JobRef } from "@/server/repositories/assistant-types";

export class AssistantActionExecutionError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "action_not_found"
      | "unknown_action_type"
      | "scope_mismatch"
      | "asset_not_found"
      | "derivation_not_found"
      | "campaign_not_found"
      | "execution_failed"
      | "credit_blocked"
  ) {
    super(message);
    this.name = "AssistantActionExecutionError";
  }
}

export interface ActionExecutionContext {
  workspaceId: string;
  actionId: string;
  threadId: string;
  clientProfileId: string;
  userId: string;
  locale: string;
  actionType: string;
  inputSnapshot: Record<string, unknown>;
}

export interface ActionExecutionResult {
  mode: "async" | "sync";
  jobRef?: JobRef;
  resultSummary?: string;
}
