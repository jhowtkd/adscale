import type { NextResponse } from "next/server";

import { apiError } from "@/lib/api-response";
import { type CreditAction, recordUsage } from "./credits";
import { buildConversionErrorPayloadForWorkspace } from "./conversion";

export async function spendCreditsOrApiError(input: {
  workspaceId: string;
  action: CreditAction;
  idempotencyKey: string;
  amount?: number;
  metadata?: Record<string, unknown>;
  userId?: string;
  returnPath?: string;
}): Promise<NextResponse | null> {
  const result = await recordUsage(input);

  if (result.status !== "blocked") {
    return null;
  }

  const payload = await buildConversionErrorPayloadForWorkspace({
    workspaceId: input.workspaceId,
    check: result.check,
    returnPath: input.returnPath,
    operation: input.action,
  });

  return apiError(payload.reason, 402, payload);
}
