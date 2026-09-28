// Front release, scope decision and recalibration (#546): release_front,
// resolve_scope_decision, open_scope_decision, reopen_calibration.
//
// Three consecutive passing rounds let quality release the front; the first
// released front activates the account (domain account machine) and emits
// the billing event for the 3rd installment + full monthly fee (event only —
// no billing integration). A critical content failure after release reopens
// calibration of that front alone.

import { z } from "zod";
import {
  activateAccount,
  actorId,
  closeFront,
  err,
  expireCalibrationTime,
  ok,
  pauseFront,
  reduceFrontScope,
  releaseFront,
  reopenCalibration,
  type AccountEvent,
  type FrontEvent,
  type Result,
} from "../domain";
import type { EquipeCalibrationRound } from "../data";
import type { EquipeModuleDeps } from "./ports";
import {
  openScopeDecisionPayloadSchema,
  releaseFrontPayloadSchema,
  reopenCalibrationPayloadSchema,
  resolveScopeDecisionPayloadSchema,
} from "./envelope";
import {
  appendEvent,
  fromDomainAccountStatus,
  loadAccountOrError,
  requestNotification,
  scopeOf,
  toDomainAccountStatus,
  transact,
  type CommandContext,
  type CommandSuccess,
  type TxBase,
} from "./shared";
import {
  BILLING_SUBSCRIPTION_STARTED_EVENT,
  calibrationWeeksElapsed,
  frontKindOf,
  frontStateOf,
  loadFrontOrError,
  requireCalibrationAccount,
  storedFrontStatusOf,
} from "./calibration-shared";

export type ReleaseFrontPayload = z.infer<typeof releaseFrontPayloadSchema>;
export type ResolveScopeDecisionPayload = z.infer<typeof resolveScopeDecisionPayloadSchema>;
export type OpenScopeDecisionPayload = z.infer<typeof openScopeDecisionPayloadSchema>;
export type ReopenCalibrationPayload = z.infer<typeof reopenCalibrationPayloadSchema>;

type RoundGrade = {
  roundId: string;
  sequence: number;
  outcome: unknown;
  items: unknown;
};

type Loosening = {
  roundId: string;
  sequence: number;
  itemId: unknown;
  from: unknown;
  to: unknown;
  evidence: unknown;
};

function decisionOf(round: EquipeCalibrationRound): Record<string, unknown> | null {
  return typeof round.decision === "object" && round.decision !== null
    ? (round.decision as Record<string, unknown>)
    : null;
}

// The release record: the round grades and every loosening, gathered from
// the closed rounds' summaries.
function releaseRecord(rounds: EquipeCalibrationRound[]): {
  grades: RoundGrade[];
  loosenings: Loosening[];
} {
  const grades: RoundGrade[] = [];
  const loosenings: Loosening[] = [];
  const ordered = [...rounds].sort((a, b) => a.sequence - b.sequence);
  for (const round of ordered) {
    const decision = decisionOf(round);
    if (!decision) continue;
    grades.push({
      roundId: round.id,
      sequence: round.sequence,
      outcome: decision.outcome ?? null,
      items: decision.items ?? null,
    });
    if (Array.isArray(decision.loosenings)) {
      for (const entry of decision.loosenings) {
        if (typeof entry !== "object" || entry === null) continue;
        const loosening = entry as Record<string, unknown>;
        loosenings.push({
          roundId: round.id,
          sequence: round.sequence,
          itemId: loosening.itemId ?? null,
          from: loosening.from ?? null,
          to: loosening.to ?? null,
          evidence: loosening.evidence ?? null,
        });
      }
    }
  }
  return { grades, loosenings };
}

async function appendAccountEvents(
  ctx: CommandContext,
  events: AccountEvent[],
  accountId: string,
): Promise<void> {
  for (const event of events) {
    await appendEvent(ctx, {
      eventType: event.type,
      objectType: "account",
      objectId: accountId,
      payload: event,
    });
  }
}

/**
 * Release the front: 3 consecutive passes, no round still open, quality
 * only. Records who released, when, the round grades and the loosenings.
 * The first released front activates the account and starts billing.
 */
