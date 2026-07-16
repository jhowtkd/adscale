import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { startSocialPostWork } from "@/server/application/start-social-post-work";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { listCanonicalWorks } from "@/server/creative-work/canonical/queries";
import {
  createCreativeWorkSchema,
  creativeWorkFormatSchema,
  creativeWorkIntentSchema,
  creativeWorkPreparationSchema,
  creativeWorkSettingsSchema,
} from "@/server/creative-work/contracts";
import { z } from "zod";

const createDraftSchema = z.object({
  clientProfileId: z.string().uuid(),
  draftKey: z.string().uuid(),
  request: z.string().trim().min(1),
  intent: creativeWorkIntentSchema,
  format: creativeWorkFormatSchema,
  settings: creativeWorkSettingsSchema,
}).strict().superRefine((value, context) => {
  const parsed = creativeWorkPreparationSchema.safeParse(value);
  if (!parsed.success) parsed.error.issues.forEach((issue) => context.addIssue(issue));
});

const createBodySchema = z.union([createDraftSchema, createCreativeWorkSchema]);

/**
 * List workspace canonical works (Phase 5 / item 37 — history on complete).
 */
export async function GET(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const works = await listCanonicalWorks(workspace.id);
    return NextResponse.json({ works });
  } catch (error) {
    return handleApiError(error, "creative-work.GET");
  }
}

/**
 * Criar Post create — HTTP adapter only (Phase 5 / items 34–35).
 * Domain: startSocialPostWork (intent social_post, no campaign).
 */
export async function POST(request: Request) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);

    const parsed = createBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const result = await startSocialPostWork("draftKey" in parsed.data
      ? { workspaceId: workspace.id, userId: user.id, ...parsed.data }
      : {
          workspaceId: workspace.id,
          userId: user.id,
          clientProfileId: parsed.data.clientProfileId,
          format: parsed.data.format,
          brief: parsed.data.brief,
        });

    if (!result.ok) {
      if (result.error.code === "client_profile_not_found") {
        return apiError("clientProfileNotFound", 404);
      }
      return apiError("invalidRequest", 400);
    }

    // `work` kept for existing UI; `canonical` is the Phase 5 contract.
    return NextResponse.json(
      {
        work: result.value.work,
        canonical: result.value.canonical,
        quote: result.value.quote,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error, "creative-work.POST");
  }
}
