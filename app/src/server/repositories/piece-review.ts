import { eq } from "drizzle-orm";
import { db } from "../db";
import { pieceReviewComments, type PieceReviewComment } from "../db/schema";
import type { PieceReviewArea, PieceReviewDecision } from "../creative-work/external-piece-review";

export async function insertPieceReviewComment(input: {
  shareLinkId: string;
  workspaceId: string;
  outputId: string;
  outputVersion: number;
  authorLabel: string;
  decision: PieceReviewDecision;
  body: string | null;
  area: PieceReviewArea | null;
}): Promise<PieceReviewComment> {
  const [created] = await db
    .insert(pieceReviewComments)
    .values(input)
    .returning();
  return created!;
}

export async function listPieceReviewComments(
  shareLinkId: string,
): Promise<PieceReviewComment[]> {
  return db
    .select()
    .from(pieceReviewComments)
    .where(eq(pieceReviewComments.shareLinkId, shareLinkId))
    .orderBy(pieceReviewComments.createdAt);
}
