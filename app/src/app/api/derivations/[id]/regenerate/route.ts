import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/with-rate-limit";
import { getTranslations } from "next-intl/server";
import { regenerateDerivation } from "@/server/application/regenerate-derivation";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getUserLocale } from "@/server/repositories/user";
import { outputLearningApplicationSchema } from "@/server/human-quality/application-schema";

const bodySchema = z.object({
  feedback: z.string().trim().max(2000).optional(),
  outputLearningApplication: outputLearningApplicationSchema.optional(),
});

/**
 * HTTP adapter for regenerate — auth, rate limit, parse only.
 * Domain rules live in `regenerateDerivation`.
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
    const rateLimitResult = await checkRateLimit(request, {
      category: "ai",
      workspaceId: workspace.id,
    });
    if (rateLimitResult) return rateLimitResult;

    const [locale, body] = await Promise.all([
      getUserLocale(user.id),
      request.json(),
    ]);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidRequestBody", 400, parsed.error.flatten());
    }

    const regenerationRequestId = crypto.randomUUID();
    const result = await regenerateDerivation({
      workspaceId: workspace.id,
      derivationId: id,
      feedback: parsed.data.feedback,
      userId: user.id,
      locale,
      billingIdempotencyKey: `regeneration:${id}:${regenerationRequestId}`,
      billingMetadata: { regenerationRequestId },
      outputLearningApplication: parsed.data.outputLearningApplication,
      actorUserId: user.id,
      evidenceSource: "derivations.regenerate.POST",
    });

    if (!result.ok) {
      switch (result.error.code) {
        case "derivation_not_found":
          return apiError("derivationNotFound", 404);
        case "credit_blocked":
          return apiError(
            result.error.spend.conversionPayload.reason,
            402,
            result.error.spend.conversionPayload
          );
        case "dispatch_failed": {
          const t = await getTranslations({ locale, namespace: "errors" });
          return NextResponse.json(
            {
              error: t("generationWorkerUnavailable"),
              code: "generationWorkerUnavailable",
            },
            { status: 503 }
          );
        }
        default:
          return apiError("invalidRequest", 400);
      }
    }

    return NextResponse.json(
      { derivation: result.value.derivation },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error, "derivations.[id].regenerate.POST");
  }
}
