import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { inngest } from "@/server/jobs/client";
import { getCreativeWork } from "@/server/repositories/creative-work";
import { db } from "@/server/db";
import { creativeWorkOutputs } from "@/server/db/schema";

/**
 * Free retry of a failed output. The original triplet charge already covered
 * this output's generation, so this endpoint does NOT call any billing or
 * credit functions — it only flips the row back to `queued` and re-sends the
 * same `creative-work.generate` event with the same output ID.
 *
 * The status reset is performed inline via `db.update` (with a
 * `status = failed` guard in the WHERE clause) so the retry route stays
 * self-contained — no repository method needs to be added.
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

    const existing = await getCreativeWork(workspace.id, id);
    if (!existing) {
      return apiError("creativeWorkNotFound", 404);
    }

    const output = existing.outputs.find((o) => o.id === outputId);
    if (!output) {
      return apiError("creativeWorkOutputNotFound", 404);
    }

    if (output.status !== "failed") {
      return apiError("creativeWorkOutputNotRetriable", 409, {
        status: output.status,
      });
    }

    const [reset] = await db
      .update(creativeWorkOutputs)
      .set({
        status: "queued",
        failureCode: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(creativeWorkOutputs.workspaceId, workspace.id),
          eq(creativeWorkOutputs.workItemId, id),
          eq(creativeWorkOutputs.id, outputId),
          eq(creativeWorkOutputs.status, "failed"),
        ),
      )
      .returning();

    if (!reset) {
      return apiError("creativeWorkOutputNotRetriable", 409, {
        status: "concurrent_change",
      });
    }

    await inngest.send([
      {
        name: "creative-work.generate",
        data: {
          workspaceId: workspace.id,
          workItemId: id,
          outputId,
          creativeLevel: output.creativeLevel,
        },
      },
    ]);

    return NextResponse.json({ output: reset });
  } catch (error) {
    return handleApiError(error, "creative-work.[id].outputs.[outputId].retry.POST");
  }
}