export async function runReleaseFront(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: ReleaseFrontPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const calibrating = requireCalibrationAccount(account.value);
    if (!calibrating.ok) return calibrating;
    const front = await loadFrontOrError(ctx, payload.frontId);
    if (!front.ok) return front;
    if (!frontKindOf(front.value)) {
      return err("invalid_front", `front ${front.value.id} has unknown key ${front.value.key}`);
    }
    const state = frontStateOf(front.value);
    if (!state.ok) return state;
    const scope = scopeOf(ctx);
    const rounds = (await ctx.repos.calibrationRounds.list(scope)).filter(
      (round) => round.frontId === front.value.id,
    );
    if (rounds.some((round) => round.status === "open")) {
      return err(
        "round_still_open",
        `front ${front.value.id} still has an open round`,
      );
    }
    const staffId = actorId(ctx.actor);
    const released = releaseFront(state.value, staffId);
    if (!released.ok) return released;
    const staff = await ctx.internal.staff.get(staffId);
    const record = releaseRecord(rounds);
    await ctx.repos.fronts.update(scope, front.value.id, {
      status: storedFrontStatusOf(released.value.state.status),
      releasedAt: ctx.now,
    });
    const [releasedEvent] = released.value.events as [
      Extract<FrontEvent, { type: "front.released" }>,
    ];
    await appendEvent(ctx, {
      eventType: releasedEvent.type,
      objectType: "front",
      objectId: front.value.id,
      payload: {
        ...releasedEvent,
        releasedByName: staff?.displayName ?? null,
        releasedAt: ctx.now.toISOString(),
        notes: payload.notes ?? null,
        grades: record.grades,
        loosenings: record.loosenings,
      },
    });
    let accountActivated = false;
    if (account.value.status === "calibrating") {
      const domainStatus = toDomainAccountStatus(account.value.status);
      if (!domainStatus) {
        return err("invalid_transition", `account has unknown status ${account.value.status}`);
      }
      const activated = activateAccount({ status: domainStatus }, front.value.id);
      if (!activated.ok) return activated;
      await ctx.repos.accounts.update(ctx.workspaceId, ctx.accountId, {
        status: fromDomainAccountStatus(activated.value.state.status),
      });
      await appendAccountEvents(ctx, activated.value.events, ctx.accountId);
      await appendEvent(ctx, {
        eventType: BILLING_SUBSCRIPTION_STARTED_EVENT,
        objectType: "account",
        objectId: ctx.accountId,
        payload: { releasedFrontId: front.value.id, installment: 3, monthlyFee: "full" },
      });
      await requestNotification(ctx, {
        recipientRole: "approver",
        templateKey: "account.activated",
        detail: { releasedFrontId: front.value.id },
      });
      accountActivated = true;
    } else {
      await requestNotification(ctx, {
        recipientRole: "approver",
        templateKey: "front.released",
        detail: { frontId: front.value.id },
      });
    }
    return ok({ frontId: front.value.id, accountActivated });
  });
}

/**
 * Resolve the scope decision (founder with the client, recorded by quality):
 * reduce the front scope and restart the sequence, pause the front, or close
 * it. Until decided the front keeps conferring items; this lands the outcome.
 */
