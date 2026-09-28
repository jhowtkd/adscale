// Escalonamentos (#547): open (automatic/system, client, agent) with
// immediate item blocking, front pause on critical, execution suspension on
// cross-account incidents, duplicate merging with owner + co-owner, resolve
// (fix, confirm, take to the client with a deadline and the no-response
// path), close with cause + candidate lesson. Close, resume and recalibrate
// are separate commands with separate conditions and owners. The system
// ingest command turns `escalation.requested` (caption triage, #545) and
// `agent.turn_failed` / `agent.budget_exceeded` (#550) into rows for the
// #549 jobs to call — the command, not the job, lives here.

import { z } from "zod";
import {
  addBusinessDays,
  closeEscalation,
  closeEscalationForNoResponse,
  declineToPublish,
  deferEscalationToClient,
  err,
  mergeEscalations,
  ok,
  resolveEscalationPart,
  type EscalationCause,
  type EscalationKind,
  type EscalationPart,
  type EscalationSeverity,
  type EscalationState,
  type EscalationStatus,
  type Result,
} from "../domain";
import type { EquipeEscalation } from "../data";
import type { EquipeModuleDeps } from "./ports";
import {
  closeEscalationPayloadSchema,
  expireEscalationClientWaitPayloadSchema,
  ingestAgentSignalPayloadSchema,
  mergeEscalationsPayloadSchema,
  openEscalationPayloadSchema,
  reopenFrontCalibrationPayloadSchema,
  reportItemProblemPayloadSchema,
  resolveContentEscalationPayloadSchema,
  resolveTechnicalEscalationPayloadSchema,
} from "./envelope";
import {
  appendEvent,
  loadAccountOrError,
  requestNotification,
  scopeOf,
  transact,
  type CommandContext,
  type CommandSuccess,
  type TxBase,
} from "./shared";
import {
  ESCALATION_REQUESTED_EVENT,
  ITEM_DECLINED_EVENT,
  itemDeadlineFor,
  loadItemOrError,
} from "./item-shared";
import { applyPauseInternal } from "./pauses";
import { createExceptionInternal } from "./exceptions";

export const ESCALATION_OPENED_EVENT = "escalation.opened";
export const ESCALATION_MERGED_EVENT = "escalation.merged";
export const ESCALATION_PART_RESOLVED_EVENT = "escalation.part_resolved";
export const ESCALATION_DEFERRED_EVENT = "escalation.deferred_to_client";
export const ESCALATION_RESOLVED_EVENT = "escalation.resolved";
export const ESCALATION_CLOSED_EVENT = "escalation.closed";
export const FRONT_RECALIBRATION_OPENED_EVENT = "front.recalibration_opened";

const TURN_FAILED_EVENT = "agent.turn_failed";
const BUDGET_EXCEEDED_EVENT = "agent.budget_exceeded";

export type OpenEscalationPayload = z.infer<typeof openEscalationPayloadSchema>;
export type ReportItemProblemPayload = z.infer<typeof reportItemProblemPayloadSchema>;
export type MergeEscalationsPayload = z.infer<typeof mergeEscalationsPayloadSchema>;
export type ResolveContentEscalationPayload = z.infer<typeof resolveContentEscalationPayloadSchema>;
export type ResolveTechnicalEscalationPayload = z.infer<typeof resolveTechnicalEscalationPayloadSchema>;
export type CloseEscalationPayload = z.infer<typeof closeEscalationPayloadSchema>;
export type ExpireEscalationClientWaitPayload = z.infer<typeof expireEscalationClientWaitPayloadSchema>;
export type IngestAgentSignalPayload = z.infer<typeof ingestAgentSignalPayloadSchema>;
export type ReopenFrontCalibrationPayload = z.infer<typeof reopenFrontCalibrationPayloadSchema>;

// Stored severities (low/medium/high/critical/critical_cross_account) vs
// domain severities (normal/critical/critical_cross_account).
const STORED_SEVERITY_OF: Record<EscalationSeverity, string> = {
  normal: "medium",
  critical: "critical",
  critical_cross_account: "critical_cross_account",
};

