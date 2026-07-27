import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { prepareDeliveryPackage } from "@/server/application/prepare-delivery-package";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getUserLocale } from "@/server/repositories/user";

const bodySchema = z.object({
  formats: z.array(z.string()).min(1),
});

/**
 * HTTP adapter for delivery package — auth + parse only.
 * Domain rules live in `prepareDeliveryPackage`.
 */
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

    const attemptId =
      request.headers.get("idempotency-key")?.trim() ||
      request.headers.get("x-idempotency-key")?.trim() ||
      crypto.randomUUID();
    const formatsKey = [...new Set(parsed.data.formats)].sort().join(",");
    const result = await prepareDeliveryPackage({
      workspaceId: workspace.id,
      sourceDerivationId: id,
      formats: parsed.data.formats,
      userId: user.id,
      locale,
      billingIdempotencyKey: `delivery-package:${id}:${formatsKey}:${attemptId}`,
    });

    if (!result.ok) {
      switch (result.error.code) {
        case "derivation_not_found":
          return apiError("derivationNotFound", 404);
        case "source_not_approved":
          return apiError("sourceDerivationNotApproved", 409);
        case "source_missing_output":
          return apiError("sourceDerivationMissingOutput", 400);
        case "derivation_hard_failures":
          return apiError("derivationHardFailures", 409, {
            qualityVerdict: result.error.qualityVerdict,
            hardFailures: result.error.hardFailures,
          });
        case "credit_blocked":
          return apiError(
            result.error.spend.conversionPayload.reason,
            402,
            result.error.spend.conversionPayload
          );
        case "no_formats_to_generate":
          return apiError("invalidRequestBody", 400);
        default:
          return apiError("invalidRequest", 400);
      }
    }

    return NextResponse.json(result.value);
  } catch (error) {
    return handleApiError(error, "derivations.[id].delivery-package.POST");
  }
}
