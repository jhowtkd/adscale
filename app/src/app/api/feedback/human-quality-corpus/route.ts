import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { requirePlatformOwner } from "@/server/auth/platform-owner";
import type { HumanQualityCorpusItem } from "@/server/db/schema";
import { FeedbackValidationError } from "@/server/feedback/validate-refs";
import { HUMAN_QUALITY_CORPUS_COHORTS } from "@/server/human-quality/corpus";
import { getPreviewUrlsForDerivations } from "@/server/human-quality/preview-images";
import {
  HumanQualityServiceError,
  MAX_CORPUS_BATCH_SIZE,
  batchSelectDerivationsForCorpus,
  getCorpusQueueProgress,
  listCorpusQueue,
  selectDerivationForCorpus,
} from "@/server/human-quality/service";
import { parseCorpusQueueFilters } from "@/server/human-quality/queue-filters";

const corpusLogger = logger.child("human-quality-corpus");

async function attachPreviewImages(items: HumanQualityCorpusItem[]) {
  if (items.length === 0) return [];

  const previewByDerivationId = await getPreviewUrlsForDerivations(
    items.map((item) => ({
      workspaceId: item.workspaceId,
      derivationId: item.derivationId,
    }))
  );

  return items.map((item) => ({
    ...item,
    previewImageUrl: previewByDerivationId.get(item.derivationId) ?? null,
  }));
}

const selectCorpusBaseSchema = z.object({
  workspaceId: z.string().uuid(),
  campaignId: z.string().uuid(),
  cohort: z.enum(HUMAN_QUALITY_CORPUS_COHORTS).optional(),
  corpusVersion: z.number().int().min(1).max(100).optional(),
  artifactRef: z.record(z.string(), z.unknown()).optional(),
  qualitySnapshot: z.record(z.string(), z.unknown()).optional(),
});

const selectCorpusSchema = z.union([
  selectCorpusBaseSchema.extend({
    derivationId: z.string().uuid(),
  }),
  selectCorpusBaseSchema.extend({
    derivationIds: z
      .array(z.string().uuid())
      .min(1)
      .max(MAX_CORPUS_BATCH_SIZE),
  }),
]);

export async function GET(request: Request) {
  try {
    const { user } = await requirePlatformOwner(request);
    const { searchParams } = new URL(request.url);
    const { filters, errors } = parseCorpusQueueFilters(searchParams);

    if (errors.length > 0) {
      return apiError("validation_error", 400, { errors });
    }

    const includeProgress = searchParams.get("includeProgress") === "true";

    const rows = await listCorpusQueue(filters);
    const itemsWithPreview = await attachPreviewImages(rows.map((row) => row.item));
    const items = itemsWithPreview.map((item, index) => ({
      ...item,
      sourceLabel: rows[index]?.sourceLabel ?? "operator_imported",
    }));

    if (!filters.workspaceId) {
      corpusLogger.info("global corpus list", {
        userId: user.id,
        action: "list",
        limit: filters.limit ?? null,
        itemCount: items.length,
        filters: {
          cohort: filters.cohort ?? null,
          sourceLabel: filters.sourceLabel ?? null,
          status: filters.status ?? "pending",
        },
      });
    }

    const response: {
      items: typeof items;
      progress?: Awaited<ReturnType<typeof getCorpusQueueProgress>>;
    } = { items };

    if (includeProgress) {
      response.progress = await getCorpusQueueProgress(filters);
    }

    return NextResponse.json(response);
  } catch (error) {
    return handleApiError(error, "feedback.human-quality-corpus.GET");
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await requirePlatformOwner(request);
    const parsed = selectCorpusSchema.safeParse(await request.json());

    if (!parsed.success) {
      return apiError("validation_error", 400, parsed.error.flatten());
    }

    const payload = parsed.data;

    if ("derivationIds" in payload) {
      const batchResult = await batchSelectDerivationsForCorpus({
        workspaceId: payload.workspaceId,
        campaignId: payload.campaignId,
        derivationIds: payload.derivationIds,
        selectedByUserId: user.id,
        cohort: payload.cohort,
        corpusVersion: payload.corpusVersion,
        artifactRef: payload.artifactRef,
        qualitySnapshot: payload.qualitySnapshot,
      });

      return NextResponse.json(batchResult);
    }

    const item = await selectDerivationForCorpus({
      ...payload,
      selectedByUserId: user.id,
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    if (error instanceof FeedbackValidationError) {
      return apiError(error.code, 400);
    }

    if (error instanceof HumanQualityServiceError) {
      if (error.code === "duplicate_corpus_item") {
        return apiError(error.code, 409);
      }
      if (error.code === "forbidden_corpus_payload") {
        return apiError(error.code, 400);
      }
      if (error.code === "batch_size_exceeded") {
        return apiError(error.code, 400);
      }
      return apiError(error.code, 400);
    }

    return handleApiError(error, "feedback.human-quality-corpus.POST");
  }
}
