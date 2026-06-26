import { and, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { db } from "../../db";
import { campaigns, creativePlans, derivations } from "../../db/schema";
import type { MissionKey } from "@/lib/progression/missions/types";
import { inferWorkspaceEvidence, type ProgressionEvidenceContext } from "../evidence";
import type { ProgressionEvidenceKey } from "@/lib/progression/types";
import { MISSION_DEFINITIONS } from "./definitions";

export interface InferredMissionCompletion {
  key: MissionKey;
  completedAt: Date;
  evidenceId?: string;
  evidenceType?: string;
}

const PROGRESSION_TO_MISSION: Partial<Record<ProgressionEvidenceKey, MissionKey>> = {
  campaign_created: "setup",
  base_creative_uploaded: "upload",
  readiness_ran: "readiness",
  creative_exported: "export",
  share_created: "share",
};

function hasBriefingContent(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export async function inferMissionCompletions(
  workspaceId: string,
  context?: ProgressionEvidenceContext
): Promise<InferredMissionCompletion[]> {
  const progressionContext = context ?? (await inferWorkspaceEvidence(workspaceId));
  const completions = new Map<MissionKey, InferredMissionCompletion>();

  for (const item of progressionContext.evidence) {
    const missionKey = PROGRESSION_TO_MISSION[item.key];
    if (missionKey && !completions.has(missionKey)) {
      completions.set(missionKey, {
        key: missionKey,
        completedAt: item.completedAt,
        evidenceId: item.evidenceId,
        evidenceType: item.evidenceType,
      });
    }
  }

  const [briefingRow] = await db
    .select({
      id: campaigns.id,
      updatedAt: campaigns.updatedAt,
      createdAt: campaigns.createdAt,
    })
    .from(campaigns)
    .where(
      and(
        eq(campaigns.workspaceId, workspaceId),
        or(
          and(
            isNotNull(campaigns.objective),
            sql`trim(${campaigns.objective}) <> ''`,
            or(
              and(isNotNull(campaigns.audience), sql`trim(${campaigns.audience}) <> ''`),
              and(isNotNull(campaigns.tone), sql`trim(${campaigns.tone}) <> ''`)
            )
          ),
          and(isNotNull(campaigns.offer), sql`trim(${campaigns.offer}) <> ''`)
        )
      )
    )
    .orderBy(campaigns.updatedAt, campaigns.createdAt)
    .limit(1);

  if (briefingRow && !completions.has("guided_briefing")) {
    completions.set("guided_briefing", {
      key: "guided_briefing",
      completedAt: briefingRow.updatedAt ?? briefingRow.createdAt,
      evidenceId: briefingRow.id,
      evidenceType: "campaign",
    });
  }

  const [recipeRow] = await db
    .select({
      id: creativePlans.id,
      createdAt: creativePlans.createdAt,
      campaignId: creativePlans.campaignId,
    })
    .from(creativePlans)
    .where(eq(creativePlans.workspaceId, workspaceId))
    .orderBy(creativePlans.createdAt)
    .limit(1);

  if (recipeRow && !completions.has("strategy_recipe")) {
    completions.set("strategy_recipe", {
      key: "strategy_recipe",
      completedAt: recipeRow.createdAt,
      evidenceId: recipeRow.id,
      evidenceType: "creative_plan",
    });
  } else {
    const [recipeCampaignRow] = await db
      .select({
        id: campaigns.id,
        updatedAt: campaigns.updatedAt,
        createdAt: campaigns.createdAt,
        targetFormats: campaigns.targetFormats,
        ctaVariants: campaigns.ctaVariants,
      })
      .from(campaigns)
      .where(
        and(
          eq(campaigns.workspaceId, workspaceId),
          or(
            sql`coalesce(array_length(${campaigns.targetFormats}, 1), 0) > 0`,
            sql`coalesce(array_length(${campaigns.ctaVariants}, 1), 0) > 0`
          )
        )
      )
      .orderBy(campaigns.updatedAt, campaigns.createdAt)
      .limit(1);

    if (
      recipeCampaignRow &&
      !completions.has("strategy_recipe") &&
      ((recipeCampaignRow.targetFormats?.length ?? 0) > 0 ||
        (recipeCampaignRow.ctaVariants?.length ?? 0) > 0)
    ) {
      completions.set("strategy_recipe", {
        key: "strategy_recipe",
        completedAt: recipeCampaignRow.updatedAt ?? recipeCampaignRow.createdAt,
        evidenceId: recipeCampaignRow.id,
        evidenceType: "campaign",
      });
    }
  }

  const [previewRow] = await db
    .select({
      id: derivations.id,
      createdAt: derivations.createdAt,
      campaignId: derivations.campaignId,
    })
    .from(derivations)
    .where(
      and(
        eq(derivations.workspaceId, workspaceId),
        eq(derivations.isPreview, true),
        inArray(derivations.status, ["completed", "approved"])
      )
    )
    .orderBy(derivations.createdAt)
    .limit(1);

  if (previewRow && !completions.has("preview")) {
    completions.set("preview", {
      key: "preview",
      completedAt: previewRow.createdAt,
      evidenceId: previewRow.id,
      evidenceType: "derivation",
    });
  }

  const [batchRow] = await db
    .select({
      id: derivations.id,
      createdAt: derivations.createdAt,
      campaignId: derivations.campaignId,
    })
    .from(derivations)
    .where(
      and(
        eq(derivations.workspaceId, workspaceId),
        eq(derivations.isPreview, false),
        inArray(derivations.status, ["completed", "approved", "processing", "queued"])
      )
    )
    .orderBy(derivations.createdAt)
    .limit(1);

  if (batchRow && !completions.has("batch")) {
    completions.set("batch", {
      key: "batch",
      completedAt: batchRow.createdAt,
      evidenceId: batchRow.id,
      evidenceType: "derivation",
    });
  }

  const [reviewRow] = await db
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
        inArray(derivations.status, ["approved", "rejected"])
      )
    )
    .orderBy(derivations.updatedAt, derivations.createdAt)
    .limit(1);

  if (reviewRow && !completions.has("review")) {
    completions.set("review", {
      key: "review",
      completedAt: reviewRow.updatedAt ?? reviewRow.createdAt,
      evidenceId: reviewRow.id,
      evidenceType: "derivation",
    });
  }

  const [regenerationRow] = await db
    .select({
      id: derivations.id,
      createdAt: derivations.createdAt,
      campaignId: derivations.campaignId,
    })
    .from(derivations)
    .where(
      and(
        eq(derivations.workspaceId, workspaceId),
        isNotNull(derivations.parentId),
        inArray(derivations.status, ["completed", "approved", "processing", "queued"])
      )
    )
    .orderBy(derivations.createdAt)
    .limit(1);

  if (regenerationRow && !completions.has("regeneration")) {
    completions.set("regeneration", {
      key: "regeneration",
      completedAt: regenerationRow.createdAt,
      evidenceId: regenerationRow.id,
      evidenceType: "derivation",
    });
  }

  // Re-sync export/share from progression evidence
  for (const item of progressionContext.evidence) {
    const missionKey = PROGRESSION_TO_MISSION[item.key];
    if (missionKey && (missionKey === "export" || missionKey === "share")) {
      completions.set(missionKey, {
        key: missionKey,
        completedAt: item.completedAt,
        evidenceId: item.evidenceId,
        evidenceType: item.evidenceType,
      });
    }
  }

  return Array.from(completions.values()).sort(
    (a, b) => a.completedAt.getTime() - b.completedAt.getTime()
  );
}

export function isMissionPrerequisiteMet(
  key: MissionKey,
  completedKeys: Set<MissionKey>
): boolean {
  const prerequisite = MISSION_DEFINITIONS[key].prerequisite;
  if (!prerequisite) return true;
  return completedKeys.has(prerequisite);
}

export function getMissionBlockedReason(key: MissionKey): string | undefined {
  const definition = MISSION_DEFINITIONS[key];
  if (!definition.prerequisite) return undefined;
  return definition.blockedReason ?? "";
}

/** @internal exported for tests */
export function missionBriefingSatisfied(fields: {
  objective?: string | null;
  audience?: string | null;
  tone?: string | null;
  offer?: string | null;
}): boolean {
  if (!hasBriefingContent(fields.objective)) return false;
  return (
    hasBriefingContent(fields.audience) ||
    hasBriefingContent(fields.tone) ||
    hasBriefingContent(fields.offer)
  );
}
