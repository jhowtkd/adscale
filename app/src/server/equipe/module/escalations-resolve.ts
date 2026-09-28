// Escalonamentos (#547), resolve side: duplicate merging with owner +
// co-owner, resolve exits (fix, confirm, take to the client with a deadline
// and the no-response path), close with cause + candidate lesson. Close,
// resume and recalibrate are separate commands with separate conditions and
// owners — closing never resumes the front nor recalibrates.

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
  type Result,
} from "../domain";
import type { EquipeModuleDeps } from "./ports";
import {
  closeEscalationPayloadSchema,
  expireEscalationClientWaitPayloadSchema,
  mergeEscalationsPayloadSchema,
  reopenFrontCalibrationPayloadSchema,
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
  domainEscalationOf,
  ESCALATION_CLOSED_EVENT,
  ESCALATION_DEFERRED_EVENT,
  ESCALATION_MERGED_EVENT,
  ESCALATION_PART_RESOLVED_EVENT,
  ESCALATION_RESOLVED_EVENT,
  isTerminalStatus,
  loadEscalationOrError,
  parseStoredParts,
  STORED_SEVERITY_OF,
} from "./escalations-shared";
import { ITEM_DECLINED_EVENT, itemDeadlineFor } from "./item-shared";

export const FRONT_RECALIBRATION_OPENED_EVENT = "front.recalibration_opened";

export type MergeEscalationsPayload = z.infer<typeof mergeEscalationsPayloadSchema>;
export type ResolveContentEscalationPayload = z.infer<typeof resolveContentEscalationPayloadSchema>;
export type ResolveTechnicalEscalationPayload = z.infer<typeof resolveTechnicalEscalationPayloadSchema>;
export type CloseEscalationPayload = z.infer<typeof closeEscalationPayloadSchema>;
export type ExpireEscalationClientWaitPayload = z.infer<typeof expireEscalationClientWaitPayloadSchema>;
export type ReopenFrontCalibrationPayload = z.infer<typeof reopenFrontCalibrationPayloadSchema>;

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
