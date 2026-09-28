// Calibration reads (#546): the internal quality pipeline — rounds by
// state across the staff's accounts, through the internal repositories only
// — and round detail. Plain reads, no transactions.

import { err, ok, type Result } from "../domain";
import type {
  EquipeBatch,
  EquipeCalibrationRound,
  EquipeCalibrationScore,
  EquipeFront,
  EquipeItem,
  EquipeItemVersion,
  EquipeRepositories,
  InternalEquipeRepositories,
} from "../data";
import {
  loadRoundItems,
  resolveClientDecision,
  roundItemQuality,
  type ClientDecision,
  type RoundItemQuality,
} from "./calibration-shared";
import {
  loadStaffLabelMap,
  staffLabelOf,
  type StaffAccountLabel,
} from "./staff-labels";

export type QualityPipelineEntry = {
  workspaceId: string;
  accountId: string;
  brandName: string | null;
  workspaceName: string | null;
  frontId: string;
  /** The front key (`social_instagram`, `midia_paga`) — null when the front row is gone. */
  frontKey: string | null;
  roundId: string;
  sequence: number;
  weekKey: string;
  status: string;
  openedAt: Date;
  closedAt: Date | null;
  outcome: string | null;
};

export type QualityPipelineView = {
  staffId: string;
  open: QualityPipelineEntry[];
  recentlyClosed: QualityPipelineEntry[];
};

function outcomeOf(round: EquipeCalibrationRound): string | null {
  if (typeof round.decision !== "object" || round.decision === null) return null;
  const outcome = (round.decision as Record<string, unknown>).outcome;
  return typeof outcome === "string" ? outcome : null;
}

function entryOf(
  round: EquipeCalibrationRound,
  labels: Map<string, StaffAccountLabel>,
  frontKeyById: Map<string, string>,
): QualityPipelineEntry {
  const label = staffLabelOf(labels, round.workspaceId, round.accountId);
  return {
    workspaceId: round.workspaceId,
    accountId: round.accountId,
    brandName: label.brandName,
    workspaceName: label.workspaceName,
    frontId: round.frontId,
    frontKey: frontKeyById.get(round.frontId) ?? null,
    roundId: round.id,
    sequence: round.sequence,
    weekKey: round.weekKey,
    status: round.status,
    openedAt: round.createdAt,
    closedAt: round.closedAt,
    outcome: outcomeOf(round),
  };
}

/**
 * The quality queue: open rounds to score first (oldest week first), then
 * recently closed ones. Only an active quality staffer may read it — the
 * binding is checked here because this is the one cross-account read, and it
 * goes through the internal repositories only.
 */
export async function getQualityPipeline(
  internal: InternalEquipeRepositories,
  staffId: string,
  options: { closedLimit?: number } = {},
): Promise<Result<QualityPipelineView>> {
  const staff = await internal.staff.get(staffId);
  if (!staff || !staff.active || staff.role !== "quality") {
    return err("forbidden_actor", `staff ${staffId} may not read the quality pipeline`);
  }
  const [rounds, labels, fronts] = await Promise.all([
    internal.listCalibrationRounds(),
    loadStaffLabelMap(internal),
    internal.listFronts(),
  ]);
  const frontKeyById = new Map(fronts.map((front) => [front.id, front.key]));
  const open = rounds
    .filter((round) => round.status === "open")
    .map((round) => entryOf(round, labels, frontKeyById))
    .sort((a, b) => a.weekKey.localeCompare(b.weekKey) || a.sequence - b.sequence);
  const closedLimit = options.closedLimit ?? 50;
  const recentlyClosed = rounds
    .filter((round) => round.status === "closed")
    .map((round) => entryOf(round, labels, frontKeyById))
    .sort((a, b) => (b.closedAt?.getTime() ?? 0) - (a.closedAt?.getTime() ?? 0))
    .slice(0, closedLimit);
  return ok({ staffId, open, recentlyClosed });
}

export type RoundDetailItem = {
  item: EquipeItem;
  /** All versions, oldest first; the first is the evaluated attempt. */
  versions: EquipeItemVersion[];
  evaluatedAttempt: EquipeItemVersion | null;
  score: EquipeCalibrationScore | null;
  quality: RoundItemQuality;
  client: ClientDecision;
};

export type RoundDetailView = {
  workspaceId: string;
  accountId: string;
  brandName: string | null;
  workspaceName: string | null;
  round: EquipeCalibrationRound;
  front: EquipeFront | null;
  batch: EquipeBatch | null;
  items: RoundDetailItem[];
  /** The close summary (decision jsonb), once the round is closed. */
  summary: unknown;
};

/** Round detail: items with attempts, scores, quality state and verdicts. */
export async function getRoundDetail(
  repos: EquipeRepositories,
  internal: InternalEquipeRepositories,
  workspaceId: string,
  accountId: string,
  roundId: string,
): Promise<RoundDetailView | null> {
  const scope = { workspaceId, accountId };
  const round = await repos.calibrationRounds.get(scope, roundId);
  if (!round) return null;
  const [front, batch, { items }, scores, roundEvents, labels] = await Promise.all([
    repos.fronts.get(scope, round.frontId),
    repos.batches.get(scope, round.batchId),
    loadRoundItems(scope, repos, round),
    repos.calibrationScores.list(scope),
    repos.events.list(scope, { objectType: "round", objectId: round.id }),
    loadStaffLabelMap(internal),
  ]);
  const detail: RoundDetailItem[] = [];
  for (const item of items) {
    const [versions, receipts, itemEvents] = await Promise.all([
      repos.itemVersions.list(scope, { itemId: item.id }),
      repos.receipts.listByObject(scope, "item", item.id),
      repos.events.list(scope, { objectType: "item", objectId: item.id }),
    ]);
    const ordered = [...versions].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const quality = roundItemQuality(roundEvents, item.id);
    detail.push({
      item,
      versions: ordered,
      evaluatedAttempt: ordered[0] ?? null,
      score: scores.find((s) => s.roundId === round.id && s.itemId === item.id) ?? null,
      quality,
      client: resolveClientDecision({
        item,
        receipts,
        itemEvents,
        classification: quality.classification,
      }),
    });
  }
  const label = staffLabelOf(labels, workspaceId, accountId);
  return {
    workspaceId,
    accountId,
    brandName: label.brandName,
    workspaceName: label.workspaceName,
    round,
    front,
    batch,
    items: detail,
    summary: round.decision,
  };
}
