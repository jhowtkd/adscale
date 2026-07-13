/**
 * Consultas canônicas origin-agnostic (Phase 2 / item 16).
 * Sempre exigem workspaceId — isolamento igual aos repositórios de origem.
 */
import { getCampaignById, getCampaigns } from "@/server/repositories/campaign";
import {
  getCreativeWork,
  listCreativeWorks,
} from "@/server/repositories/creative-work";
import { getDerivationsByCampaign } from "@/server/repositories/derivation";
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

export interface ListCanonicalWorksOptions {
  limit?: number;
  /** When true, emit projection-compare telemetry (no UI effect). */
  emitTelemetry?: boolean;
}

export async function listCanonicalWorks(
  workspaceId: string,
  options: ListCanonicalWorksOptions = {}
): Promise<CanonicalWorkSummary[]> {
  const limit = options.limit ?? 50;
  const [campaigns, works] = await Promise.all([
    getCampaigns(workspaceId, limit),
    listCreativeWorks(workspaceId, limit),
  ]);

  const campaignSummaries: CanonicalWorkSummary[] = [];
  for (const c of campaigns) {
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
        status: c.status,
        creativeDiagnosisStatus: c.creativeDiagnosisStatus,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        activeDerivations: c.activeDerivations,
        totalDerivations: c.totalDerivations,
        completedDerivations: c.completedDerivations,
        failedDerivations: c.failedDerivations,
      });
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
      campaignSummaries.push(summary);
    } catch (err) {
      if (err instanceof ImpossibleCanonicalStateError) {
        logger.warn(
          `[canonical.list] skip campaign ${c.id}: ${err.code} ${err.message}`
        );
        continue;
      }
      throw err;
    }
  }

  const workSummaries: CanonicalWorkSummary[] = [];
  for (const w of works) {
    try {
      // List path does not load outputs; synthesize a placeholder so
      // generating rows stay projectable without a false impossible-state.
      const listOutputs =
        w.status === "generating"
          ? [
              {
                id: `${w.id}:list-pending`,
                status: "processing",
                creativeLevel: null,
                outputKey: null,
                isSelected: false,
              },
            ]
          : [];
      const summary = summarizeCreativeWorkAsCanonicalWork(
        {
          id: w.id,
          workspaceId: w.workspaceId,
          clientProfileId: w.clientProfileId,
          toolKind: w.toolKind,
          status: w.status,
          format: w.format,
          brief: w.brief,
          copy: w.copy,
          identitySnapshot: w.identitySnapshot,
          createdAt: w.createdAt,
          updatedAt: w.updatedAt,
        },
        listOutputs
      );
      if (options.emitTelemetry) {
        compareProjectionTelemetry({
          workspaceId,
          origin: "quick_tool",
          originKind: "creative_work",
          originId: w.id,
          originStatus: w.status,
          canonicalState: summary.state,
          outputCount: listOutputs.length,
        });
      }
      workSummaries.push(summary);
    } catch (err) {
      if (err instanceof ImpossibleCanonicalStateError) {
        logger.warn(
          `[canonical.list] skip creative_work ${w.id}: ${err.code} ${err.message}`
        );
        continue;
      }
      throw err;
    }
  }

  return [...campaignSummaries, ...workSummaries].sort((a, b) =>
    a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0
  );
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
    const projected = projectCampaignAsCanonicalWork(campaign, derivations);
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
  const projected = projectCreativeWorkAsCanonicalWork(row.work, row.outputs);
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
