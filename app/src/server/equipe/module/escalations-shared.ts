// Escalonamentos (#547), shared internals: stored/domain mapping, the open
// transaction with its immediate side effects (front pause on critical,
// execution suspension on cross-account, auto support exception), and the
// event constants. Open/resolve/ingest/revoke commands live in their own
// files; this one holds what they share.

import {
  addBusinessDays,
  err,
  ok,
  type EscalationKind,
  type EscalationPart,
  type EscalationSeverity,
  type EscalationState,
  type EscalationStatus,
  type Result,
} from "../domain";
import type { EquipeEscalation } from "../data";
import {
  appendEvent,
  requestNotification,
  scopeOf,
  type CommandContext,
} from "./shared";
import { applyPauseInternal } from "./pauses";
import { createExceptionInternal } from "./exceptions";

export const ESCALATION_OPENED_EVENT = "escalation.opened";
export const ESCALATION_MERGED_EVENT = "escalation.merged";
export const ESCALATION_PART_RESOLVED_EVENT = "escalation.part_resolved";
export const ESCALATION_DEFERRED_EVENT = "escalation.deferred_to_client";
export const ESCALATION_RESOLVED_EVENT = "escalation.resolved";
export const ESCALATION_CLOSED_EVENT = "escalation.closed";

// Stored severities (low/medium/high/critical/critical_cross_account) vs
// domain severities (normal/critical/critical_cross_account).
export const STORED_SEVERITY_OF: Record<EscalationSeverity, string> = {
  normal: "medium",
  critical: "critical",
  critical_cross_account: "critical_cross_account",
};

export function domainSeverityOf(stored: string): EscalationSeverity {
  if (stored === "critical") return "critical";
  if (stored === "critical_cross_account") return "critical_cross_account";
  return "normal";
}

function isEscalationKind(value: unknown): value is EscalationKind {
  return value === "content" || value === "technical" || value === "security";
}

export function parseStoredParts(row: EquipeEscalation): Result<EscalationPart[]> {
  if (row.parts === null || row.parts === undefined) {
    if (!isEscalationKind(row.kind)) {
      return err("invalid_escalation_kind", `escalation ${row.id} has unknown kind ${row.kind}`);
    }
    const resolved = row.status === "resolved" || row.status === "closed";
    return ok([{ kind: row.kind, resolved }]);
  }
  if (!Array.isArray(row.parts)) {
    return err("corrupt_parts", `escalation ${row.id} has corrupt parts`);
  }
  const parts: EscalationPart[] = [];
  for (const entry of row.parts as unknown[]) {
    if (typeof entry !== "object" || entry === null) {
      return err("corrupt_parts", `escalation ${row.id} has corrupt parts`);
    }
    const { kind, resolved } = entry as { kind?: unknown; resolved?: unknown };
    if (!isEscalationKind(kind) || typeof resolved !== "boolean") {
      return err("corrupt_parts", `escalation ${row.id} has corrupt parts`);
    }
    parts.push({ kind, resolved });
  }
  if (parts.length === 0) {
    return err("corrupt_parts", `escalation ${row.id} has corrupt parts`);
  }
  return ok(parts);
}

/** Stored row → domain machine state (merged rows are terminal, like closed). */
export function domainEscalationOf(row: EquipeEscalation): Result<EscalationState> {
  let status: EscalationStatus;
  switch (row.status) {
    case "awaiting_client":
      status = "awaiting_client";
      break;
    case "resolved":
      status = "resolved";
      break;
    case "closed":
    case "merged":
      status = "closed";
      break;
    default:
      status = "open";
      break;
  }
  const parts = parseStoredParts(row);
  if (!parts.ok) return parts;
  return ok({
    status,
    severity: domainSeverityOf(row.severity),
    owner: row.ownerRole,
    coOwner: row.coOwnerRole,
    parts: parts.value,
  });
}

export function isTerminalStatus(status: string): boolean {
  return status === "resolved" || status === "closed" || status === "merged";
}

export function ownerRoleFor(kind: EscalationKind, severity: EscalationSeverity): "quality" | "operations" {
  if (severity === "critical_cross_account") return "operations";
  return kind === "content" ? "quality" : "operations";
}

export function openDueAt(severity: EscalationSeverity, now: Date): Date {
  if (severity === "normal") return addBusinessDays(now, 1);
  return new Date(now.getTime() + 2 * 3_600_000);
}

export async function loadEscalationOrError(
  ctx: CommandContext,
  escalationId: string,
): Promise<Result<EquipeEscalation>> {
  const row = await ctx.repos.escalations.get(scopeOf(ctx), escalationId);
  if (!row) return err("unknown_escalation", `unknown escalation ${escalationId}`);
  return ok(row);
}

export type CreateEscalationInput = {
  kind: EscalationKind;
  severity: EscalationSeverity;
  itemId?: string;
  frontId?: string;
  reason: string;
  origin: "auto" | "client" | "agent";
  systemic?: boolean;
  connectionIds?: string[];
  sourceEventId?: string;
};

