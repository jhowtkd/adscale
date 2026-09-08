import { getCreativeWork } from "@/server/repositories/creative-work";
import { upsertShareLinkForOutput } from "@/server/repositories/share-link";

const SHARE_LINK_TTL_DAYS = 7;

export type CreatePieceReviewShareInput = {
  workspaceId: string;
  workItemId: string;
  outputId: string;
};

export type CreatePieceReviewShareError =
  | { code: "work_not_found" }
  | { code: "output_not_found" }
  | { code: "output_not_shareable"; status?: string };

function buildShareUrl(token: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  return `${baseUrl}/share/${token}`;
}

export async function createPieceReviewShare(
  input: CreatePieceReviewShareInput,
): Promise<
  | { ok: true; value: { shareUrl: string; expiresAt: Date; outputVersion: number } }
  | { ok: false; error: CreatePieceReviewShareError }
> {
  const existing = await getCreativeWork(input.workspaceId, input.workItemId);
  if (!existing) return { ok: false, error: { code: "work_not_found" } };

  const output = existing.outputs.find((row) => row.id === input.outputId);
  if (!output) return { ok: false, error: { code: "output_not_found" } };
  if (output.status !== "completed" || !output.outputKey) {
    return { ok: false, error: { code: "output_not_shareable", status: output.status } };
  }

  const link = await upsertShareLinkForOutput({
    workspaceId: input.workspaceId,
    creativeWorkId: existing.work.id,
    outputId: output.id,
    outputVersion: output.versionNumber,
    expiresAt: new Date(Date.now() + SHARE_LINK_TTL_DAYS * 24 * 60 * 60 * 1000),
  });

  return {
    ok: true,
    value: {
      shareUrl: buildShareUrl(link.token),
      expiresAt: link.expiresAt,
      outputVersion: output.versionNumber,
    },
  };
}