function domainSeverityOf(stored: string): EscalationSeverity {
  if (stored === "critical") return "critical";
  if (stored === "critical_cross_account") return "critical_cross_account";
  return "normal";
}

function isEscalationKind(value: unknown): value is EscalationKind {
  return value === "content" || value === "technical" || value === "security";
}

function parseStoredParts(row: EquipeEscalation): Result<EscalationPart[]> {
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

function isTerminalStatus(status: string): boolean {
  return status === "resolved" || status === "closed" || status === "merged";
}

function ownerRoleFor(kind: EscalationKind, severity: EscalationSeverity): "quality" | "operations" {
  if (severity === "critical_cross_account") return "operations";
  return kind === "content" ? "quality" : "operations";
}

function openDueAt(severity: EscalationSeverity, now: Date): Date {
  if (severity === "normal") return addBusinessDays(now, 1);
  return new Date(now.getTime() + 2 * 3_600_000);
}

async function loadEscalationOrError(
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
  revokedConnectionIds: string[];
};

/**
 * Open the row — the link itself blocks the item — and apply the immediate
 * side effects: critical pauses the front, cross-account suspends execution
 * (and the global stop when systemic), both auto-open a support exception.
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
  const revokedConnectionIds: string[] = [];
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
    });
    if (!suspended.ok) return suspended;
    pauseIds.push(suspended.value.pause.id);
    for (const connectionId of connectionIds) {
      await ctx.repos.connections.update(scope, connectionId, {
        status: "revoked",
        lastError: `cross-account containment (escalation ${escalation.id})`,
      });
      revokedConnectionIds.push(connectionId);
    }
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
      revokedConnectionIds,
      ...(input.sourceEventId ? { sourceEventId: input.sourceEventId } : {}),
    },
  });
  await requestNotification(ctx, {
    recipientRole: ownerRole,
    templateKey: "escalation.opened",
    detail: { escalationId: escalation.id, severity: input.severity, itemId: input.itemId ?? null },
  });
  return ok({ escalation, pauseIds, exceptionId, revokedConnectionIds });
}

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
      revokedConnectionIds: created.value.revokedConnectionIds,
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

const DOMAIN_SEVERITY_RANK: Record<EscalationSeverity, number> = {
  normal: 0,
  critical: 1,
  critical_cross_account: 2,
};

/**
 * Join two escalations on the same item: the higher severity leads, mixed
 * kinds gain a co-owner, and the absorbed row is marked merged. Either
 * owner may merge; closing needs every part resolved afterwards.
 */
export async function runMergeEscalations(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: MergeEscalationsPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const [firstId, secondId] = payload.escalationIds;
    if (firstId === secondId) {
      return err("cannot_merge_self", "cannot merge an escalation into itself");
    }
    const scope = scopeOf(ctx);
    const firstRow = await loadEscalationOrError(ctx, firstId);
    if (!firstRow.ok) return firstRow;
    const secondRow = await loadEscalationOrError(ctx, secondId);
    if (!secondRow.ok) return secondRow;
    const first = firstRow.value;
    const second = secondRow.value;
    if (!first.itemId || first.itemId !== second.itemId) {
      return err("merge_requires_same_item", "only escalations on the same item merge");
    }
    if (isTerminalStatus(first.status) || isTerminalStatus(second.status)) {
      return err("invalid_transition", "only open escalations merge");
    }
    if (ctx.actor.kind !== "staff" || (ctx.actor.role !== first.ownerRole && ctx.actor.role !== second.ownerRole)) {
      return err("forbidden_actor", "only one of the escalation owners merges them");
    }
    const firstState = domainEscalationOf(first);
    if (!firstState.ok) return firstState;
    const secondState = domainEscalationOf(second);
    if (!secondState.ok) return secondState;
    const merged = mergeEscalations(firstState.value, secondState.value);
    if (!merged.ok) return merged;
    // Same primary rule as the domain (higher severity wins, first on tie).
    const primary =
      DOMAIN_SEVERITY_RANK[firstState.value.severity] >= DOMAIN_SEVERITY_RANK[secondState.value.severity]
        ? first
        : second;
    const absorbed = primary === first ? second : first;
    await ctx.repos.escalations.update(scope, primary.id, {
      severity: STORED_SEVERITY_OF[merged.value.state.severity] as
        | "medium"
        | "critical"
        | "critical_cross_account",
      ownerRole: merged.value.state.owner,
      coOwnerRole: merged.value.state.coOwner,
      parts: merged.value.state.parts,
      status: "open",
    });
    await ctx.repos.escalations.update(scope, absorbed.id, { status: "merged" });
    const kinds = merged.value.state.parts.map((part) => part.kind);
    await appendEvent(ctx, {
      eventType: ESCALATION_MERGED_EVENT,
      objectType: "escalation",
      objectId: primary.id,
      payload: { kinds, absorbedId: absorbed.id },
    });
    await appendEvent(ctx, {
      eventType: ESCALATION_MERGED_EVENT,
      objectType: "escalation",
      objectId: absorbed.id,
      payload: { mergedInto: primary.id },
    });
    await requestNotification(ctx, {
      recipientRole: merged.value.state.owner,
      templateKey: "escalation.merged",
      detail: { escalationId: primary.id, absorbedId: absorbed.id, kinds },
    });
    return ok({ escalationId: primary.id, absorbedId: absorbed.id, kinds });
  });
}