export type CreatedEscalation = {
  escalation: EquipeEscalation;
  pauseIds: string[];
  exceptionId: string | null;
  isolatedConnectionIds: string[];
};

/**
 * Open the row — the link itself blocks the item — and apply the immediate
 * side effects: critical pauses the front, cross-account suspends execution
 * (and the global stop when systemic), both auto-open a support exception.
 * Cross-account connections are ISOLATED through the suspension (no dispatch,
 * no provider calls while it lasts); their stored status stays untouched —
 * revocation forces the client to reconnect, so only operations revoke, via
 * `revoke_connection`.
 */
export async function createEscalationInternal(
  ctx: CommandContext,
  input: CreateEscalationInput,
): Promise<Result<CreatedEscalation>> {
  const scope = scopeOf(ctx);
  let frontId: string | null = input.frontId ?? null;
  if (input.itemId) {
    const item = await ctx.repos.items.get(scope, input.itemId);
    if (!item) return err("unknown_item", `unknown item ${input.itemId}`);
    if (frontId && item.frontId !== frontId) {
      return err("front_mismatch", `item ${input.itemId} is not on front ${frontId}`);
    }
    frontId = item.frontId;
  }
  if (frontId) {
    const front = await ctx.repos.fronts.get(scope, frontId);
    if (!front) return err("unknown_front", `unknown front ${frontId}`);
  }
  if (input.severity === "critical" && !frontId) {
    return err("front_required", "a critical escalation needs an item or a front to pause");
  }
  if (input.severity !== "critical_cross_account" && (input.connectionIds?.length ?? 0) > 0) {
    return err("connections_only_for_cross_account", "connection containment is cross-account only");
  }
  const connectionIds = input.connectionIds ?? [];
  for (const connectionId of connectionIds) {
    const connection = await ctx.repos.connections.get(scope, connectionId);
    if (!connection) return err("unknown_connection", `unknown connection ${connectionId}`);
  }
  const ownerRole = ownerRoleFor(input.kind, input.severity);
  const escalation = await ctx.repos.escalations.create(scope, {
    frontId,
    itemId: input.itemId ?? null,
    kind: input.kind,
    severity: STORED_SEVERITY_OF[input.severity] as "medium" | "critical" | "critical_cross_account",
    ownerRole,
    parts: [{ kind: input.kind, resolved: false }],
    dueAt: openDueAt(input.severity, ctx.now),
  });
  const pauseIds: string[] = [];
  let exceptionId: string | null = null;
  const isolatedConnectionIds: string[] = [...connectionIds];
  if (input.severity === "critical") {
    const paused = await applyPauseInternal(ctx, {
      origin: "content_incident",
      scope: "front",
      frontId,
      reason: `escalation ${escalation.id}: ${input.reason}`,
      escalationId: escalation.id,
    });
    if (!paused.ok) return paused;
    pauseIds.push(paused.value.pause.id);
  }
  if (input.severity === "critical_cross_account") {
    const suspended = await applyPauseInternal(ctx, {
      origin: "security",
      scope: "account",
      reason: `cross-account escalation ${escalation.id}: ${input.reason}`,
      escalationId: escalation.id,
      isolatedConnectionIds: connectionIds,
    });
    if (!suspended.ok) return suspended;
    pauseIds.push(suspended.value.pause.id);
    if (input.systemic) {
      const stopped = await applyPauseInternal(ctx, {
        origin: "global_stop",
        scope: "global",
        reason: `systemic cause suspected (escalation ${escalation.id})`,
        escalationId: escalation.id,
      });
      if (!stopped.ok) return stopped;
      pauseIds.push(stopped.value.pause.id);
    }
  }
  if (input.severity === "critical" || input.severity === "critical_cross_account") {
    const exception = await createExceptionInternal(ctx, {
      trigger: "critical_incident",
      reason: `escalation ${escalation.id}: ${input.reason}`,
      escalationId: escalation.id,
    });
    if (!exception.ok) return exception;
    exceptionId = exception.value.id;
  }
  await appendEvent(ctx, {
    eventType: ESCALATION_OPENED_EVENT,
    objectType: "escalation",
    objectId: escalation.id,
    payload: {
      kind: input.kind,
      severity: input.severity,
      ownerRole,
      reason: input.reason,
      itemId: input.itemId ?? null,
      frontId,
      origin: input.origin,
      pauseIds,
      exceptionId,
      isolatedConnectionIds,
      ...(input.sourceEventId ? { sourceEventId: input.sourceEventId } : {}),
    },
  });
  await requestNotification(ctx, {
    recipientRole: ownerRole,
    templateKey: "escalation.opened",
    detail: { escalationId: escalation.id, severity: input.severity, itemId: input.itemId ?? null },
  });
  return ok({ escalation, pauseIds, exceptionId, isolatedConnectionIds });
}
