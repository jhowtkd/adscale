// Read projections over the repositories: account state, goals view, the
// client pipeline and item detail. Plain reads, no transactions; the single
// state per item comes from the domain review precedence (see item-shared).

import type { ItemReviewStatus, ItemStatus } from "../domain";
import type {
  EquipeBrandHandoff,
  EquipeBrandDocument,
  EquipeAccount,
  EquipeBatch,
  EquipeContextFields,
  EquipeEvent,
  EquipeFront,
  EquipeIdea,
  EquipeItem,
  EquipeItemVersion,
  EquipeMandate,
  EquipeOnboardingStep,
  EquipeOnboardingStepKey,
  EquipePause,
  EquipePlan,
  EquipePublicationIntent,
  EquipeReceipt,
  EquipeRepositories,
} from "../data";
import type { EquipeModuleDeps } from "./ports";
import { CONFLICT_SOURCE_PREFIX, contextVersionHash } from "./context";
import { ideaVersionHash } from "./ideas-decide";
import { BRAND_VOICE_APPROVED_EVENT } from "./onboarding";
import { automaticPublicationProposal, readPublicationMode } from "./publication-mode";
import { requireActivationAccount } from "./shared";
import { mandateRuleOf, mandateVersionHash, planVersionHash } from "./plan-mandate";
// #584
import { activationBaseOf } from "./plan-mandate";
import { MATERIAL_REGISTERED_EVENT, SCOPE_CONFIRMED_EVENT } from "./scope-materials";
import {
  hasOpenItemEscalation,
  loadItemReview,
  parseTriageEvent,
  parseVersionFindings,
  versionFindings,
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

/** Steps still open: pending, in progress, or paused. */
function isOpenOnboardingStep(status: string): boolean {
  return status === "pending" || status === "in_progress" || status === "paused";
}

export type ClientAccountView = EquipeAccount & {
  /** Brand name from the client profile; null when the profile is gone. */
  clientProfileName: string | null;
  /** True while the account holds a decision for the client. */
  pendingDecisions: boolean;
};

/**
 * The workspace's accounts for the client screens, oldest first: each
 * with its brand name and whether it holds a pending client decision —
 * an open implantação step, a proposed idea, or an item awaiting the
 * client. The screens default to the first pending account. One pipeline
 * build per account; workspaces hold few accounts and the client caches
 * the list.
 */
export async function getClientAccounts(
  deps: EquipeModuleDeps,
  workspaceId: string,
): Promise<ClientAccountView[]> {
  const repos = deps.uow.repos;
  const accounts = [...(await repos.accounts.list(workspaceId))].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
  );
  // Sequential on purpose: repos may share one transaction client, where
  // parallel queries warn today and break in pg@9 (#574).
  const views: ClientAccountView[] = [];
  for (const account of accounts) {
    const scope = { workspaceId, accountId: account.id };
    const profile = await deps.gateway.getClientProfile(workspaceId, account.clientProfileId);
    const steps = await repos.onboarding.list(scope);
    const ideas = await repos.ideas.list(scope);
    const pipeline = await getClientPipeline(repos, workspaceId, account.id);
    const needsYou =
      pipeline?.columns.find((column) => column.key === "needs_you")?.itemIds.length ?? 0;
    views.push({
      ...account,
      clientProfileName:
        profile && profile.workspaceId === workspaceId ? (profile.name ?? null) : null,
      pendingDecisions:
        steps.some((step) => isOpenOnboardingStep(step.status)) ||
        ideas.some((idea) => idea.status === "proposed") ||
        needsYou > 0,
    });
  }
  return views;
}

export type AccountStateView = {
  workspaceId: string;
  accountId: string;
  status: string;
  handoff: EquipeBrandHandoff | null;
  documents: EquipeBrandDocument[];
  fronts: EquipeFront[];
  /** Steps still open (pending, in progress, or paused), in flow order. */
  pendingSteps: EquipeOnboardingStep[];
  /** Pauses in force: who may resume each one rides `origin`/`resumableBy`. */
  activePauses: EquipePause[];
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
    .filter((step) => isOpenOnboardingStep(step.status))
    .sort(byStepOrder);
  const activePauses = (await repos.pauses.list(scope))
    .filter((pause) => pause.status === "active")
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const [handoff] = await repos.handoffs.list(scope);
  const documents = (await repos.documents.list(scope)).sort((a, b) => b.version - a.version);
  return { workspaceId, accountId, status: account.status, handoff: handoff ?? null, documents, fronts, pendingSteps, activePauses };
}

