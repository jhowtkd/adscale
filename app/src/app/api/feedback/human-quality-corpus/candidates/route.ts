import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { requirePlatformOwner } from "@/server/auth/platform-owner";
import {
  HUMAN_QUALITY_SOURCE_LABELS,
  isHumanQualitySourceLabel,
} from "@/server/human-quality/corpus";
import { getPreviewUrlsForDerivations } from "@/server/human-quality/preview-images";
import { listCorpusCandidates } from "@/server/repositories/human-quality-candidate";

const corpusLogger = logger.child("human-quality-corpus");

const querySchema = z.object({
  workspaceId: z.string().uuid().optional(),
  sourceLabel: z.enum(HUMAN_QUALITY_SOURCE_LABELS).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(request: Request) {
  try {
    const { user } = await requirePlatformOwner(request);
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      workspaceId: searchParams.get("workspaceId") ?? undefined,
      sourceLabel: searchParams.get("sourceLabel") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    if (!parsed.success) {
      return apiError("validation_error", 400, parsed.error.flatten());
    }

    if (
      searchParams.get("sourceLabel") &&
      !isHumanQualitySourceLabel(searchParams.get("sourceLabel")!)
    ) {
      return apiError("validation_error", 400, {
        sourceLabel: `must be one of: ${HUMAN_QUALITY_SOURCE_LABELS.join(", ")}`,
      });
    }

    const candidates = await listCorpusCandidates({
      workspaceId: parsed.data.workspaceId,
      sourceLabel: parsed.data.sourceLabel,
      unpromotedOnly: true,
      limit: parsed.data.limit,
    });

    const previewByDerivationId = await getPreviewUrlsForDerivations(
      candidates.map((candidate) => ({
        workspaceId: candidate.workspaceId,
        derivationId: candidate.derivationId,
      }))
    );

    const items = candidates.map((candidate) => ({
      id: candidate.id,
      workspaceId: candidate.workspaceId,
      clientProfileId: candidate.clientProfileId,
      campaignId: candidate.campaignId,
      derivationId: candidate.derivationId,
      generationMode: candidate.generationMode,
      format: candidate.format,
      corpusVersion: candidate.corpusVersion,
      sourceLabel: candidate.sourceLabel,
      qualitySnapshot: candidate.qualitySnapshot,
      capturedAt: candidate.capturedAt,
      previewImageUrl: previewByDerivationId.get(candidate.derivationId) ?? null,
    }));

    corpusLogger.info("global corpus candidates listed", {
      userId: user.id,
      action: "list_candidates",
      count: items.length,
    });

    return NextResponse.json({ items, total: items.length });
  } catch (error) {
    return handleApiError(error, "feedback.human-quality-corpus.candidates.GET");
  }
}
