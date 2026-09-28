// Shared internals of the calibration commands (#546): the stored front ↔
// domain machine mapping, the per-item quality state read back from round
// events, client-verdict resolution (approval receipts + adjustment requests
// + quality reclassification), and the two calibration-owned inputs of the
// publication gate (the conference flag #549 consumes at dispatch).

import {
  err,
  isoWeekKey,
  ok,
  roundSizeFor,
  type ClientVerdict,
  type FrontKind,
  type FrontState,
  type FrontStatus,
  type Result,
  type RoundItemScore,
} from "../domain";
import type {
  AccountScope,
  EquipeAccount,
  EquipeCalibrationRound,
  EquipeCalibrationScore,
  EquipeEvent,
  EquipeFront,
  EquipeFrontStatus,
  EquipeItem,
  EquipeReceipt,
} from "../data";
import { ITEM_ADJUSTMENT_REQUESTED_EVENT, ITEM_APPROVAL_ACTIONS } from "./item-shared";
import { scopeOf, type CommandContext } from "./shared";

export const ROUND_OPENED_EVENT = "round.opened";
export const ROUND_ITEM_SCORED_EVENT = "round.item_scored";
export const ROUND_ITEM_RETURNED_EVENT = "round.item_returned";
export const ROUND_ITEM_CORRECTED_EVENT = "round.item_corrected";
export const ROUND_ITEM_RELEASED_EVENT = "round.item_released";
export const ROUND_CRITICAL_FAILURE_EVENT = "round.critical_failure";
export const ROUND_ITEM_WITHDRAWN_EVENT = "round.item_withdrawn";
export const ROUND_REJECTION_CLASSIFIED_EVENT = "round.rejection_classified";
export const ROUND_CLOSED_EVENT = "round.closed";
export const BILLING_SUBSCRIPTION_STARTED_EVENT = "billing.subscription_started";

/** Stored front key → domain front kind. */
export function frontKindOf(front: EquipeFront): FrontKind | null {
  switch (front.key) {
    case "social_instagram":
      return "social";
    case "midia_paga":
      return "paid_media";
    default:
      return null;
  }
}

/** Items per round, from the domain gate (single source of the 4/3 sizes). */
export function roundSizeOfKind(kind: FrontKind): number {
  return roundSizeFor(kind);
}

// The stored front status mirrors the domain machine, plus "draft": a front
// starts as draft and enters calibration when its first round opens, so a
// draft front reads as calibrating with a zeroed sequence.
export function frontStateOf(front: EquipeFront): Result<FrontState> {
  let status: FrontStatus;
  switch (front.status) {
    case "draft":
    case "calibrating":
      status = "calibrating";
      break;
    case "released":
      status = "released";
      break;
    case "scope_decision":
      status = "scope_decision";
      break;
    case "paused":
      status = "paused";
      break;
    case "closed":
      status = "closed";
      break;
    default:
      return err("invalid_transition", `front ${front.id} has unknown status ${front.status}`);
  }
  return ok({
    status,
    consecutivePasses: front.calibrationSequence,
    roundsCompleted: front.roundsUsed,
  });
}

export function storedFrontStatusOf(status: FrontStatus): EquipeFrontStatus {
  switch (status) {
    case "calibrating":
      return "calibrating";
    case "released":
      return "released";
    case "scope_decision":
      return "scope_decision";
    case "paused":
      return "paused";
    case "closed":
      return "closed";
  }
}

/**
 * Calibration commands run while the account calibrates — or stays active
 * with a front still calibrating (a front keeps its weekly rhythm after
 * another front releases).
 */
