import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import { summarizeMissionCreditSignals } from "@/server/feedback/mission-credit-signals";

export async function GET(request: Request) {
  try {
    await requirePlatformOwner(request);
    const summary = await summarizeMissionCreditSignals();
    return NextResponse.json(summary);
  } catch (error) {
    return handleApiError(error, "feedback.mission-credit-signals.GET");
  }
}
