import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  getCreativeWork,
  selectCreativeWorkOutput,
} from "@/server/repositories/creative-work";
import {
  createWorkspaceAsset,
  getWorkspaceAssetByKey,
} from "@/server/repositories/workspace-asset";
import { objectStorage } from "@/server/storage";

const selectOutputSchema = z
  .object({
    saveToLibrary: z.boolean().default(true),
  })
  .default({ saveToLibrary: true });

/**
 * Select a completed output as the winner. Optionally saves the PNG to the
 * workspace library as a `creative_work`-sourced asset. Idempotent: repeated
 * calls reuse the existing workspace asset when the same key is already
 * registered.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; outputId: string }> }
) {
  try {
    const [{ workspace }, { id, outputId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const parsed = selectOutputSchema.safeParse(
      await request.json().catch(() => ({})),
    );
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }
    const { saveToLibrary } = parsed.data;

    const existing = await getCreativeWork(workspace.id, id);
    if (!existing) {
      return apiError("creativeWorkNotFound", 404);
    }

    const output = existing.outputs.find((o) => o.id === outputId);
    if (!output) {
      return apiError("creativeWorkOutputNotFound", 404);
    }

    if (output.status !== "completed") {
      return apiError("creativeWorkOutputNotSelectable", 409, {
        status: output.status,
      });
    }

    if (!output.outputKey) {
      return apiError("creativeWorkOutputMissingKey", 409);
    }

    const selected = await selectCreativeWorkOutput(workspace.id, id, outputId);
    if (!selected) {
      return apiError("creativeWorkOutputNotFound", 404);
    }

    if (saveToLibrary) {
      // Reuse the existing library entry when one is already registered for
      // this output key (idempotent re-select).
      const existingAsset = await getWorkspaceAssetByKey(
        workspace.id,
        output.outputKey,
      );
      if (!existingAsset) {
        const head = await objectStorage.head(output.outputKey);
        const size = Number(head?.contentLength ?? 0);
        await createWorkspaceAsset({
          workspaceId: workspace.id,
          name: `Post ${existing.work.brief.theme} - ${output.creativeLevel}`,
          key: output.outputKey,
          type: "image/png",
          size,
          source: "creative_work",
        });
      }
    }

    return NextResponse.json({ output: selected });
  } catch (error) {
    return handleApiError(error, "creative-work.[id].outputs.[outputId].select.POST");
  }
}