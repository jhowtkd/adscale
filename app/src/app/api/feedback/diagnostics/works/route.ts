import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import { DiagnosticJournalError } from "@/server/diagnostics/journal";
import {
  DiagnosticApiError,
  listDiagnosticWorks,
  withDiagnosticApiCacheHeaders,
} from "@/server/diagnostics/diagnostics-api";

const querySchema = z.object({
  workspaceId: z.string().min(1).max(200).optional(),
  workItemId: z.string().min(1).max(200).optional(),
  from: z.string().min(1).optional(),
  to: z.string().min(1).optional(),
  stage: z.string().min(1).max(64).optional(),
  provider: z.string().min(1).max(200).optional(),
  model: z.string().min(1).max(200).optional(),
  state: z.string().min(1).max(32).optional(),
  sort: z.string().min(1).max(16).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().optional(),
});

export async function GET(request: Request) {
  try {
    await requirePlatformOwner(request);
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      workspaceId: searchParams.get("workspaceId") ?? undefined,
      workItemId: searchParams.get("workItemId") ?? undefined,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      stage: searchParams.get("stage") ?? undefined,
      provider: searchParams.get("provider") ?? undefined,
      model: searchParams.get("model") ?? undefined,
      state: searchParams.get("state") ?? undefined,
      sort: searchParams.get("sort") ?? undefined,
      cursor: searchParams.get("cursor") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    if (!parsed.success) {
      return withDiagnosticApiCacheHeaders(
        await apiError("validation_error", 400, parsed.error.flatten()),
      );
    }

    const result = await listDiagnosticWorks(parsed.data);
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
      await handleApiError(error, "feedback.diagnostics.works.GET"),
    );
  }
}
