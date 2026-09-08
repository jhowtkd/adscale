import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/with-rate-limit";
import { validateShareToken } from "@/lib/share-token";
import { getDerivationById } from "@/server/repositories/derivation";
import { getCreativeWork } from "@/server/repositories/creative-work";
import { objectStorage } from "@/server/storage";
import { objectDownloadResponse } from "@/server/storage/download-response";
import { submitPieceReview } from "@/server/application/submit-piece-review";
import { isPieceReviewLink } from "@/server/creative-work/external-piece-review";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; derivationId: string }> }
) {
  try {
    const { token, derivationId } = await params;
    const rateLimitResult = await checkRateLimit(_request, { category: "read", identifier: token });
    if (rateLimitResult) return rateLimitResult;
    const link = await validateShareToken(token);

    if (!link) {
      return apiError("shareLinkNotFound", 404);
    }

    if (isPieceReviewLink(link)) {
      if (derivationId !== link.outputId) {
        return apiError("shareAssetForbidden", 403);
      }
      const work = await getCreativeWork(link.workspaceId, link.creativeWorkId!);
      const output = work?.outputs.find((row) => row.id === link.outputId);
      if (!output?.outputKey) {
        return apiError("creativeWorkOutputNotFound", 404);
      }
      const signedUrl = await objectStorage.signedDownloadUrl(output.outputKey);
      return objectDownloadResponse(signedUrl, output.outputKey);
    }

    if (!link.derivationIds.includes(derivationId)) {
      return apiError("shareAssetForbidden", 403);
    }

    const derivation = await getDerivationById(
      derivationId,
      link.workspaceId
    );

    if (!derivation?.outputKey) {
      return apiError("derivationNotFound", 404);
    }

    const signedUrl = await objectStorage.signedDownloadUrl(
      derivation.outputKey
    );

    return objectDownloadResponse(signedUrl, derivation.outputKey);
  } catch (error) {
    return handleApiError(error, "share.[token].asset.[derivationId].GET");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string; derivationId: string }> }
) {
  try {
    const { token, derivationId } = await params;
    const rateLimitResult = await checkRateLimit(request, { category: "general", identifier: token });
    if (rateLimitResult) return rateLimitResult;

    const body = await request.json().catch(() => null);
    const submitted = await submitPieceReview({
      token,
      requestedOutputId: derivationId,
      authorLabel: body?.authorLabel,
      decision: body?.decision,
      body: body?.body,
      area: body?.area,
    });

    if (!submitted.ok) {
      switch (submitted.error.code) {
        case "share_unavailable":
          return apiError("shareLinkNotFound", 404);
        case "package_forbidden":
          return apiError("shareAssetForbidden", 403);
        case "output_not_found":
          return apiError("creativeWorkOutputNotFound", 404);
        case "objective_rejection":
          return apiError("pieceReviewObjectiveRejected", 409);
        case "invalid_input":
          return apiError("invalidRequestBody", 400, { reason: submitted.error.reason });
      }
    }

    return NextResponse.json({
      comment: submitted.value.comment,
      history: submitted.value.history,
    });
  } catch (error) {
    return handleApiError(error, "share.[token].asset.[derivationId].POST");
  }
}
