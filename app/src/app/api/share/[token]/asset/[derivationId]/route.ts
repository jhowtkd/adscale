import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/with-rate-limit";
import { validateShareToken } from "@/lib/share-token";
import { isDerivationPackageEligibleByVerdict } from "@/server/ai/client-approval-package";
import { getDerivationById } from "@/server/repositories/derivation";
import { objectStorage } from "@/server/storage";

function isShareableDerivation(
  derivation: NonNullable<Awaited<ReturnType<typeof getDerivationById>>>
) {
  return (
    derivation.status === "approved" &&
    !derivation.isPreview &&
    Boolean(derivation.outputKey) &&
    isDerivationPackageEligibleByVerdict(derivation)
  );
}

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

    if (!link.derivationIds.includes(derivationId)) {
      return apiError("derivationNotInShareLink", 403);
    }

    const derivation = await getDerivationById(
      derivationId,
      link.workspaceId
    );

    if (
      !derivation ||
      derivation.campaignId !== link.campaignId ||
      !isShareableDerivation(derivation)
    ) {
      return apiError("derivationNotFound", 404);
    }

    const signedUrl = await objectStorage.signedDownloadUrl(
      derivation.outputKey
    );

    return NextResponse.redirect(signedUrl, { status: 302 });
  } catch (error) {
    return handleApiError(error, "share.[token].asset.[derivationId].GET");
  }
}
