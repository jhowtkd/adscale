import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { assertDerivationApprovable } from "@/server/ai/creative-quality-gate";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  getDerivationById,
  createPackageChildIfAbsent,
  getActivePackageChildren,
  updateDerivationStatus,
} from "@/server/repositories/derivation";
import { updateCampaign } from "@/server/repositories/campaign";
import { getUserLocale } from "@/server/repositories/user";
import { inngest } from "@/server/jobs/client";
import { spendCreditsOrApiError } from "@/server/billing/gates";
import { recordBrandMemoryEvent } from "@/server/memory/brand-memory-dispatch";

const bodySchema = z.object({
  formats: z.array(z.string()).min(1),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ user, workspace }, { id }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    const locale = await getUserLocale(user.id);

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("invalidRequestBody", 400, parsed.error.flatten());
    }

    const source = await getDerivationById(id, workspace.id);
    if (!source) {
      return apiError("derivationNotFound", 404);
    }
    if (source.status !== "approved") {
      return apiError("sourceDerivationNotApproved", 409);
    }
    if (!source.outputKey) {
      return apiError("sourceDerivationMissingOutput", 400);
    }

    const approvable = assertDerivationApprovable(source);
    if (!approvable.ok) {
      return apiError("derivationHardFailures", 409, {
        qualityVerdict: approvable.qualityVerdict,
        hardFailures: approvable.hardFailures,
      });
    }

    const requestedFormats = [...new Set(parsed.data.formats)];
    const readyFormats = source.format
      ? requestedFormats.filter((format) => format === source.format)
      : [];
    const generatableFormats = requestedFormats.filter(
      (format) => format !== source.format
    );

    const activeChildren = await getActivePackageChildren({
      parentId: source.id,
      workspaceId: workspace.id,
      formats: generatableFormats,
    });
    const activeFormats = new Set(
      activeChildren.flatMap((child) => (child.format ? [child.format] : []))
    );
    const formatsToCreate = generatableFormats.filter(
      (format) => !activeFormats.has(format)
    );

    if (formatsToCreate.length > 0) {
      const creditError = await spendCreditsOrApiError({
        workspaceId: workspace.id,
        action: "delivery_package_child",
        amount: formatsToCreate.length * 5,
        idempotencyKey: `delivery-package:${source.id}:${formatsToCreate.sort().join(",")}`,
        metadata: { sourceDerivationId: source.id, formats: formatsToCreate },
      });
      if (creditError) return creditError;
    }

    const queuedResults = await Promise.all(formatsToCreate.map(async (format) => {
      const { child, created } = await createPackageChildIfAbsent({
        campaignId: source.campaignId,
        workspaceId: workspace.id,
        planId: source.planId ?? undefined,
        parentId: source.id,
        status: "queued",
        generationMode: "format_adaptation",
        variantIndex: source.variantIndex ?? undefined,
        ctaText: source.ctaText ?? undefined,
        format,
      });

      if (!created) {
        return { status: "skipped" as const, id: child.id, format };
      }

      try {
        await inngest.send({
          name: "derivation.generate",
          data: {
            derivationId: child.id,
            campaignId: source.campaignId,
            workspaceId: workspace.id,
            locale,
            generationMode: "format_adaptation",
            variantIndex: source.variantIndex,
            ctaText: source.ctaText,
            format,
          },
        });

        return { status: "queued" as const, id: child.id, format };
      } catch (sendErr) {
        logger.error(
          `[delivery-package POST] event send FAILED derivationId=${child.id}`,
          sendErr
        );
        await updateDerivationStatus(child.id, workspace.id, "failed");
        return { status: "failed" as const, id: child.id, format };
      }
    }));

    const { queued, failed, skippedFromRace } = queuedResults.reduce<{
      queued: { id: string; format: string }[];
      failed: { id: string; format: string }[];
      skippedFromRace: { id: string; format: string }[];
    }>(
      (acc, { status, id, format }) => {
        if (status === "queued") {
          acc.queued.push({ id, format });
        } else if (status === "failed") {
          acc.failed.push({ id, format });
        } else {
          acc.skippedFromRace.push({ id, format });
        }
        return acc;
      },
      { queued: [], failed: [], skippedFromRace: [] }
    );

    if (queued.length > 0) {
      await updateCampaign(source.campaignId, workspace.id, {
        status: "generating",
      });
    }

    await recordBrandMemoryEvent({
      type: "delivery_prepared",
      workspaceId: workspace.id,
      campaignId: source.campaignId,
      derivationId: source.id,
      occurredAt: new Date(),
      summary: `Delivery package was prepared from approved creative ${source.id}.`,
      payload: {
        source: {
          id: source.id,
          format: source.format,
          ctaText: source.ctaText,
          generationMode: source.generationMode,
          qualityScore: source.qualityScore,
          qaStatus: source.qaStatus,
        },
        requestedFormats,
        readyFormats,
        queued,
        failed,
        skipped: [...activeFormats, ...skippedFromRace.map((item) => item.format)],
      },
    });

    return NextResponse.json({
      source: { id: source.id, format: source.format },
      readyFormats,
      queued,
      failed,
      skipped: [...activeFormats, ...skippedFromRace.map((item) => item.format)],
    });
  } catch (error) {
    return handleApiError(error, "derivations.[id].delivery-package.POST");
  }
}
