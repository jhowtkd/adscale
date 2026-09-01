import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/with-rate-limit";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  entryRequestBodySchema,
  synthesizeStudioEntryRequest,
} from "@/server/application/synthesize-studio-entry-request";

export async function POST(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const rateLimitResult = await checkRateLimit(request, { category: "ai", workspaceId: workspace.id });
    if (rateLimitResult) return rateLimitResult;

    const parsed = entryRequestBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const result = await synthesizeStudioEntryRequest({
      workspaceId: workspace.id,
      facts: parsed.data.facts,
      chips: parsed.data.chips,
      locale: parsed.data.locale,
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, "creative-work.entry-request.POST");
  }
}
