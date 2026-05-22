import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import {
  shouldSendToUser,
  getUserLocale,
  sendDerivationCompleteEmail,
  sendPlanReadyEmail,
  sendLowCreditsEmail,
  sendTrialExpiringEmail,
} from "@/server/services/notifications";

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