export type GoalsView = {
  workspaceId: string;
  accountId: string;
  /** Latest approved plan, else the latest proposal, else null. */
  plan: EquipePlan | null;
  mandates: EquipeMandate[];
  onboarding: EquipeOnboardingStep[];
  /** Every pending implantação decision with what the client echoes back. */
  decisions: GoalsDecisions;
};

export type GoalsDecisions = {
  scope: { confirmed: boolean; digest: string | null; note: string | null };
  materials: Array<{ assetId: string; kind: string; origin: string | null }>;
  /** Proposed context sections: the client reviews the fields, then echoes the hash. */
  contextSections: Array<{
    section: string;
    version: number;
    versionId: string;
    versionHash: string;
    fields: EquipeContextFields;
  }>;
  /** Open fact conflicts on draft/proposed sections, with their questions. */
  conflicts: Array<{
    section: string;
    version: number;
    versionId: string;
    field: string;
    question: string;
  }>;
  /** The open plan proposal, with the hash `approve_plan` verifies. */
  plan: { id: string; version: number; versionHash: string } | null;
  /** Open mandate proposals, each with the hash `approve_mandate` verifies. */
  mandates: Array<{ id: string; version: number; versionHash: string; activation: boolean }>;
  brandVoice: { approved: boolean; versionHash: string | null };
  connection: { verified: boolean; manualAgreed: boolean };
  publication: {
    mode: "manual" | "automatic";
    canApprove: boolean;
    blockedReason: string | null;
    versionHash: string | null;
    igAccount: string | null;
    mandateVersion: number | null;
    receiptId: string | null;
  };
};

function approvedPublicationOf(
  detail: unknown,
  mandates: EquipeMandate[],
): { igAccount: string | null; mandateVersion: number | null } {
  const d = (detail ?? {}) as { igUsername?: unknown; destinationIgUserId?: unknown; mandateId?: unknown };
  const username = typeof d.igUsername === "string" && d.igUsername ? `@${d.igUsername}` : null;
  return {
    igAccount: username ?? (typeof d.destinationIgUserId === "string" ? d.destinationIgUserId : null),
    mandateVersion: mandates.find((row) => row.id === d.mandateId)?.version ?? null,
  };
}

function latestByVersion<T extends { version: number }>(rows: T[]): T | null {
  let best: T | null = null;
  for (const row of rows) {
    if (!best || row.version > best.version) best = row;
  }
  return best;
}

function eventPayloadOf(event: EquipeEvent | undefined): Record<string, unknown> {
  if (!event || typeof event.payload !== "object" || event.payload === null) return {};
  return event.payload as Record<string, unknown>;
}

