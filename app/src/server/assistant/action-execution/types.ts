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
  /** Single job ref (legacy single-job actions). */
  jobRef?: JobRef;
  /**
   * Multiple job refs for aggregate actions (e.g. a three-derivation triplet).
   * The orchestrator persists all of them idempotently so the aggregate job
   * sync can wait for every expected job to settle before completing the action.
   */
  jobRefs?: JobRef[];
  resultSummary?: string;
  campaignId?: string;
  /**
   * Optional client-side route the orchestrator should offer as a one-click
   * continuation from the action card (e.g. opening a wizard). The handler
   * supplies the destination; the client decides whether and how to navigate.
   */
  route?: string;
}