type ResolveExit = "fix" | "confirm_no_issue" | "defer_to_client";

async function runResolveExit(
  ctx: CommandContext,
  escalationId: string,
  partKind: EscalationKind | null,
  exit: ResolveExit,
): Promise<Result<Record<string, unknown>>> {
  const scope = scopeOf(ctx);
  const loaded = await loadEscalationOrError(ctx, escalationId);
  if (!loaded.ok) return loaded;
  const row = loaded.value;
  if (row.status === "merged" || row.status === "closed") {
    return err("invalid_transition", `cannot resolve escalation from ${row.status}`);
  }
  const state = domainEscalationOf(row);
  if (!state.ok) return state;
  if (exit === "defer_to_client") {
    let dueAt = addBusinessDays(ctx.now, 2);
    if (row.itemId) {
      const item = await ctx.repos.items.get(scope, row.itemId);
      const limit = item?.deadlineAt ?? (item?.scheduledFor ? itemDeadlineFor(item.scheduledFor) : null);
      if (limit && limit <= ctx.now) {
        return err("item_limit_passed", `item ${row.itemId} already passed its decision limit`);
      }
      if (limit && limit < dueAt) dueAt = limit;
    }
    const decided = deferEscalationToClient(state.value, dueAt.toISOString());
    if (!decided.ok) return decided;
    await ctx.repos.escalations.update(scope, row.id, { status: "awaiting_client", dueAt });
    await appendEvent(ctx, {
      eventType: ESCALATION_DEFERRED_EVENT,
      objectType: "escalation",
      objectId: row.id,
      payload: { dueAt: dueAt.toISOString(), itemId: row.itemId },
    });
    await requestNotification(ctx, {
      recipientRole: "approver",
      templateKey: "escalation.client_question",
      detail: { escalationId: row.id, dueAt },
    });
    return ok({ escalationId: row.id, exit, dueAt });
  }
  if (!partKind) {
    return err("part_kind_required", "this escalation has several technical parts; name the kind");
  }
  const decided = resolveEscalationPart(state.value, { kind: partKind, resolution: exit });
  if (!decided.ok) return decided;
  const patch: { parts: EscalationPart[]; status?: "open" | "resolved" } = {
    parts: decided.value.state.parts,
  };
  if (decided.value.state.status === "resolved") {
    patch.status = "resolved";
    await ctx.repos.escalations.update(scope, row.id, { ...patch, resolvedAt: ctx.now });
  } else {
    await ctx.repos.escalations.update(scope, row.id, patch);
  }
  await appendEvent(ctx, {
    eventType: ESCALATION_PART_RESOLVED_EVENT,
    objectType: "escalation",
    objectId: row.id,
    payload: { kind: partKind, resolution: exit },
  });
  if (decided.value.state.status === "resolved") {
    await appendEvent(ctx, {
      eventType: ESCALATION_RESOLVED_EVENT,
      objectType: "escalation",
      objectId: row.id,
      payload: {},
    });
  }
  await requestNotification(ctx, {
    recipientRole: "strategist",
    templateKey: "escalation.part_resolved",
    detail: { escalationId: row.id, kind: partKind, resolved: decided.value.state.status === "resolved" },
  });
  return ok({
    escalationId: row.id,
    kind: partKind,
    exit,
    resolved: decided.value.state.status === "resolved",
  });
}

