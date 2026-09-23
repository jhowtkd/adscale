import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import {
  getFeedbackReportById,
  updateFeedbackReportStatus,
  type FeedbackStatus,
} from "@/server/repositories/feedback";
import { objectStorage } from "@/server/storage";
import { db } from "@/server/db";
import { campaignAssets, derivations, workspaceAssets } from "@/server/db/schema";
import { and, eq, inArray } from "drizzle-orm";

const patchSchema = z.object({
  status: z.enum(["new", "reviewing", "resolved", "archived"]).optional(),
  internalNotes: z.string().max(8000).nullable().optional(),
  resolutionSummary: z.string().max(4000).nullable().optional(),
});

async function resolveAssetLinks(
  workspaceId: string,
  assetRefs: Array<{ kind: string; id: string; key?: string }> | null
) {
  if (!assetRefs?.length) return [];

  const links: Array<{ kind: string; id: string; url?: string; key?: string }> = [];
  const campaignIds = [...new Set(assetRefs.filter((ref) => ref.kind === "campaign_asset").map((ref) => ref.id))];
  const workspaceIds = [...new Set(assetRefs.filter((ref) => ref.kind === "workspace_asset").map((ref) => ref.id))];
  const [campaignRows, workspaceRows] = await Promise.all([
    campaignIds.length
      ? db.select({ id: campaignAssets.id, key: campaignAssets.key }).from(campaignAssets).where(and(
          eq(campaignAssets.workspaceId, workspaceId),
          inArray(campaignAssets.id, campaignIds),
        ))
      : [],
    workspaceIds.length
      ? db.select({ id: workspaceAssets.id, key: workspaceAssets.key }).from(workspaceAssets).where(and(
          eq(workspaceAssets.workspaceId, workspaceId),
          inArray(workspaceAssets.id, workspaceIds),
        ))
      : [],
  ]);
  const campaignKeys = new Map(campaignRows.map((row) => [row.id, row.key]));
  const workspaceKeys = new Map(workspaceRows.map((row) => [row.id, row.key]));

  for (const ref of assetRefs) {
    if (ref.kind === "derivation_output" && ref.key) {
      links.push({
        kind: ref.kind,
        id: ref.id,
        key: ref.key,
        url: await objectStorage.signedDownloadUrl(ref.key),
      });
      continue;
    }

    if (ref.kind !== "campaign_asset" && ref.kind !== "workspace_asset") continue;
    const key = ref.kind === "campaign_asset"
      ? campaignKeys.get(ref.id)
      : workspaceKeys.get(ref.id);
    if (key) {
      links.push({
        kind: ref.kind,
        id: ref.id,
        key,
        url: await objectStorage.signedDownloadUrl(key),
      });
    }
  }

  return links;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePlatformOwner(request);
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return apiError("validation_error", 400);
    }

    const report = await getFeedbackReportById(workspaceId, id);
    if (!report) {
      return apiError("not_found", 404);
    }

    const assetLinks = await resolveAssetLinks(workspaceId, report.assetRefs ?? []);

    let derivationSummary = null;
    if (report.derivationId) {
      const [derivation] = await db
        .select({
          id: derivations.id,
          status: derivations.status,
          format: derivations.format,
          generationMode: derivations.generationMode,
          outputKey: derivations.outputKey,
          qualityVerdict: derivations.qualityVerdict,
        })
        .from(derivations)
        .where(
          and(
            eq(derivations.id, report.derivationId),
            eq(derivations.workspaceId, workspaceId)
          )
        )
        .limit(1);
      derivationSummary = derivation ?? null;
    }

    return NextResponse.json({
      report,
      assetLinks,
      derivationSummary,
    });
  } catch (error) {
    return handleApiError(error, "feedback.reports.[id].GET");
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePlatformOwner(request);
    const { id } = await params;
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("validation_error", 400, parsed.error.flatten());
    }

    const workspaceId = new URL(request.url).searchParams.get("workspaceId");
    if (!workspaceId) {
      return apiError("validation_error", 400);
    }

    const existing = await getFeedbackReportById(workspaceId, id);
    if (!existing) {
      return apiError("not_found", 404);
    }

    const status = (parsed.data.status ?? existing.status) as FeedbackStatus;
    const report = await updateFeedbackReportStatus(workspaceId, id, status, {
      internalNotes:
        parsed.data.internalNotes !== undefined
          ? parsed.data.internalNotes
          : existing.internalNotes,
      resolutionSummary:
        parsed.data.resolutionSummary !== undefined
          ? parsed.data.resolutionSummary
          : existing.resolutionSummary,
    });

    return NextResponse.json({ report });
  } catch (error) {
    return handleApiError(error, "feedback.reports.[id].PATCH");
  }
}
