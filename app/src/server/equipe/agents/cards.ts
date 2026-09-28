// Card builders for the Equipe conversation (#551).
//
// A card points at module objects by reference: ids plus version hashes,
// never content copies. The closed list on a batch card holds exactly the
// "prontos" (review status `ready`, see `isBatchApprovable`) — anything
// needing individual attention is listed under `excluded` with its reason,
// mirroring the P3 confirmation. The chat never approves; the buttons call
// the Equipe commands endpoint (#552) with this same closed list.

import type { EquipeCardItemRef, EquipeCardPayload } from "@/server/repositories/assistant-types";
import { isBatchApprovable, type ItemReviewStatus } from "../domain";
import type { EquipeItemVersion, EquipeRepositories } from "../data";
import { getClientPipeline, type PipelineItem } from "../module/queries";

const EXCLUDED_REASONS: Record<Exclude<ItemReviewStatus, "ready">, string> = {
  blocked: "bloqueado pela equipe",
  edited_in_review: "edição em revisão",
  edit_with_warning: "edição com aviso",
  needs_confirmation: "pede confirmação",
};

function captionTitle(version: EquipeItemVersion | null): string {
  const caption = version?.caption?.trim() ?? "";
  if (!caption) return "Item";
  return caption.length > 80 ? `${caption.slice(0, 77)}…` : caption;
}

function itemRef(view: PipelineItem, version: EquipeItemVersion | null): EquipeCardItemRef | null {
  if (!view.item.currentVersionHash) return null;
  return {
    itemId: view.item.id,
    versionHash: view.item.currentVersionHash,
    title: captionTitle(version),
    ...(view.item.scheduledFor ? { scheduledFor: view.item.scheduledFor.toISOString() } : {}),
  };
}

async function currentVersions(
  repos: EquipeRepositories,
  scope: { workspaceId: string; accountId: string },
  views: PipelineItem[],
): Promise<Map<string, EquipeItemVersion | null>> {
  // Sequential on purpose: repos may share one transaction client, where
  // parallel queries warn today and break in pg@9 (#574).
  const entries: Array<readonly [string, EquipeItemVersion | null]> = [];
  for (const view of views) {
    if (!view.item.currentVersionHash) {
      entries.push([view.item.id, null] as const);
      continue;
    }
    const version = await repos.itemVersions.getByHash(
      scope,
      view.item.id,
      view.item.currentVersionHash,
    );
    entries.push([view.item.id, version] as const);
  }
  return new Map(entries);
}

/**
 * The card an approval intent ("ok, pode postar") answers with: the most
 * urgent batch holding ready items, else the most urgent standalone ready
 * item. Null when nothing is ready — the turn then answers in plain text.
 */
export async function resolvePendingCard(
  repos: EquipeRepositories,
  workspaceId: string,
  accountId: string,
): Promise<EquipeCardPayload | null> {
  const pipeline = await getClientPipeline(repos, workspaceId, accountId);
  if (!pipeline) return null;
  const scope = { workspaceId, accountId };
  const ready = pipeline.items.filter(
    (view) => view.displayState === "ready" && view.item.currentVersionHash,
  );
  if (ready.length === 0) return null;
  const versions = await currentVersions(repos, scope, ready);

  const byBatch = new Map<string, PipelineItem[]>();
  const standalone: PipelineItem[] = [];
  for (const view of ready) {
    if (view.item.batchId) {
      const group = byBatch.get(view.item.batchId) ?? [];
      group.push(view);
      byBatch.set(view.item.batchId, group);
    } else {
      standalone.push(view);
    }
  }

  if (byBatch.size > 0) {
    const batches = [...byBatch.values()]
      .map((views) => ({
        batch: views[0]!.batch,
        views,
      }))
      .filter((entry) => entry.batch !== null)
      .sort((a, b) => {
        const aDue = a.batch!.approveByAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const bDue = b.batch!.approveByAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return aDue - bDue;
      });
    const winner = batches[0];
    if (winner?.batch) {
      return buildBatchCardFromViews(repos, scope, winner.batch.id, pipeline.items);
    }
  }

  const first = [...standalone].sort(
    (a, b) =>
      (a.item.scheduledFor?.getTime() ?? Number.MAX_SAFE_INTEGER) -
      (b.item.scheduledFor?.getTime() ?? Number.MAX_SAFE_INTEGER),
  )[0]!;
  const ref = itemRef(first, versions.get(first.item.id) ?? null);
  if (!ref) return null;
  return {
    kind: "item",
    accountId,
    title: ref.title ?? "Item",
    items: [ref],
  };
}