/** Quality resolves the content part (or defers the whole case to the client). */
export async function runResolveContentEscalation(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: ResolveContentEscalationPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    return runResolveExit(ctx, payload.escalationId, "content", payload.exit);
  });
}

/** Operations resolve the technical/security part (or defer to the client). */
export async function runResolveTechnicalEscalation(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: ResolveTechnicalEscalationPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const loaded = await loadEscalationOrError(ctx, payload.escalationId);
    if (!loaded.ok) return loaded;
    if (payload.exit === "defer_to_client") {
      return runResolveExit(ctx, payload.escalationId, null, payload.exit);
    }
    if (payload.kind) {
      return runResolveExit(ctx, payload.escalationId, payload.kind, payload.exit);
    }
    const state = domainEscalationOf(loaded.value);
    if (!state.ok) return state;
    const openTechnical = state.value.parts.filter(
      (part) => part.kind !== "content" && !part.resolved,
    );
    if (openTechnical.length !== 1) {
      return err("part_kind_required", "this escalation has several technical parts; name the kind");
    }
    return runResolveExit(ctx, payload.escalationId, openTechnical[0]!.kind, payload.exit);
  });
}

/**
 * Close with a cause category and an optional candidate lesson. Only the
 * primary owner closes, only from resolved — and closing never resumes the
 * front nor recalibrates: those are separate commands.
 */
export async function runCloseEscalation(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: CloseEscalationPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const loaded = await loadEscalationOrError(ctx, payload.escalationId);
    if (!loaded.ok) return loaded;
    const row = loaded.value;
    if (ctx.actor.kind !== "staff" || ctx.actor.role !== row.ownerRole) {
      return err("forbidden_actor", "only the escalation owner closes it");
    }
    const state = domainEscalationOf(row);
    if (!state.ok) return state;
    const decided = closeEscalation(state.value, payload.cause as EscalationCause);
    if (!decided.ok) return decided;
    await ctx.repos.escalations.update(scopeOf(ctx), row.id, {
      status: "closed",
      cause: payload.cause,
      lessonCandidate: payload.lessonCandidate ?? null,
    });
    await appendEvent(ctx, {
      eventType: ESCALATION_CLOSED_EVENT,
      objectType: "escalation",
      objectId: row.id,
      payload: { cause: payload.cause, lessonCandidate: payload.lessonCandidate ?? null },
    });
    await requestNotification(ctx, {
      recipientRole: "strategist",
      templateKey: "escalation.closed",
      detail: { escalationId: row.id, cause: payload.cause },
    });
    return ok({ escalationId: row.id, cause: payload.cause });
  });
}

/**
 * The client never answered in time: the item goes to "não publicar" and
 * the escalation closes as unanswered. A timeout path, like the item-limit
 * expiry — already-settled cases are a quiet no-op.
 */
