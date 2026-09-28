// Escalonamentos (#547), open side: agent/system open with caller-chosen
// kind/severity/scope, and the client "report a problem" path (recognition,
// blocking and opening in one transaction).

import { z } from "zod";
import { ok, type EscalationSeverity, type Result } from "../domain";
import type { EquipeModuleDeps } from "./ports";
import {
  openEscalationPayloadSchema,
  reportItemProblemPayloadSchema,
} from "./envelope";
import {
  loadAccountOrError,
  transact,
  type CommandSuccess,
  type TxBase,
} from "./shared";
import { loadItemOrError } from "./item-shared";
import { createEscalationInternal } from "./escalations-shared";

export type OpenEscalationPayload = z.infer<typeof openEscalationPayloadSchema>;
export type ReportItemProblemPayload = z.infer<typeof reportItemProblemPayloadSchema>;

/** Agent/system open: kind, severity and scope come from the caller. */
export async function runOpenEscalation(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: OpenEscalationPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const created = await createEscalationInternal(ctx, {
      kind: payload.kind,
      severity: payload.severity,
      itemId: payload.itemId,
      frontId: payload.frontId,
      reason: payload.reason,
      origin: ctx.actor.kind === "agent" ? "agent" : "auto",
      systemic: payload.systemic,
      connectionIds: payload.connectionIds,
    });
    if (!created.ok) return created;
    return ok({
      escalationId: created.value.escalation.id,
      pauseIds: created.value.pauseIds,
      exceptionId: created.value.exceptionId,
      isolatedConnectionIds: created.value.isolatedConnectionIds,
      // #583 — systemic applies the real global stop (null when not systemic).
      globalStopId: created.value.globalStopId,
    });
  });
}

const PUBLISHEDISH_ITEM_STATUSES = new Set([
  "sending",
  "verifying",
  "published",
  "published_declared",
  "published_confirmed",
]);

/**
 * The client reports a problem on an item: the Strategist's recognition,
 * blocking and opening happen in one transaction. Already (or being)
 * published → critical; anything earlier → normal.
 */
export async function runReportItemProblem(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: ReportItemProblemPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const loaded = await loadItemOrError(ctx, payload.itemId);
    if (!loaded.ok) return loaded;
    const severity: EscalationSeverity = PUBLISHEDISH_ITEM_STATUSES.has(loaded.value.status)
      ? "critical"
      : "normal";
    const created = await createEscalationInternal(ctx, {
      kind: "content",
      severity,
      itemId: payload.itemId,
      reason: payload.note,
      origin: "client",
    });
    if (!created.ok) return created;
    return ok({
      escalationId: created.value.escalation.id,
      severity,
      pauseIds: created.value.pauseIds,
      exceptionId: created.value.exceptionId,
    });
  });
}
