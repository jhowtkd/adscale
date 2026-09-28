// Read projections over the repositories: account state, goals view, the
// client pipeline and item detail. Plain reads, no transactions; the single
// state per item comes from the domain review precedence (see item-shared).

import type { ItemReviewStatus, ItemStatus } from "../domain";
import type {
  EquipeBatch,
  EquipeEvent,
  EquipeFront,
  EquipeIdea,
  EquipeItem,
  EquipeItemVersion,
  EquipeMandate,
  EquipeOnboardingStep,
  EquipeOnboardingStepKey,
  EquipePlan,
  EquipePublicationIntent,
  EquipeReceipt,
  EquipeRepositories,
} from "../data";
import {
  hasOpenItemEscalation,
  loadItemReview,
  parseTriageEvent,
  parseVersionFindings,
  resolveItemReview,
  storedItemStatusOf,
  type ItemReview,
} from "./item-shared";
import {
  isReleasedVersion,
  loadReleasedVersions,
  requiresCalibrationConference,
} from "./calibration-conference";

export const ONBOARDING_STEP_ORDER: EquipeOnboardingStepKey[] = [
  "scope_confirm",
  "materials",
  "context",
  "plan",
  "mandate",
  "connection",
  "go_live",
];

function byStepOrder(a: EquipeOnboardingStep, b: EquipeOnboardingStep): number {
  // Stored steps are validated against the same enum on write.
  const rank = (step: string): number => ONBOARDING_STEP_ORDER.indexOf(step as EquipeOnboardingStepKey);
  return rank(a.step) - rank(b.step);
}

export type AccountStateView = {
  workspaceId: string;
  accountId: string;
  status: string;
  fronts: EquipeFront[];
  /** Steps still open (pending, in progress, or paused), in flow order. */
  pendingSteps: EquipeOnboardingStep[];
};

export async function getAccountState(
  repos: EquipeRepositories,
  workspaceId: string,
  accountId: string,
): Promise<AccountStateView | null> {
  const account = await repos.accounts.get(workspaceId, accountId);
  if (!account) return null;
  const scope = { workspaceId, accountId };
  const fronts = (await repos.fronts.list(scope)).sort((a, b) => a.key.localeCompare(b.key));
  const pendingSteps = (await repos.onboarding.list(scope))
    .filter((step) => step.status === "pending" || step.status === "in_progress" || step.status === "paused")
    .sort(byStepOrder);
  return { workspaceId, accountId, status: account.status, fronts, pendingSteps };
}

export type GoalsView = {
  workspaceId: string;
  accountId: string;
  /** Latest approved plan, else the latest proposal, else null. */
  plan: EquipePlan | null;
  mandates: EquipeMandate[];
  onboarding: EquipeOnboardingStep[];
};

function latestByVersion<T extends { version: number }>(rows: T[]): T | null {
  let best: T | null = null;
  for (const row of rows) {
    if (!best || row.version > best.version) best = row;
  }
  return best;
}

export async function getGoalsView(
  repos: EquipeRepositories,
  workspaceId: string,
  accountId: string,
): Promise<GoalsView | null> {
  const account = await repos.accounts.get(workspaceId, accountId);
  if (!account) return null;
  const scope = { workspaceId, accountId };
  const plans = await repos.plans.list(scope);
  const plan =
    latestByVersion(plans.filter((p) => p.status === "approved")) ??
    latestByVersion(plans.filter((p) => p.status === "proposed")) ??
    null;
  const mandates = (await repos.mandates.list(scope)).sort((a, b) => a.version - b.version);
  const onboarding = (await repos.onboarding.list(scope)).sort(byStepOrder);
  return { workspaceId, accountId, plan, mandates, onboarding };
}

export type IdeasView = {
  workspaceId: string;
  accountId: string;
  /** All ideas, oldest first — proposals, acceptances and rejections alike. */
  ideas: EquipeIdea[];
};

/** The client ideas feed: the account's ideas through a module query. */
export async function getIdeasView(
  repos: EquipeRepositories,
  workspaceId: string,
  accountId: string,
): Promise<IdeasView | null> {
  const account = await repos.accounts.get(workspaceId, accountId);
  if (!account) return null;
  const ideas = await repos.ideas.list({ workspaceId, accountId });
  return {
    workspaceId,
    accountId,
    ideas: [...ideas].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
    ),
  };
}

export type PipelineColumnKey =
  | "needs_you"
  | "in_progress"
  | "scheduled"
  | "finished"
  | "missed";

export type PipelineItem = {
  item: EquipeItem;
  batch: EquipeBatch | null;
  /** The single state: review status while awaiting decision, else lifecycle. */
  displayState: ItemReviewStatus | ItemStatus;
  review: ItemReview;
};

export type ClientPipelineView = {
  workspaceId: string;
  accountId: string;
  columns: Array<{ key: PipelineColumnKey; itemIds: string[] }>;
  items: PipelineItem[];
};

function columnOf(item: EquipeItem): PipelineColumnKey {
  switch (storedItemStatusOf(item)) {
    case "awaiting_approval":
      return "needs_you";
    case "adjusting":
      return "in_progress";
    case "scheduled":
    case "held":
    case "sending":
    case "verifying":
      return "scheduled";
    case "missed_window":
    case "failed":
      return "missed";
    case "do_not_publish":
    case "cancelled":
    case "published":
    case "available_for_download":
    case "published_declared":
    case "published_confirmed":
    default:
      return "finished";
  }
}

