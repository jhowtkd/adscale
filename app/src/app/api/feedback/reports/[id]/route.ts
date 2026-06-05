import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requirePlatformOwner } from "@/server/auth/platform-owner";
import {
  getFeedbackReportById,
  updateFeedbackReportStatus,
  type FeedbackStatus,
} from "@/server/repositories/feedback";
import { getPresignedDownloadUrl } from "@/server/storage/r2";
import { db } from "@/server/db";
import { campaignAssets, derivations, workspaceAssets } from "@/server/db/schema";
import { and, eq } from "drizzle-orm";

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

  for (const ref of assetRefs) {
    if (ref.kind === "derivation_output" && ref.key) {
      links.push({
        kind: ref.kind,
        id: ref.id,
        key: ref.key,
        url: await getPresignedDownloadUrl(ref.key),
      });
      continue;
    }

    if (ref.kind === "campaign_asset") {
      const [asset] = await db
        .select()
        .from(campaignAssets)
        .where(
          and(
            eq(campaignAssets.id, ref.id),
            eq(campaignAssets.workspaceId, workspaceId)
          )
        )
        .limit(1);
      if (asset) {
        links.push({
          kind: ref.kind,
          id: ref.id,
          key: asset.key,
          url: await getPresignedDownloadUrl(asset.key),
        });
      }
      continue;
    }

    if (ref.kind === "workspace_asset") {
      const [asset] = await db
        .select()
        .from(workspaceAssets)
        .where(
          and(
            eq(workspaceAssets.id, ref.id),
            eq(workspaceAssets.workspaceId, workspaceId)
          )
        )
        .limit(1);
      if (asset) {
        links.push({
          kind: ref.kind,
          id: ref.id,
          key: asset.key,
          url: await getPresignedDownloadUrl(asset.key),
        });
      }
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