function textOf(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export async function getGoalsView(
  repos: EquipeRepositories,
  workspaceId: string,
  accountId: string,
  now: Date = new Date(),
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

  // Sequential on purpose: repos may share one transaction client, where
  // parallel queries warn today and break in pg@9 (#574).
  const contexts = await repos.contexts.list(scope);
  const connections = await repos.connections.list(scope);
  const scopeEvents = await repos.events.list(scope, { eventType: SCOPE_CONFIRMED_EVENT });
  const materialEvents = await repos.events.list(scope, { eventType: MATERIAL_REGISTERED_EVENT });
  const brandVoiceEvents = await repos.events.list(scope, { eventType: BRAND_VOICE_APPROVED_EVENT });
  const mode = await readPublicationMode(repos, scope);
  const activationAllowed = requireActivationAccount(account).ok;
  const automatic = mode.mode === "manual" && activationAllowed
    ? await automaticPublicationProposal(repos, scope, mode, now)
    : null;
  // Automatic mode reads the profile and mandate off the approved receipt's
  // detail — never a recomputed proposal.
  const approved = mode.mode === "automatic" && mode.receipt
    ? approvedPublicationOf(mode.receipt.detail, mandates)
    : null;
  const scopePayload = eventPayloadOf(scopeEvents[0]);
  const brandVoicePayload = eventPayloadOf(brandVoiceEvents[brandVoiceEvents.length - 1]);
  const openPlan = latestByVersion(plans.filter((p) => p.status === "proposed"));
  const decisions: GoalsDecisions = {
    scope: {
      confirmed: scopeEvents.length > 0,
      digest: textOf(scopePayload.scopeDigest),
      note: textOf(scopePayload.note),
    },
    materials: materialEvents.map((event) => {
      const payload = eventPayloadOf(event);
      return {
        assetId: textOf(payload.assetId) ?? "",
        kind: textOf(payload.kind) ?? "",
        origin: textOf(payload.origin),
      };
    }),
    contextSections: contexts
      .filter((version) => version.status === "proposed")
      .map((version) => ({
        section: version.section,
        version: version.version,
        versionId: version.id,
        versionHash: contextVersionHash(version.fields as EquipeContextFields),
        fields: version.fields as EquipeContextFields,
      }))
      .sort((a, b) => a.section.localeCompare(b.section)),
    conflicts: contexts
      .filter((version) => version.status === "proposed" || version.status === "draft")
      .flatMap((version) =>
        Object.entries((version.fields as EquipeContextFields) ?? {}).flatMap(([field, entry]) =>
          entry?.status === "unknown" && entry.source?.startsWith(CONFLICT_SOURCE_PREFIX)
            ? [
                {
                  section: version.section,
                  version: version.version,
                  versionId: version.id,
                  field,
                  question: entry.source.slice(CONFLICT_SOURCE_PREFIX.length),
                },
              ]
            : [],
        ),
      )
      .sort((a, b) => a.section.localeCompare(b.section) || a.field.localeCompare(b.field)),
    plan: openPlan
      ? { id: openPlan.id, version: openPlan.version, versionHash: planVersionHash(openPlan.content) }
      : null,
    mandates: mandates
      .filter((mandate) => mandate.status === "proposed")
      .map((mandate) => ({
        id: mandate.id,
        version: mandate.version,
        versionHash: mandateVersionHash(mandateRuleOf(mandate)),
        // #584: a pending activation (out of shadow, same rule as an
        // approved shadow version) gets its plain-language explainer.
        activation: activationBaseOf(mandates, mandate) !== null,
      })),
    brandVoice: {
      approved: brandVoiceEvents.length > 0,
      versionHash: textOf(brandVoicePayload.versionHash),
    },
    connection: {
      verified: connections.some((connection) => connection.status === "active"),
      manualAgreed: mode.mode === "manual",
    },
    publication: {
      mode: mode.mode,
      // The HTTP adapter fills this from the caller's active account role.
      canApprove: false,
      blockedReason: !activationAllowed ? "automatic_publication_unavailable"
        : automatic && !automatic.ok ? automatic.error.code : null,
      versionHash: automatic?.ok ? automatic.value.versionHash : null,
      igAccount: approved ? approved.igAccount
        : automatic?.ok
          ? (automatic.value.detail.igUsername ? `@${automatic.value.detail.igUsername}` : automatic.value.detail.destinationIgUserId)
          : null,
      mandateVersion: approved ? approved.mandateVersion : automatic?.ok ? automatic.value.mandateVersion : null,
      receiptId: mode.receipt?.id ?? null,
    },
  };
  return { workspaceId, accountId, plan, mandates, onboarding, decisions };
}

export type IdeaWithDecision = EquipeIdea & {
  /** The hash `decide_idea` verifies — set only while the idea is open. */
  versionHash: string | null;
};

export type IdeasView = {
  workspaceId: string;
  accountId: string;
  /** All ideas, oldest first — proposals, acceptances and rejections alike. */
  ideas: IdeaWithDecision[];
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
    ideas: [...ideas]
      .sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
      )
      .map((idea) => ({
        ...idea,
        versionHash: idea.status === "proposed" ? ideaVersionHash(idea) : null,
      })),
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
  /** Title and thumbnail source of the current version — no detail fetch per card. */
  preview: {
    versionHash: string;
    caption: string;
    creativeWorkOutputId: string | null;
  } | null;
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
    const current = item.currentVersionHash
      ? await repos.itemVersions.getByHash(scope, item.id, item.currentVersionHash)
      : null;
    views.push({
      item,
      batch: (item.batchId && byBatch.get(item.batchId)) || null,
      displayState,
      review,
      preview: current
        ? {
            versionHash: current.versionHash,
            caption: current.caption,
            creativeWorkOutputId: current.creativeWorkOutputId,
          }
        : null,
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
      findings: versionFindings(version, itemEvents),
    })),
    triage: itemEvents.filter((event) => parseTriageEvent(event) !== null),
    activeIntent: intents && intents.status !== "canceled" ? intents : null,
  };
}