/** Batch card with the closed list of ready items + the excluded ones. */
export async function buildBatchCard(
  repos: EquipeRepositories,
  workspaceId: string,
  accountId: string,
  batchId: string,
): Promise<EquipeCardPayload | null> {
  const scope = { workspaceId, accountId };
  const batch = await repos.batches.get(scope, batchId);
  if (!batch) return null;
  const pipeline = await getClientPipeline(repos, workspaceId, accountId);
  if (!pipeline) return null;
  return buildBatchCardFromViews(repos, scope, batchId, pipeline.items);
}

async function buildBatchCardFromViews(
  repos: EquipeRepositories,
  scope: { workspaceId: string; accountId: string },
  batchId: string,
  views: PipelineItem[],
): Promise<EquipeCardPayload | null> {
  const batch = await repos.batches.get(scope, batchId);
  if (!batch) return null;
  const inBatch = views.filter((view) => view.item.batchId === batchId);
  const versions = await currentVersions(repos, scope, inBatch);
  const items: EquipeCardItemRef[] = [];
  const excluded: Array<{ itemId: string; reason: string }> = [];
  for (const view of inBatch) {
    const version = versions.get(view.item.id) ?? null;
    const ref = itemRef(view, version);
    if (!ref) continue;
    const status = view.displayState;
    if (isBatchApprovable(status as ItemReviewStatus) && view.item.status === "awaiting_approval") {
      items.push(ref);
    } else if (view.item.status === "awaiting_approval" || view.item.status === "adjusting") {
      excluded.push({
        itemId: view.item.id,
        reason:
          status === "ready"
            ? "aguardando decisão individual"
            : (EXCLUDED_REASONS[status as Exclude<ItemReviewStatus, "ready">] ?? String(status)),
      });
    }
  }
  if (items.length === 0 && excluded.length === 0) return null;
  return {
    kind: "batch",
    accountId: scope.accountId,
    title: batch.title,
    batchId: batch.id,
    ...(batch.approveByAt ? { approveByAt: batch.approveByAt.toISOString() } : {}),
    items,
    ...(excluded.length > 0 ? { excluded } : {}),
  };
}

/** Single-item card: review link plus approve-this-version. */
export async function buildItemCard(
  repos: EquipeRepositories,
  workspaceId: string,
  accountId: string,
  itemId: string,
): Promise<EquipeCardPayload | null> {
  const pipeline = await getClientPipeline(repos, workspaceId, accountId);
  if (!pipeline) return null;
  const view = pipeline.items.find((candidate) => candidate.item.id === itemId);
  if (!view || !view.item.currentVersionHash) return null;
  const scope = { workspaceId, accountId };
  const version = await repos.itemVersions.getByHash(
    scope,
    view.item.id,
    view.item.currentVersionHash,
  );
  const ref = itemRef(view, version);
  if (!ref) return null;
  return {
    kind: "item",
    accountId,
    title: ref.title ?? "Item",
    ...(view.item.batchId ? { batchId: view.item.batchId } : {}),
    items: [ref],
  };
}

/** Idea card: read-only summary, no approval action. */
export async function buildIdeaCard(
  repos: EquipeRepositories,
  workspaceId: string,
  accountId: string,
  ideaId: string,
): Promise<EquipeCardPayload | null> {
  const scope = { workspaceId, accountId };
  const idea = await repos.ideas.get(scope, ideaId);
  if (!idea) return null;
  const payload =
    idea.payload && typeof idea.payload === "object"
      ? (idea.payload as Record<string, unknown>)
      : {};
  const title = typeof payload.title === "string" && payload.title.trim() ? payload.title : "Ideia";
  const summary = typeof payload.summary === "string" ? payload.summary : null;
  return {
    kind: "idea",
    accountId,
    title,
    ideaId: idea.id,
    ...(summary ? { summary } : {}),
    items: [],
  };
}
