import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import { DiagnosticJournalError } from "@/server/diagnostics/journal";
import {
  DIAGNOSTIC_CONTENT_REASON_MAX_LENGTH,
  DiagnosticApiError,
  getDiagnosticCall,
  withDiagnosticApiCacheHeaders,
  type GetDiagnosticCallResult,
} from "@/server/diagnostics/diagnostics-api";

type RouteContext = { params: Promise<{ workItemId: string; callId: string }> };

const querySchema = z.object({
  workspaceId: z.string().min(1).max(200),
  reason: z.string().min(1).max(DIAGNOSTIC_CONTENT_REASON_MAX_LENGTH),
});

export async function GET(request: Request, context: RouteContext) {
  try {
    const { user } = await requirePlatformOwner(request);
    const { workItemId, callId } = await context.params;
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      workspaceId: searchParams.get("workspaceId") ?? undefined,
      reason: searchParams.get("reason") ?? undefined,
    });

    if (!parsed.success) {
      return withDiagnosticApiCacheHeaders(
        await apiError("validation_error", 400, parsed.error.flatten()),
      );
    }

    const actorId =
      typeof user?.id === "string" && user.id.length > 0
        ? user.id
        : (user?.email ?? "");
    const result = (await getDiagnosticCall({
      workspaceId: parsed.data.workspaceId,
      workItemId,
      callId,
      actorId,
      reason: parsed.data.reason,
    })) as GetDiagnosticCallResult;
    if (!result.found) {
      return withDiagnosticApiCacheHeaders(await apiError("not_found", 404));
    }
    return withDiagnosticApiCacheHeaders(NextResponse.json(result));
  } catch (error) {
    if (
      error instanceof DiagnosticApiError ||
      error instanceof DiagnosticJournalError
    ) {
      return withDiagnosticApiCacheHeaders(
        await apiError("validation_error", 400),
      );
    }
    return withDiagnosticApiCacheHeaders(
      await handleApiError(
        error,
        "feedback.diagnostics.works.[workItemId].calls.[callId].GET",
      ),
    );
  }
}
