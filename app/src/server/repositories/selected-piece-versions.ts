import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "../db";
import { creativeWorkOutputs } from "../db/schema";
import type { SelectedPieceRow } from "@/server/creative-work/value-delivered";

export async function listSelectedCreativeWorkPieceVersions(
  workspaceId: string,
): Promise<SelectedPieceRow[]> {
  const rows = await db
    .select({
      workspaceId: creativeWorkOutputs.workspaceId,
      outputId: creativeWorkOutputs.id,
      outputKey: creativeWorkOutputs.outputKey,
    })
    .from(creativeWorkOutputs)
    .where(and(
      eq(creativeWorkOutputs.workspaceId, workspaceId),
      eq(creativeWorkOutputs.isSelected, true),
      eq(creativeWorkOutputs.status, "completed"),
      isNotNull(creativeWorkOutputs.outputKey),
    ));

  return rows.flatMap((row) => (
    row.outputKey
      ? [{ workspaceId: row.workspaceId, outputId: row.outputId, outputKey: row.outputKey }]
      : []
  ));
}
