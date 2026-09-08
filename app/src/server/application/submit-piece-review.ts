import { resolveShareToken } from "@/lib/share-token";
import { getCreativeWork } from "@/server/repositories/creative-work";
import {
  insertPieceReviewComment,
  listPieceReviewComments,
} from "@/server/repositories/piece-review";
import {
  assertExternalApprovalAllowed,
  assertGuestPackageAccess,
  buildPieceReviewEntry,
  isPieceReviewDecision,
  isPieceReviewLink,
  normalizeAuthorLabel,
  normalizeReviewArea,
  normalizeReviewBody,
  pinReviewToVersion,
  type PieceReviewDecision,
} from "@/server/creative-work/external-piece-review";
import type { PieceReviewComment } from "@/server/db/schema";

export type SubmitPieceReviewInput = {
  token: string;
  requestedOutputId: string;
  authorLabel: unknown;
  decision: unknown;
  body?: unknown;
  area?: unknown;
};

export type SubmitPieceReviewError =
  | { code: "share_unavailable" }
  | { code: "package_forbidden" }
  | { code: "invalid_input"; reason: string }
  | { code: "objective_rejection" }
  | { code: "output_not_found" };

export async function submitPieceReview(
  input: SubmitPieceReviewInput,
): Promise<
  | { ok: true; value: { comment: PieceReviewComment; history: PieceReviewComment[] } }
  | { ok: false; error: SubmitPieceReviewError }
> {
  const resolution = await resolveShareToken(input.token);
  const authorizedOutputId = resolution.status === "valid" ? resolution.link.outputId : null;
  const access = assertGuestPackageAccess({
    tokenStatus: resolution.status,
    requestedOutputId: input.requestedOutputId,
    authorizedOutputId,
  });
  if (!access.ok) return { ok: false, error: { code: access.error } };
  if (resolution.status !== "valid") return { ok: false, error: { code: "share_unavailable" } };
  if (!isPieceReviewLink(resolution.link) || !resolution.link.creativeWorkId || !resolution.link.outputId) {
    return { ok: false, error: { code: "package_forbidden" } };
  }

  if (!isPieceReviewDecision(input.decision)) {
    return { ok: false, error: { code: "invalid_input", reason: "decision" } };
  }
  const decision: PieceReviewDecision = input.decision;
  const author = normalizeAuthorLabel(input.authorLabel);
  if (!author.ok) return { ok: false, error: { code: "invalid_input", reason: author.error } };
  const body = normalizeReviewBody(input.body, decision);
  if (!body.ok) return { ok: false, error: { code: "invalid_input", reason: body.error } };
  const area = normalizeReviewArea(input.area);
  if (!area.ok) return { ok: false, error: { code: "invalid_input", reason: area.error } };

  const version = pinReviewToVersion({
    authorizedOutputId: resolution.link.outputId,
    authorizedVersion: resolution.link.outputVersion ?? 0,
    requestedOutputId: input.requestedOutputId,
  });
  if (!version.ok) return { ok: false, error: { code: "package_forbidden" } };

  const work = await getCreativeWork(resolution.link.workspaceId, resolution.link.creativeWorkId);
  const output = work?.outputs.find((row) => row.id === version.outputId);
  if (!output) return { ok: false, error: { code: "output_not_found" } };

  const approval = assertExternalApprovalAllowed(output.quality, decision);
  if (!approval.ok) return { ok: false, error: { code: "objective_rejection" } };

  const entry = buildPieceReviewEntry({
    outputId: version.outputId,
    outputVersion: version.outputVersion,
    authorLabel: author.label,
    decision,
    body: body.body,
    area: area.area,
  });

  const comment = await insertPieceReviewComment({
    shareLinkId: resolution.link.id,
    workspaceId: resolution.link.workspaceId,
    ...entry,
  });
  const history = await listPieceReviewComments(comment.shareLinkId);
  return { ok: true, value: { comment, history } };
}
