import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  getDerivationById,
  createDerivation,
  getActivePackageChildren,
  updateDerivationStatus,
} from "@/server/repositories/derivation";
import { updateCampaign } from "@/server/repositories/campaign";
import { getUserLocale } from "@/server/repositories/user";
import { inngest } from "@/server/jobs/client";

const bodySchema = z.object({
  formats: z.array(z.enum(["1:1", "4:5", "9:16"])).min(1),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);
    const locale = await getUserLocale(user.id);
    const { id } = await params;

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
      activeChildren.map((child) => child.format).filter(Boolean)
    );
    const formatsToCreate = generatableFormats.filter(
      (format) => !activeFormats.has(format)
    );

    const queued: { id: string; format: string }[] = [];
    const failed: { id: string; format: string }[] = [];
    for (const format of formatsToCreate) {
      const child = await createDerivation({
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

        queued.push({ id: child.id, format });
      } catch (sendErr) {
        console.error(
          `[delivery-package POST] event send FAILED derivationId=${child.id}`,
          sendErr
        );
        await updateDerivationStatus(child.id, workspace.id, "failed");
        failed.push({ id: child.id, format });
      }
    }

    if (queued.length > 0) {
      await updateCampaign(source.campaignId, workspace.id, {
        status: "generating",
      });
    }

    return NextResponse.json({
      source: { id: source.id, format: source.format },
      readyFormats,
      queued,
      failed,
      skipped: [...activeFormats],
    });
  } catch (error) {
    return handleApiError(error, "derivations.[id].delivery-package.POST");
  }
}