export function requireCalibrationAccount(account: EquipeAccount): Result<void> {
  if (account.status !== "calibrating" && account.status !== "active") {
    return err(
      "invalid_transition",
      `account is ${account.status}, calibration requires calibrating or active`,
    );
  }
  return ok(undefined);
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Whole 7-day periods since the current calibration sequence started. */
export function calibrationWeeksElapsed(calibrationStartedAt: Date | null, now: Date): number {
  if (!calibrationStartedAt) return 0;
  const elapsed = now.getTime() - calibrationStartedAt.getTime();
  return elapsed <= 0 ? 0 : Math.floor(elapsed / WEEK_MS);
}

/** "YYYY-Www" key of the São Paulo week containing an instant. */
export function roundWeekKey(now: Date): string {
  return isoWeekKey(now);
}

export type Rubric = {
  facts: number;
  brand: number;
  usefulness: number;
  execution: number;
};

export function rubricTotal(rubric: Rubric): number {
  return rubric.facts + rubric.brand + rubric.usefulness + rubric.execution;
}

export function rubricMin(rubric: Rubric): number {
  return Math.min(rubric.facts, rubric.brand, rubric.usefulness, rubric.execution);
}

function isDimension(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 4;
}

/** The attempt score row carries the F/M/U/E rubric as { facts, brand, ... }. */
export function parseRubric(value: unknown): Rubric | null {
  if (typeof value !== "object" || value === null) return null;
  const rubric = value as Record<string, unknown>;
  if (
    !isDimension(rubric.facts) ||
    !isDimension(rubric.brand) ||
    !isDimension(rubric.usefulness) ||
    !isDimension(rubric.execution)
  ) {
    return null;
  }
  return {
    facts: rubric.facts,
    brand: rubric.brand,
    usefulness: rubric.usefulness,
    execution: rubric.execution,
  };
}

export type QualityClassification = "fact" | "brand" | "taste";

/** Per-item quality state within a round, read back from round events. */
export type RoundItemQuality = {
  /** First (only) return for fix, with the version hash it returned. */
  returned: { versionHash: string; note: string } | null;
  /** Latest corrected version submitted after the return, when it arrived. */
  corrected: { versionHash: string } | null;
  /**
   * Latest release to the client, with the version hash it released. A
   * caption edit after release needs the re-check again, so the release is
   * only current while it covers the item's current version.
   */
  released: { versionHash: string; corrected: boolean } | null;
  critical: { reason: string } | null;
  withdrawn: { reason: string | null } | null;
  /** Latest rejection classification wins. */
  classification: {
    from: string;
    to: QualityClassification;
    evidence: string | null;
    loosened: boolean;
  } | null;
};

function eventPayload(event: EquipeEvent): Record<string, unknown> | null {
  return typeof event.payload === "object" && event.payload !== null
    ? (event.payload as Record<string, unknown>)
    : null;
}

function isClassification(value: unknown): value is QualityClassification {
  return value === "fact" || value === "brand" || value === "taste";
}

export function roundItemQuality(roundEvents: EquipeEvent[], itemId: string): RoundItemQuality {
  const quality: RoundItemQuality = {
    returned: null,
    corrected: null,
    released: null,
    critical: null,
    withdrawn: null,
    classification: null,
  };
  for (const event of roundEvents) {
    const payload = eventPayload(event);
    if (!payload || payload.itemId !== itemId) continue;
    switch (event.eventType) {
      case ROUND_ITEM_RETURNED_EVENT:
        if (
          quality.returned === null &&
          typeof payload.versionHash === "string" &&
          typeof payload.note === "string"
        ) {
          quality.returned = { versionHash: payload.versionHash, note: payload.note };
        }
        break;
      case ROUND_ITEM_CORRECTED_EVENT:
        if (typeof payload.versionHash === "string") {
          quality.corrected = { versionHash: payload.versionHash };
        }
        break;
      case ROUND_ITEM_RELEASED_EVENT:
        if (typeof payload.versionHash === "string") {
          quality.released = {
            versionHash: payload.versionHash,
            corrected: payload.corrected === true,
          };
        }
        break;
      case ROUND_CRITICAL_FAILURE_EVENT:
        if (quality.critical === null && typeof payload.reason === "string") {
          quality.critical = { reason: payload.reason };
        }
        break;
      case ROUND_ITEM_WITHDRAWN_EVENT:
        if (quality.withdrawn === null) {
          quality.withdrawn = {
            reason: typeof payload.reason === "string" ? payload.reason : null,
          };
        }
        break;
      case ROUND_REJECTION_CLASSIFIED_EVENT:
        if (typeof payload.from === "string" && isClassification(payload.to)) {
          quality.classification = {
            from: payload.from,
            to: payload.to,
            evidence: typeof payload.evidence === "string" ? payload.evidence : null,
            loosened: payload.loosened === true,
          };
        }
        break;
      default:
        break;
    }
  }
  return quality;
}

/** Client-chosen adjustment categories that fail the round unless loosened. */
export function isFailingCategory(category: string): boolean {
  return category === "fact" || category === "brand";
}

export type ClientDecision = {
  verdict: ClientVerdict;
  /** The client's chosen adjustment category, when they requested one. */
  clientCategory: string | null;
  /** Effective category after quality reclassification, when adjusted. */
  effectiveCategory: string | null;
};

// The client's verdict on a round item: an approval receipt on the current
// version wins (an approval binds to the exact version seen); otherwise the
// latest adjustment request decides, under quality's latest classification.
// Repositories list events oldest-first, so the latest match is the last one.
export function resolveClientDecision(input: {
  item: EquipeItem;
  receipts: EquipeReceipt[];
  itemEvents: EquipeEvent[];
  classification: RoundItemQuality["classification"];
}): ClientDecision {
  const approved = input.receipts.some(
    (receipt) =>
      (ITEM_APPROVAL_ACTIONS as readonly string[]).includes(receipt.action) &&
      receipt.objectVersion === input.item.currentVersionHash,
  );
  if (approved) {
    return { verdict: "approved", clientCategory: null, effectiveCategory: null };
  }
  let clientCategory: string | null = null;
  for (const event of input.itemEvents) {
    if (event.eventType !== ITEM_ADJUSTMENT_REQUESTED_EVENT) continue;
    const category = eventPayload(event)?.category;
    if (typeof category === "string") clientCategory = category;
  }
  if (!clientCategory) {
    return { verdict: "none", clientCategory: null, effectiveCategory: null };
  }
  const effectiveCategory = input.classification?.to ?? clientCategory;
  const failing = isFailingCategory(effectiveCategory);
  return {
    verdict: failing ? "fact_brand_rejection" : "taste_adjustment",
    clientCategory,
    effectiveCategory,
  };
}

/** Score row + quality state + client verdict → the domain round input. */
export function roundItemScoreOf(
  score: EquipeCalibrationScore,
  quality: RoundItemQuality,
  verdict: ClientVerdict,
): Result<RoundItemScore> {
  const rubric = parseRubric(score.rubric);
  if (!rubric) {
    return err("invalid_score", `score ${score.id} has no valid rubric`);
  }
  return ok({
    attemptScore: rubricTotal(rubric),
    minDimension: rubricMin(rubric),
    criticalFailure: quality.critical !== null,
    withdrawn: quality.withdrawn !== null,
    clientVerdict: verdict,
  });
}

/**
 * The two calibration-owned inputs of the publication gate: a front in
 * calibration (or past the limit, still conferring) requires the quality
 * check, and an item is checked once quality releases it to the client.
 * #549 feeds this slice into `evaluatePublicationGate` at dispatch.
 */
export function calibrationGateSlice(input: {
  frontStatus: string;
  releasedToClient: boolean;
}): { calibrationCheckRequired: boolean; qualityChecked: boolean } {
  return {
    calibrationCheckRequired: input.frontStatus === "calibrating" || input.frontStatus === "scope_decision",
    qualityChecked: input.releasedToClient,
  };
}

export async function loadRoundOrError(
  ctx: CommandContext,
  roundId: string,
): Promise<Result<EquipeCalibrationRound>> {
  const round = await ctx.repos.calibrationRounds.get(scopeOf(ctx), roundId);
  if (!round) return err("unknown_round", `unknown round ${roundId}`);
  return ok(round);
}

export async function loadFrontOrError(
  ctx: CommandContext,
  frontId: string,
): Promise<Result<EquipeFront>> {
  const front = await ctx.repos.fronts.get(scopeOf(ctx), frontId);
  if (!front) return err("unknown_front", `unknown front ${frontId}`);
  return ok(front);
}

export type RoundItems = {
  /** Batch items plus withdrawn ones (withdrawal only unlinks the batch). */
  items: EquipeItem[];
  withdrawnIds: Set<string>;
};

/**
 * The round's item set: the batch's current items plus the ones withdrawn
 * from this round (found through their withdrawal events). Items never move
 * between batches, so the union is the set the round opened with.
 */
export async function loadRoundItems(
  scope: AccountScope,
  repos: CommandContext["repos"],
  round: EquipeCalibrationRound,
): Promise<RoundItems> {
  const [batchItems, roundEvents] = await Promise.all([
    repos.items.list(scope, { batchId: round.batchId }),
    repos.events.list(scope, { objectType: "round", objectId: round.id }),
  ]);
  const withdrawnIds = new Set<string>();
  for (const event of roundEvents) {
    if (event.eventType !== ROUND_ITEM_WITHDRAWN_EVENT) continue;
    const itemId = eventPayload(event)?.itemId;
    if (typeof itemId === "string") withdrawnIds.add(itemId);
  }
  const items = [...batchItems];
  const seen = new Set(items.map((item) => item.id));
  for (const itemId of withdrawnIds) {
    if (seen.has(itemId)) continue;
    const item = await repos.items.get(scope, itemId);
    if (item) {
      items.push(item);
      seen.add(itemId);
    }
  }
  // Deterministic order: the gate reports failures by item index.
  items.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  return { items, withdrawnIds };
}