/**
 * The client pipeline: items grouped in columns, each with its single
 * state — the domain review precedence while the item awaits a decision,
 * the lifecycle state otherwise. Items still in calibration conference are
 * omitted: the client only sees conferred items.
 */
export async function getClientPipeline(
  repos: EquipeRepositories,
  workspaceId: string,
  accountId: string,
): Promise<ClientPipelineView | null> {
  const account = await repos.accounts.get(workspaceId, accountId);
  if (!account) return null;
  const scope = { workspaceId, accountId };
  // Sequential on purpose: repos may share one transaction client, where
  // parallel queries warn today and break in pg@9 (#574).
  const items = await repos.items.list(scope);
  const batches = await repos.batches.list(scope);
  const fronts = await repos.fronts.list(scope);
  const byBatch = new Map(batches.map((batch) => [batch.id, batch]));
  const byFront = new Map(fronts.map((front) => [front.id, front]));
  const accountStatus = account.status;
  const releasedByFront = new Map<string, Set<string>>();
  const columns: Array<{ key: PipelineColumnKey; itemIds: string[] }> = [
    { key: "needs_you", itemIds: [] },
    { key: "in_progress", itemIds: [] },
    { key: "scheduled", itemIds: [] },
    { key: "finished", itemIds: [] },
    { key: "missed", itemIds: [] },
  ];
  const byColumn = new Map(columns.map((column) => [column.key, column]));
  const views: PipelineItem[] = [];
  async function isConferring(item: EquipeItem): Promise<boolean> {
    const front = byFront.get(item.frontId);
    if (!front || !requiresCalibrationConference(accountStatus, front.status)) return false;
    let released = releasedByFront.get(front.id);
    if (!released) {
      released = await loadReleasedVersions(repos, scope, front.id);
      releasedByFront.set(front.id, released);
    }
    return !isReleasedVersion(released, item);
  }
  const ordered = [...items].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  for (const item of ordered) {
    if (await isConferring(item)) continue;
    const review = await loadItemReview(repos, scope, item);
    const lifecycle = storedItemStatusOf(item);
    // The review precedence rules while the item awaits a decision, and a
    // restrictive review state (edit in review, warning, blocked) stays the
    // single state while adjusting too.
    const displayState: ItemReviewStatus | ItemStatus =
      lifecycle === "awaiting_approval" || review.status !== "ready"
        ? review.status
        : (lifecycle ?? "awaiting_approval");
    views.push({
      item,
      batch: (item.batchId && byBatch.get(item.batchId)) || null,
      displayState,
      review,
    });
    byColumn.get(columnOf(item))?.itemIds.push(item.id);
  }
  return { workspaceId, accountId, columns, items: views };
}

export type ItemDetailView = {
  workspaceId: string;
  accountId: string;
  item: EquipeItem;
  batch: EquipeBatch | null;
  versions: EquipeItemVersion[];
  receipts: EquipeReceipt[];
  review: ItemReview;
  destinationAccount: string | null;
  findings: Array<{ versionHash: string; findings: ReturnType<typeof parseVersionFindings> }>;
  triage: EquipeEvent[];
  activeIntent: EquipePublicationIntent | null;
};

/**
 * Item detail: versions, receipts, findings, review state and live intent.
 * Null while the item is still in calibration conference — the client only
 * sees conferred items, same omission as the pipeline.
 */
export async function getItemDetail(
  repos: EquipeRepositories,
  workspaceId: string,
  accountId: string,
  itemId: string,
): Promise<ItemDetailView | null> {
  const scope = { workspaceId, accountId };
  const item = await repos.items.get(scope, itemId);
  if (!item) return null;
  const account = await repos.accounts.get(workspaceId, accountId);
  const front = await repos.fronts.get(scope, item.frontId);
  if (
    account &&
    front &&
    requiresCalibrationConference(account.status, front.status) &&
    !isReleasedVersion(await loadReleasedVersions(repos, scope, front.id), item)
  ) {
    return null;
  }
  const versions = await repos.itemVersions.list(scope, { itemId });
  const receipts = await repos.receipts.listByObject(scope, "item", itemId);
  const itemEvents = await repos.events.list(scope, { objectType: "item", objectId: itemId });
  const intents = item.currentVersionHash
    ? await repos.intents.getByItemVersion(scope, itemId, item.currentVersionHash)
    : null;
  const hasOpenEscalation = await hasOpenItemEscalation(repos, scope, itemId);
  const currentVersion = item.currentVersionHash
    ? (versions.find((v) => v.versionHash === item.currentVersionHash) ?? null)
    : null;
  const review = resolveItemReview({ item, currentVersion, itemEvents, hasOpenEscalation });
  const batch = item.batchId ? await repos.batches.get(scope, item.batchId) : null;
  const ordered = [...versions].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return {
    workspaceId,
    accountId,
    item,
    batch,
    versions: ordered,
    receipts,
    review,
    destinationAccount: item.destination ?? currentVersion?.destination ?? null,
    findings: ordered.map((version) => ({
      versionHash: version.versionHash,
      findings: parseVersionFindings(version.reviewerFindings),
    })),
    triage: itemEvents.filter((event) => parseTriageEvent(event) !== null),
    activeIntent: intents && intents.status !== "canceled" ? intents : null,
  };
}
