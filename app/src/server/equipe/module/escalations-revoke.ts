// Escalonamentos (#547), revoke side: the explicit operations decision to
// revoke a connection involved in an escalation. Opening an escalation only
// ISOLATES connections through the execution suspension (their stored status
// stays untouched); revocation forces the client to reconnect, so it needs a
// named operations actor, a reason, and the linked escalation on the record.

import { z } from "zod";
import { err, ok, type Result } from "../domain";
import type { EquipeModuleDeps } from "./ports";
import { revokeConnectionPayloadSchema } from "./envelope";
import {
  appendEvent,
  loadAccountOrError,
  requestNotification,
  scopeOf,
  transact,
  type CommandSuccess,
  type TxBase,
} from "./shared";
import { loadEscalationOrError } from "./escalations-shared";

export const CONNECTION_REVOKED_EVENT = "connection.revoked";

export type RevokeConnectionPayload = z.infer<typeof revokeConnectionPayloadSchema>;

/**
 * Operations revoke one connection involved in an escalation, with a reason.
 * Both objects record it: the connection row flips to `revoked` with an
 * event, and the escalation carries the same event so its detail shows who
 * revoked what and why.
 */
export async function runRevokeConnection(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: RevokeConnectionPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const scope = scopeOf(ctx);
    const connection = await ctx.repos.connections.get(scope, payload.connectionId);
    if (!connection) return err("unknown_connection", `unknown connection ${payload.connectionId}`);
    const loaded = await loadEscalationOrError(ctx, payload.escalationId);
    if (!loaded.ok) return loaded;
    if (connection.status === "revoked") {
      return err("connection_already_revoked", `connection ${payload.connectionId} is already revoked`);
    }
    await ctx.repos.connections.update(scope, connection.id, {
      status: "revoked",
      lastError: `revoked by operations (escalation ${loaded.value.id}): ${payload.reason}`,
    });
    await appendEvent(ctx, {
      eventType: CONNECTION_REVOKED_EVENT,
      objectType: "connection",
      objectId: connection.id,
      payload: { reason: payload.reason, escalationId: loaded.value.id },
    });
    await appendEvent(ctx, {
      eventType: CONNECTION_REVOKED_EVENT,
      objectType: "escalation",
      objectId: loaded.value.id,
      payload: { connectionId: connection.id, reason: payload.reason },
    });
    await requestNotification(ctx, {
      recipientRole: "strategist",
      templateKey: CONNECTION_REVOKED_EVENT,
      detail: { connectionId: connection.id, escalationId: loaded.value.id },
    });
    return ok({ connectionId: connection.id, escalationId: loaded.value.id });
  });
}
