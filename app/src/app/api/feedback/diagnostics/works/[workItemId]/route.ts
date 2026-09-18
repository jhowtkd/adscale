import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import { DiagnosticJournalError } from "@/server/diagnostics/journal";
import {
  DiagnosticApiError,
  getWorkDiagnostics,
  withDiagnosticApiCacheHeaders,
  type GetWorkDiagnosticsResult,
} from "@/server/diagnostics/diagnostics-api";

type RouteContext = { params: Promise<{ workItemId: string }> };

const querySchema = z.object({
  workspaceId: z.string().min(1).max(200),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().optional(),
});

export async function GET(request: Request, context: RouteContext) {
  try {
    await requirePlatformOwner(request);
    const { workItemId } = await context.params;
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      workspaceId: searchParams.get("workspaceId") ?? undefined,
      cursor: searchParams.get("cursor") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    if (!parsed.success) {
      return withDiagnosticApiCacheHeaders(
        await apiError("validation_error", 400, parsed.error.flatten()),
      );
    }

    const result = (await getWorkDiagnostics({
      workspaceId: parsed.data.workspaceId,
      workItemId,
      cursor: parsed.data.cursor,
      limit: parsed.data.limit,
    })) as GetWorkDiagnosticsResult;
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
        "feedback.diagnostics.works.[workItemId].GET",
      ),
    );
  }
}
