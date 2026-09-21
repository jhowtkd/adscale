/**
 * Consultas canônicas origin-agnostic (Phase 2 / item 16).
 * Sempre exigem workspaceId — isolamento igual aos repositórios de origem.
 *
 * list e open usam as mesmas regras de projeção (item 15): estados impossíveis
 * são rejeitados; list não inventa outputs.
 */
import {
  getCampaignById,
  getCampaignsPage,
} from "@/server/repositories/campaign";
import {
  getCreativeWork,
  listCreativeWorksWithOutputs,
} from "@/server/repositories/creative-work";
import { getDerivationsByCampaign } from "@/server/repositories/derivation";
import {
  getClientProfile,
  getClientProfiles,
} from "@/server/repositories/client-reference";
import {
  parseCanonicalWorkId,
  type CanonicalCreativeWork,
  type CanonicalWorkSummary,
} from "@/server/creative-work/canonical/types";
import { ImpossibleCanonicalStateError } from "@/server/creative-work/canonical/status";
import {
  projectCampaignAsCanonicalWork,
  summarizeCampaignAsCanonicalWork,
} from "@/server/creative-work/projection/from-campaign";
import {
  projectCreativeWorkAsCanonicalWork,
  summarizeCreativeWorkAsCanonicalWork,
} from "@/server/creative-work/projection/from-creative-work";
import { compareProjectionTelemetry } from "@/server/creative-work/telemetry/projection-compare";
import { logger } from "@/lib/logger";
import {
  boundCatalogLimit,
  encodeCatalogCursor,
  type CatalogCursor,
  type CatalogPageResult,
} from "@/lib/catalog-page";

export interface ListCanonicalWorksOptions {
  /** Page size; bounded to the catalog default/max like sibling views. */
  limit?: number;
  /** Keyset (updatedAt desc, originId asc) shared by both origins. */
  cursor?: CatalogCursor | null;
  /** When true, emit projection-compare telemetry (no UI effect). */
  emitTelemetry?: boolean;
}

/**
 * A fetched origin row in merged order. `summary` is null when the projection
 * rejected the row (impossible state); it still occupies a keyset position so
 * paging stays consistent with what the origins returned.
 */
type CanonicalPageEntry = {
  key: CatalogCursor;
  summary: CanonicalWorkSummary | null;
};

function compareEntries(a: CanonicalPageEntry, b: CanonicalPageEntry): number {
  const at = b.key.at.getTime() - a.key.at.getTime();
  if (at !== 0) return at;
  return a.key.id < b.key.id ? -1 : a.key.id > b.key.id ? 1 : 0;
}

export async function listCanonicalWorks(
  workspaceId: string,
  options: ListCanonicalWorksOptions = {}
): Promise<CanonicalWorkSummary[]> {
  const page = await listCanonicalWorksPage(workspaceId, options);
  return page.items;
}

/**
 * Merged campaign + creative_work page. Each origin is fetched with the same
 * keyset and `limit + 1` rows, so a page never needs more than 2·(limit+1)
 * rows regardless of workspace size.
 */
