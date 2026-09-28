// Escalonamentos (#547), ingest side: the system command that turns
// `escalation.requested` (caption triage, #545) and `agent.turn_failed` /
// `agent.budget_exceeded` (#550) into rows for the #549 jobs to call — the
// command, not the job, lives here.

import { z } from "zod";
import {
  err,
  ok,
  type EscalationKind,
  type EscalationSeverity,
  type Result,
} from "../domain";
import type { EquipeModuleDeps } from "./ports";
import { ingestAgentSignalPayloadSchema } from "./envelope";
import {
  loadAccountOrError,
  scopeOf,
  transact,
  type CommandContext,
  type CommandSuccess,
  type TxBase,
} from "./shared";
import {
  createEscalationInternal,
  ESCALATION_OPENED_EVENT,
} from "./escalations-shared";
import { ESCALATION_REQUESTED_EVENT } from "./item-shared";
import { createExceptionInternal } from "./exceptions";

const TURN_FAILED_EVENT = "agent.turn_failed";
const BUDGET_EXCEEDED_EVENT = "agent.budget_exceeded";

export type IngestAgentSignalPayload = z.infer<typeof ingestAgentSignalPayloadSchema>;

async function alreadyIngested(ctx: CommandContext, sourceEventId: string): Promise<string | null> {
  for (const eventType of [ESCALATION_OPENED_EVENT, "support_exception.opened"]) {
    const events = await ctx.repos.events.list(scopeOf(ctx), { eventType });
    const found = events.find(
      (event) => (event.payload as { sourceEventId?: unknown } | null)?.sourceEventId === sourceEventId,
    );
    if (found?.objectId) return found.objectId;
  }
  return null;
}

/**
 * Turn one agent/platform signal into its governance row. Idempotent per
 * source event: re-ingesting returns the row the first call created.
 * - `escalation.requested` (caption triage) → escalation row;
 * - `agent.turn_failed` → automatic technical escalation (operations queue);
 * - `agent.budget_exceeded` → commercial support exception.
 */
export async function runIngestAgentSignal(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: IngestAgentSignalPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const source = await ctx.repos.events.get(scopeOf(ctx), payload.sourceEventId);
    if (!source) return err("unknown_event", `unknown event ${payload.sourceEventId}`);
    const existing = await alreadyIngested(ctx, source.id);
    if (existing) {
      return ok({ sourceEventId: source.id, duplicate: true, rowId: existing });
    }
    const detail = (source.payload ?? {}) as Record<string, unknown>;
    if (source.eventType === ESCALATION_REQUESTED_EVENT) {
      if (source.objectType !== "item" || !source.objectId) {
        return err("invalid_signal", "escalation.requested must point at an item");
      }
      const reason = typeof detail.reason === "string" ? detail.reason : "reviewer finding";
      const kind: EscalationKind = detail.ownerRole === "operations" ? "technical" : "content";
      const severity: EscalationSeverity = detail.severity === "critical" ? "critical" : "normal";
      const created = await createEscalationInternal(ctx, {
        kind,
        severity,
        itemId: source.objectId,
        reason,
        origin: "auto",
        sourceEventId: source.id,
      });
      if (!created.ok) return created;
      return ok({
        sourceEventId: source.id,
        duplicate: false,
        ingested: "escalation",
        escalationId: created.value.escalation.id,
      });
    }
    if (source.eventType === TURN_FAILED_EVENT) {
      const taskKind = typeof detail.taskKind === "string" ? detail.taskKind : "unknown";
      const error = typeof detail.error === "string" ? detail.error : "unknown";
      const severity: EscalationSeverity = detail.severity === "critical" ? "critical" : "normal";
      const itemId =
        source.objectType === "item" && source.objectId ? source.objectId : undefined;
      const created = await createEscalationInternal(ctx, {
        kind: "technical",
        severity,
        ...(itemId ? { itemId } : {}),
        reason: `agent.turn_failed ${taskKind}: ${error}`,
        origin: "auto",
        sourceEventId: source.id,
      });
      if (!created.ok) return created;
      return ok({
        sourceEventId: source.id,
        duplicate: false,
        ingested: "escalation",
        escalationId: created.value.escalation.id,
      });
    }
    if (source.eventType === BUDGET_EXCEEDED_EVENT) {
      const taskKind = typeof detail.taskKind === "string" ? detail.taskKind : "unknown";
      const total = typeof detail.totalCostUsdCents === "number" ? detail.totalCostUsdCents : null;
      const budget = typeof detail.budgetUsdCents === "number" ? detail.budgetUsdCents : null;
      const created = await createExceptionInternal(ctx, {
        trigger: "out_of_contract_request",
        reason:
          `agent.budget_exceeded ${taskKind}` +
          (total !== null && budget !== null ? `: spent ${total}/${budget} USD cents` : ""),
        sourceEventId: source.id,
      });
      if (!created.ok) return created;
      return ok({
        sourceEventId: source.id,
        duplicate: false,
        ingested: "exception",
        exceptionId: created.value.id,
      });
    }
    return err("unknown_signal", `cannot ingest ${source.eventType}`);
  });
}
