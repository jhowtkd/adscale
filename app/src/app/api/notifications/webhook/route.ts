import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/with-rate-limit";
import {
  shouldSendToUser,
  getUserLocale,
  sendDerivationCompleteEmail,
  sendPlanReadyEmail,
  sendLowCreditsEmail,
  sendTrialExpiringEmail,
} from "@/server/services/notifications";
import { env } from "@/server/validation/env";

/**
 * Constant-time string comparison to prevent timing side-channels when
 * comparing the webhook secret. Returns false early on length mismatch
 * (which itself reveals length, but not content — acceptable for a
 * high-entropy secret, and we still constant-time-compare the hashes).
 */
function safeEqualSecret(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

const webhookSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("derivation_complete"),
    userId: z.string(),
    payload: z.object({
      campaignName: z.string(),
      derivationCount: z.number(),
    }),
  }),
  z.object({
    type: z.literal("plan_ready"),
    userId: z.string(),
    payload: z.object({
      campaignName: z.string(),
    }),
  }),
  z.object({
    type: z.literal("low_credits"),
    userId: z.string(),
    payload: z.object({
      creditBalance: z.number(),
    }),
  }),
  z.object({
    type: z.literal("trial_expiring"),
    userId: z.string(),
    payload: z.object({
      daysLeft: z.number(),
    }),
  }),
]);

export async function POST(request: Request) {
  try {
    // Rate limit to prevent brute-forcing the shared secret.
    const rateLimitResult = await checkRateLimit(request, { category: "auth" });
    if (rateLimitResult) return rateLimitResult;

    // Verify webhook secret to prevent unauthorized access.
    // Constant-time compare to prevent timing-based byte recovery.
    const providedSecret = request.headers.get("x-webhook-secret");
    const expectedSecret = env.NOTIFICATION_WEBHOOK_SECRET;
    if (!providedSecret || !expectedSecret || !safeEqualSecret(providedSecret, expectedSecret)) {
      return apiError("unauthorized", 401);
    }

    const body = await request.json();
    const parsed = webhookSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const { type, userId, payload } = parsed.data;
    const { send, email } = await shouldSendToUser(userId);

    if (!send || !email) {
      return NextResponse.json({ sent: false, reason: "notificationsDisabled" });
    }

    const locale = await getUserLocale(userId);

    switch (type) {
      case "derivation_complete":
        await sendDerivationCompleteEmail({
          to: email,
          campaignName: payload.campaignName,
          derivationCount: payload.derivationCount,
          locale,
        });
        break;
      case "plan_ready":
        await sendPlanReadyEmail({
          to: email,
          campaignName: payload.campaignName,
          locale,
        });
        break;
      case "low_credits":
        await sendLowCreditsEmail({
          to: email,
          creditBalance: payload.creditBalance,
          locale,
        });
        break;
      case "trial_expiring":
        await sendTrialExpiringEmail({
          to: email,
          daysLeft: payload.daysLeft,
          locale,
        });
        break;
    }

    return NextResponse.json({ sent: true, type });
  } catch (error) {
    return handleApiError(error, "notifications.webhook.POST");
  }
}