export async function runExpireEscalationClientWait(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: ExpireEscalationClientWaitPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const loaded = await loadEscalationOrError(ctx, payload.escalationId);
    if (!loaded.ok) return loaded;
    const row = loaded.value;
    if (row.status !== "awaiting_client") {
      return ok({ escalationId: row.id, expired: false, status: row.status });
    }
    if (!row.dueAt || ctx.now <= row.dueAt) {
      return err("deadline_not_reached", `escalation ${row.id} still waits for the client`);
    }
    const state = domainEscalationOf(row);
    if (!state.ok) return state;
    const decided = closeEscalationForNoResponse(state.value);
    if (!decided.ok) return decided;
    const scope = scopeOf(ctx);
    await ctx.repos.escalations.update(scope, row.id, {
      status: "closed",
      cause: "no_client_response",
    });
    let itemDeclined = false;
    if (row.itemId) {
      const item = await ctx.repos.items.get(scope, row.itemId);
      if (
        item?.currentVersionHash &&
        (item.status === "awaiting_approval" || item.status === "held")
      ) {
        const declined = declineToPublish(
          { status: item.status, currentVersion: item.currentVersionHash, approvedVersion: null },
          "sem resposta do cliente",
        );
        if (declined.ok) {
          await ctx.repos.items.update(scope, item.id, { status: declined.value.state.status });
          await appendEvent(ctx, {
            eventType: ITEM_DECLINED_EVENT,
            objectType: "item",
            objectId: item.id,
            payload: { reason: "sem resposta do cliente", escalationId: row.id },
          });
          itemDeclined = true;
        }
      }
    }
    await appendEvent(ctx, {
      eventType: ESCALATION_CLOSED_EVENT,
      objectType: "escalation",
      objectId: row.id,
      payload: { cause: "no_client_response", itemDeclined },
    });
    await requestNotification(ctx, {
      recipientRole: "strategist",
      templateKey: "escalation.closed",
      detail: { escalationId: row.id, cause: "no_client_response" },
    });
    return ok({ escalationId: row.id, expired: true, itemDeclined });
  });
}

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
 * - `agent.turn_failed` → support exception (the IA could not advance);
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
      const created = await createExceptionInternal(ctx, {
        trigger: "repeated_silence",
        reason: `agent.turn_failed ${taskKind}: ${error}`,
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

/**
 * Reopen a released front's calibration after a critical content failure,
 * sequence zeroed — separate from closing the escalation and from resuming
 * the front, owned by quality.
 */
export async function runReopenFrontCalibration(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: ReopenFrontCalibrationPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const scope = scopeOf(ctx);
    const front = await ctx.repos.fronts.get(scope, payload.frontId);
    if (!front) return err("unknown_front", `unknown front ${payload.frontId}`);
    if (front.status !== "released") {
      return err("front_not_released", `front ${payload.frontId} is ${front.status}, not released`);
    }
    const loaded = await loadEscalationOrError(ctx, payload.escalationId);
    if (!loaded.ok) return loaded;
    const row = loaded.value;
    const parts = parseStoredParts(row);
    if (!parts.ok) return parts;
    const coversFront =
      row.frontId === payload.frontId ||
      (row.itemId !== null &&
        (await ctx.repos.items.get(scope, row.itemId))?.frontId === payload.frontId);
    if (
      row.status !== "closed" ||
      row.severity !== "critical" ||
      !parts.value.some((part) => part.kind === "content") ||
      !coversFront
    ) {
      return err(
        "recalibration_requires_closed_critical_content",
        "recalibration needs a closed critical content escalation on this front",
      );
    }
    await ctx.repos.fronts.update(scope, front.id, {
      status: "calibrating",
      calibrationSequence: 0,
      roundsUsed: 0,
      releasedAt: null,
    });
    await appendEvent(ctx, {
      eventType: FRONT_RECALIBRATION_OPENED_EVENT,
      objectType: "front",
      objectId: front.id,
      payload: { escalationId: row.id },
    });
    await requestNotification(ctx, {
      recipientRole: "quality",
      templateKey: "front.recalibration_opened",
      detail: { frontId: front.id, escalationId: row.id },
    });
    return ok({ frontId: front.id, escalationId: row.id });
  });
}