export async function listCanonicalWorksPage(
  workspaceId: string,
  options: ListCanonicalWorksOptions = {}
): Promise<CatalogPageResult<CanonicalWorkSummary>> {
  const limit = boundCatalogLimit(options.limit);
  const cursor = options.cursor ?? null;
  const fetchLimit = limit + 1;
  const [{ campaigns }, worksWithOutputs, clientProfiles] = await Promise.all([
    getCampaignsPage(workspaceId, { limit: fetchLimit, cursor }),
    listCreativeWorksWithOutputs(workspaceId, fetchLimit, cursor),
    getClientProfiles(workspaceId),
  ]);
  const brandNameByProfileId = new Map(clientProfiles.map((profile) => [profile.id, profile.name]));

  const entries: CanonicalPageEntry[] = [];
  for (const c of campaigns) {
    const key = { at: c.updatedAt, id: c.id };
    try {
      const summary = summarizeCampaignAsCanonicalWork({
        id: c.id,
        workspaceId: c.workspaceId,
        name: c.name,
        client: c.client,
        product: c.product,
        objective: c.objective,
        audience: c.audience,
        platforms: c.platforms,
        tone: c.tone,
        offer: c.offer,
        constraints: c.constraints,
        notes: c.notes,
        clientProfileId: c.clientProfileId,
        generationMode: c.generationMode,
        status: c.status,
        creativeDiagnosisStatus: c.creativeDiagnosisStatus,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        activeDerivations: c.activeDerivations,
        totalDerivations: c.totalDerivations,
        completedDerivations: c.completedDerivations,
        failedDerivations: c.failedDerivations,
      });
      summary.brandName = brandNameByProfileId.get(c.clientProfileId ?? "") ?? summary.brandName ?? null;
      if (options.emitTelemetry) {
        compareProjectionTelemetry({
          workspaceId,
          origin: "campaign",
          originKind: "campaign",
          originId: c.id,
          originStatus: c.status,
          canonicalState: summary.state,
          outputCount: c.totalDerivations ?? 0,
        });
      }
      entries.push({ key, summary });
    } catch (err) {
      if (err instanceof ImpossibleCanonicalStateError) {
        logger.warn(
          `[canonical.list] skip campaign ${c.id}: ${err.code} ${err.message}`
        );
        entries.push({ key, summary: null });
        continue;
      }
      throw err;
    }
  }

  for (const { work: w, outputs } of worksWithOutputs) {
    const key = { at: w.updatedAt, id: w.id };
    try {
      const summary = summarizeCreativeWorkAsCanonicalWork(
        {
          id: w.id,
          workspaceId: w.workspaceId,
          clientProfileId: w.clientProfileId,
          brandName: brandNameByProfileId.get(w.clientProfileId) ?? null,
          campaignId: w.campaignId,
          title: w.title,
          toolKind: w.toolKind,
          status: w.status,
          format: w.format,
          brief: w.brief,
          inputSnapshot: w.inputSnapshot,
          copy: w.copy,
          identitySnapshot: w.identitySnapshot,
          createdAt: w.createdAt,
          updatedAt: w.updatedAt,
        },
        outputs
      );
      if (options.emitTelemetry) {
        compareProjectionTelemetry({
          workspaceId,
          origin: "quick_tool",
          originKind: "creative_work",
          originId: w.id,
          originStatus: w.status,
          canonicalState: summary.state,
          outputCount: outputs.length,
        });
      }
      entries.push({ key, summary });
    } catch (err) {
      if (err instanceof ImpossibleCanonicalStateError) {
        logger.warn(
          `[canonical.list] skip creative_work ${w.id}: ${err.code} ${err.message}`
        );
        entries.push({ key, summary: null });
        continue;
      }
      throw err;
    }
  }

  entries.sort(compareEntries);
  const hasMore = entries.length > limit;
  const page = hasMore ? entries.slice(0, limit) : entries;
  const last = page.at(-1);
  return {
    items: page.flatMap((entry) => (entry.summary ? [entry.summary] : [])),
    nextCursor: hasMore && last ? encodeCatalogCursor(last.key) : null,
  };
}

export async function openCanonicalWork(
  workspaceId: string,
  canonicalId: string,
  options: { emitTelemetry?: boolean } = {}
): Promise<CanonicalCreativeWork | null> {
  const parsed = parseCanonicalWorkId(canonicalId);
  if (!parsed) return null;

  if (parsed.kind === "campaign") {
    const campaign = await getCampaignById(parsed.originId, workspaceId);
    if (!campaign) return null;
    const derivations = await getDerivationsByCampaign(
      parsed.originId,
      workspaceId
    );
    let projected: CanonicalCreativeWork;
    try {
      projected = projectCampaignAsCanonicalWork(campaign, derivations);
    } catch (err) {
      if (err instanceof ImpossibleCanonicalStateError) {
        logger.warn(
          `[canonical.open] reject campaign ${campaign.id}: ${err.code} ${err.message}`
        );
        return null;
      }
      throw err;
    }
    if (options.emitTelemetry) {
      compareProjectionTelemetry({
        workspaceId,
        origin: "campaign",
        originKind: "campaign",
        originId: campaign.id,
        originStatus: campaign.status,
        canonicalState: projected.state,
        outputCount: projected.outputs.length,
      });
    }
    return projected;
  }

  const row = await getCreativeWork(workspaceId, parsed.originId);
  if (!row) return null;
  const clientProfile = await getClientProfile(workspaceId, row.work.clientProfileId);
  let projected: CanonicalCreativeWork;
  try {
    projected = projectCreativeWorkAsCanonicalWork(
      { ...row.work, brandName: clientProfile?.name ?? null },
      row.outputs,
    );
  } catch (err) {
    if (err instanceof ImpossibleCanonicalStateError) {
      logger.warn(
        `[canonical.open] reject creative_work ${row.work.id}: ${err.code} ${err.message}`
      );
      return null;
    }
    throw err;
  }
  if (options.emitTelemetry) {
    compareProjectionTelemetry({
      workspaceId,
      origin: "quick_tool",
      originKind: "creative_work",
      originId: row.work.id,
      originStatus: row.work.status,
      canonicalState: projected.state,
      outputCount: projected.outputs.length,
    });
  }
  return projected;
}

/**
 * Resume = open + assert the work is resumable.
 * Returns null when missing or not resumable (failed/abandoned).
 */
export async function resumeCanonicalWork(
  workspaceId: string,
  canonicalId: string,
  options: { emitTelemetry?: boolean } = {}
): Promise<CanonicalCreativeWork | null> {
  const work = await openCanonicalWork(workspaceId, canonicalId, options);
  if (!work || !work.resumable) return null;
  return work;
}
