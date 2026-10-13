import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import { acceptClientLearningProposal, ClientLearningProposalError } from "@/server/human-quality/learning/proposals";
import { approveLearningProposal, editLearningProposal, GuidanceProposalError } from "@/server/human-quality/learning/proposal-approval";
import { expectedProposalRevisionSchema, proposalMetadataInputSchema } from "@/server/brand-taste/proposal-review";

const decisionSchema = z.object({
  kind: z.enum(["corpus_quality", "rule"]).default("corpus_quality"),
  expectedRevision: expectedProposalRevisionSchema,
  acknowledgeFixtureOnly: z.boolean().optional(), acknowledgeCaveats: z.boolean().optional(),
}).strict();
const editSchema = z.object({
  kind: z.enum(["corpus_quality", "rule"]).default("corpus_quality"),
  expectedRevision: expectedProposalRevisionSchema,
  text: z.string().min(1), metadata: proposalMetadataInputSchema,
}).strict();

function errorResponse(error: unknown, method: string) {
  if (error instanceof GuidanceProposalError) {
    return NextResponse.json({ error: error.code, message: error.message, ...(error.current ? { current: error.current } : {}) },
      { status: error.code === "revision_conflict" ? 409 : error.code === "forbidden" ? 403 : error.code === "not_proposed" ? 404 : 422 });
  }
  if (error instanceof ClientLearningProposalError) return apiError(error.code, error.code === "not_proposed" ? 404 : 422);
  if (error instanceof SyntaxError) return apiError("validation_error", 400);
  return handleApiError(error, `admin.quality.learning.proposals.accept.${method}`);
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePlatformOwner(request);
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) return apiError("validation_error", 400);
    const parsed = decisionSchema.safeParse(await request.json());
    if (!parsed.success) return apiError("validation_error", 400);
    const { kind, ...data } = parsed.data;
    const input = { proposalId: id, reviewerUserId: user.id, ...data };
    const result = kind === "rule" ? await approveLearningProposal({ ...input, kind }) : await acceptClientLearningProposal({ ...input, acknowledgeFixtureOnly: data.acknowledgeFixtureOnly ?? false });
    return NextResponse.json(result);
  } catch (error) { return errorResponse(error, "POST"); }
}
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePlatformOwner(request);
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) return apiError("validation_error", 400);
    const parsed = editSchema.safeParse(await request.json());
    if (!parsed.success) return apiError("validation_error", 400);
    const proposal = await editLearningProposal({ proposalId: id, reviewerUserId: user.id, ...parsed.data });
    return NextResponse.json({ proposal });
  } catch (error) { return errorResponse(error, "PATCH"); }
}
