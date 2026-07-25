import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import {
  GuidedFlowStagingValidationError,
  insertGuidedFlowStagingEvidence,
  listGuidedFlowStagingEvidenceForOwner,
  summarizeStagingCoverage,
} from "@/server/repositories/guided-flow-staging-evidence";

const createSchema = z.object({
  workspaceId: z.string().uuid(),
  clientProfileId: z.string().uuid(),
  threadId: z.string().uuid(),
  campaignId: z.string().uuid().nullable().optional(),
  path: z.enum(["existing_creative", "from_zero"]),
  environment: z.string().min(1).max(64),
  checkKey: z.enum(["diagnosis", "briefing", "creative_plan", "approval_lifecycle"]),
  verdict: z.enum(["pass", "fail", "tech_debt"]),
  safeNotes: z.string().max(256).nullable().optional(),
  referenceCounts: z.record(z.number()).optional(),
});

export async function GET(request: Request) {
  try {
    await requirePlatformOwner(request);
    const rows = await listGuidedFlowStagingEvidenceForOwner();
    return NextResponse.json({
      coverage: summarizeStagingCoverage(rows),
      evidence: rows,
    });
  } catch (error) {
    return handleApiError(error, "feedback.guided-flow.staging-evidence.GET");
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await requirePlatformOwner(request);
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const evidence = await insertGuidedFlowStagingEvidence({
      ...parsed.data,
      reviewerUserId: user.id,
      referenceCounts: parsed.data.referenceCounts ?? {},
      campaignId: parsed.data.campaignId ?? null,
      safeNotes: parsed.data.safeNotes ?? null,
    });

    return NextResponse.json({ evidence }, { status: 201 });
  } catch (error) {
    if (error instanceof GuidedFlowStagingValidationError) {
      return apiError("invalidInput", 400, { message: error.message });
    }
    return handleApiError(error, "feedback.guided-flow.staging-evidence.POST");
  }
}
