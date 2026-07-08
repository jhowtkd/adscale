import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "../db";
import {
  campaignAssets,
  campaigns,
  derivations,
  exports,
  shareLinks,
} from "../db/schema";
import type { ProgressionEvidenceKey } from "@/lib/progression/types";
import { EVIDENCE_DEFINITIONS } from "./levels";

export interface InferredEvidence {
  key: ProgressionEvidenceKey;
  label: string;
  completedAt: Date;
  evidenceId?: string;
  evidenceType?: string;
}

export interface ProgressionEvidenceContext {
  firstCampaignId: string | null;
  evidence: InferredEvidence[];
}

async function getFirstCampaignId(workspaceId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(eq(campaigns.workspaceId, workspaceId))
    .orderBy(campaigns.createdAt)
    .limit(1);

  return row?.id ?? null;
}

export async function inferWorkspaceEvidence(
  workspaceId: string
): Promise<ProgressionEvidenceContext> {
  const firstCampaignId = await getFirstCampaignId(workspaceId);
  const evidence: InferredEvidence[] = [];

  const [campaignRow] = await db
    .select({
      id: campaigns.id,
      createdAt: campaigns.createdAt,
    })
    .from(campaigns)
    .where(eq(campaigns.workspaceId, workspaceId))
    .orderBy(campaigns.createdAt)
    .limit(1);

  if (campaignRow) {
    evidence.push({
      key: "campaign_created",
      label: EVIDENCE_DEFINITIONS.campaign_created.label,
      completedAt: campaignRow.createdAt,
      evidenceId: campaignRow.id,
      evidenceType: "campaign",
    });
  }

  const [baseAssetRow] = await db
    .select({
      id: campaignAssets.id,
      createdAt: campaignAssets.createdAt,
      campaignId: campaignAssets.campaignId,
    })
    .from(campaignAssets)
    .where(
      and(
        eq(campaignAssets.workspaceId, workspaceId),
        eq(campaignAssets.role, "base")
      )
    )
    .orderBy(campaignAssets.createdAt)
    .limit(1);

  if (baseAssetRow) {
    evidence.push({
      key: "base_creative_uploaded",
      label: EVIDENCE_DEFINITIONS.base_creative_uploaded.label,
      completedAt: baseAssetRow.createdAt,
      evidenceId: baseAssetRow.id,
      evidenceType: "campaign_asset",
    });
  }

  const [readinessRow] = await db
    .select({
      id: campaigns.id,
      updatedAt: campaigns.creativeDiagnosisUpdatedAt,
      createdAt: campaigns.createdAt,
    })
    .from(campaigns)
    .where(
      and(
        eq(campaigns.workspaceId, workspaceId),
        inArray(campaigns.creativeDiagnosisStatus, ["ready", "failed"])
      )
    )
    .orderBy(campaigns.creativeDiagnosisUpdatedAt, campaigns.createdAt)
    .limit(1);

  if (readinessRow) {
    evidence.push({
      key: "readiness_ran",
      label: EVIDENCE_DEFINITIONS.readiness_ran.label,
      completedAt: readinessRow.updatedAt ?? readinessRow.createdAt,
      evidenceId: readinessRow.id,
      evidenceType: "campaign",
    });
  }

  const [derivationRow] = await db
    .select({
      id: derivations.id,
      createdAt: derivations.createdAt,
      campaignId: derivations.campaignId,
    })
    .from(derivations)
    .where(
      and(
        eq(derivations.workspaceId, workspaceId),
        inArray(derivations.status, ["completed", "approved"]),
        ne(derivations.isPreview, true)
      )
    )
    .orderBy(derivations.createdAt)
    .limit(1);

  if (derivationRow) {
    evidence.push({
      key: "derivation_generated",
      label: EVIDENCE_DEFINITIONS.derivation_generated.label,
      completedAt: derivationRow.createdAt,
      evidenceId: derivationRow.id,
      evidenceType: "derivation",
    });
  }

  const [approvedRow] = await db
    .select({
      id: derivations.id,
      updatedAt: derivations.updatedAt,
      createdAt: derivations.createdAt,
      campaignId: derivations.campaignId,
    })
    .from(derivations)
    .where(
      and(
        eq(derivations.workspaceId, workspaceId),
        eq(derivations.status, "approved")
      )
    )
    .orderBy(derivations.updatedAt, derivations.createdAt)
    .limit(1);

  if (approvedRow) {
    evidence.push({
      key: "creative_approved",
      label: EVIDENCE_DEFINITIONS.creative_approved.label,
      completedAt: approvedRow.updatedAt ?? approvedRow.createdAt,
      evidenceId: approvedRow.id,
      evidenceType: "derivation",
    });
  }

  const [exportRow] = await db
    .select({
      id: exports.id,
      createdAt: exports.createdAt,
      derivationId: exports.derivationId,
    })
    .from(exports)
    .where(eq(exports.workspaceId, workspaceId))
    .orderBy(exports.createdAt)
    .limit(1);

  if (exportRow) {
    evidence.push({
      key: "creative_exported",
      label: EVIDENCE_DEFINITIONS.creative_exported.label,
      completedAt: exportRow.createdAt,
      evidenceId: exportRow.id,
      evidenceType: "export",
    });
  }

  const [shareRow] = await db
    .select({
      id: shareLinks.id,
      createdAt: shareLinks.createdAt,
      campaignId: shareLinks.campaignId,
    })
    .from(shareLinks)
    .where(eq(shareLinks.workspaceId, workspaceId))
    .orderBy(shareLinks.createdAt)
    .limit(1);

  if (shareRow) {
    evidence.push({
      key: "share_created",
      label: EVIDENCE_DEFINITIONS.share_created.label,
      completedAt: shareRow.createdAt,
      evidenceId: shareRow.id,
      evidenceType: "share_link",
    });
  }

  return { firstCampaignId, evidence };
}

export function buildEvidenceHref(
  key: ProgressionEvidenceKey,
  context: ProgressionEvidenceContext
): string {
  const campaignId = context.firstCampaignId;
  if (!campaignId) {
    return "/campaigns?new=1";
  }

  switch (key) {
    case "campaign_created":
      return `/campaigns/${campaignId}`;
    case "base_creative_uploaded":
      return `/campaigns/${campaignId}?tab=assets`;
    case "readiness_ran":
      return `/campaigns/${campaignId}?tab=readiness`;
    case "derivation_generated":
    case "creative_approved":
      return `/campaigns/${campaignId}?tab=review`;
    case "creative_exported":
      return `/campaigns/${campaignId}?tab=export`;
    case "share_created":
      return `/campaigns/${campaignId}?tab=share`;
    default:
      return `/campaigns/${campaignId}`;
  }
}

export async function countWorkspaceCampaigns(workspaceId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(campaigns)
    .where(eq(campaigns.workspaceId, workspaceId));

  return row?.count ?? 0;
}
