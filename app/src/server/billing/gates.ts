import type { NextResponse } from "next/server";

import { apiError } from "@/lib/api-response";
import { type CreditAction, recordUsage } from "./credits";

export async function spendCreditsOrApiError(input: {
  workspaceId: string;
  action: CreditAction;
  idempotencyKey: string;
  amount?: number;
  metadata?: Record<string, unknown>;
}): Promise<NextResponse | null> {
  const result = await recordUsage(input);

  if (result.status !== "blocked") {
    return null;
  }

  return apiError(result.check.reason, 402, result.check);
}