export async function runResolveScopeDecision(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: ResolveScopeDecisionPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const calibrating = requireCalibrationAccount(account.value);
    if (!calibrating.ok) return calibrating;
    const front = await loadFrontOrError(ctx, payload.frontId);
    if (!front.ok) return front;
    const state = frontStateOf(front.value);
    if (!state.ok) return state;
    const decided =
      payload.decision === "reduce_scope"
        ? reduceFrontScope(state.value)
        : payload.decision === "pause_front"
          ? pauseFront(state.value)
          : closeFront(state.value);
    if (!decided.ok) return decided;
    const scope = scopeOf(ctx);
    if (payload.decision === "reduce_scope") {
      await ctx.repos.fronts.update(scope, front.value.id, {
        status: storedFrontStatusOf(decided.value.state.status),
        calibrationSequence: decided.value.state.consecutivePasses,
        roundsUsed: decided.value.state.roundsCompleted,
        calibrationStartedAt: ctx.now,
      });
    } else {
      await ctx.repos.fronts.update(scope, front.value.id, {
        status: storedFrontStatusOf(decided.value.state.status),
      });
    }
    for (const event of decided.value.events) {
      await appendEvent(ctx, {
        eventType: event.type,
        objectType: "front",
        objectId: front.value.id,
        payload: { ...event, note: payload.note ?? null },
      });
    }
    await requestNotification(ctx, {
      recipientRole: "strategist",
      templateKey: "front.scope_decision_resolved",
      detail: { frontId: front.value.id, decision: payload.decision },
    });
    return ok({ frontId: front.value.id, decision: payload.decision });
  });
}

/**
 * Open one scope decision inside the caller's transaction. Shared by the
 * single command and the #549 deadlines sweep.
 */
export async function openScopeDecisionInTx(
  ctx: CommandContext,
  frontId: string,
): Promise<Result<Record<string, unknown>>> {
  const front = await loadFrontOrError(ctx, frontId);
  if (!front.ok) return front;
  const state = frontStateOf(front.value);
  if (!state.ok) return state;
  const weeksElapsed = calibrationWeeksElapsed(front.value.calibrationStartedAt, ctx.now);
  const expired = expireCalibrationTime(state.value, weeksElapsed);
  if (!expired.ok) return expired;
  await ctx.repos.fronts.update(scopeOf(ctx), front.value.id, {
    status: storedFrontStatusOf(expired.value.state.status),
  });
  for (const event of expired.value.events) {
    await appendEvent(ctx, {
      eventType: event.type,
      objectType: "front",
      objectId: front.value.id,
      payload: event,
    });
  }
  await requestNotification(ctx, {
    recipientRole: "quality",
    templateKey: "front.scope_decision_opened",
    detail: { frontId: front.value.id },
  });
  await requestNotification(ctx, {
    recipientRole: "strategist",
    templateKey: "front.scope_decision_opened",
    detail: { frontId: front.value.id },
  });
  return ok({ frontId: front.value.id });
}

/**
 * Time-only scope trigger (system job): 6 weeks elapsed without 3
 * consecutive passes and without a 6th round being recorded.
 */
export async function runOpenScopeDecision(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: OpenScopeDecisionPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const calibrating = requireCalibrationAccount(account.value);
    if (!calibrating.ok) return calibrating;
    return openScopeDecisionInTx(ctx, payload.frontId);
  });
}

/**
 * Reopen calibration after a critical content failure post-release (coming
 * from an escalation). Only that front returns to calibration, sequence
 * reset; sibling fronts are untouched and the account stays active.
 */
export async function runReopenCalibration(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: ReopenCalibrationPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const calibrating = requireCalibrationAccount(account.value);
    if (!calibrating.ok) return calibrating;
    const front = await loadFrontOrError(ctx, payload.frontId);
    if (!front.ok) return front;
    const state = frontStateOf(front.value);
    if (!state.ok) return state;
    const reopened = reopenCalibration(state.value, payload.reason);
    if (!reopened.ok) return reopened;
    await ctx.repos.fronts.update(scopeOf(ctx), front.value.id, {
      status: storedFrontStatusOf(reopened.value.state.status),
      calibrationSequence: reopened.value.state.consecutivePasses,
      roundsUsed: reopened.value.state.roundsCompleted,
      releasedAt: null,
      calibrationStartedAt: ctx.now,
    });
    for (const event of reopened.value.events) {
      await appendEvent(ctx, {
        eventType: event.type,
        objectType: "front",
        objectId: front.value.id,
        payload: { ...event, escalationId: payload.escalationId ?? null },
      });
    }
    await requestNotification(ctx, {
      recipientRole: "approver",
      templateKey: "front.recalibration_opened",
      detail: { frontId: front.value.id },
    });
    return ok({ frontId: front.value.id });
  });
}
