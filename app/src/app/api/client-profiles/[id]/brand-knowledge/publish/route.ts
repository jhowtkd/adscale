import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { BrandKnowledgeCompilationError } from "@/server/brand-knowledge/version-compiler";
import {
  BrandKnowledgeCalibrationError,
  BrandKnowledgeEvidenceError,
  publishBrandKnowledgeVersion,
} from "@/server/repositories/brand-knowledge";

const publishProofSchema = z
  .object({
    sessionId: z.string().uuid(),
    expectedRevision: z.number().int().nonnegative(),
    candidateHash: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [{ user, workspace }, { id }] = await Promise.all([requireWorkspaceAccess(request), params]);
    // Activation requires the calibration proof: a legacy request without it
    // is refused as calibration_required, never published from live claims.
    const proof = publishProofSchema.safeParse(await request.json().catch(() => null));
    if (!proof.success) return apiError("brandCalibrationRequired", 409, proof.error.flatten());
    const version = await publishBrandKnowledgeVersion({
      workspaceId: workspace.id,
      clientProfileId: id,
      userId: user.id,
      sessionId: proof.data.sessionId,
      expectedRevision: proof.data.expectedRevision,
      candidateHash: proof.data.candidateHash,
    });
    return NextResponse.json({ version }, { status: 201 });
  } catch (error) {
    if (error instanceof BrandKnowledgeCalibrationError) {
      return apiError(
        error.code === "calibration_stale" ? "brandCalibrationStale" : "brandCalibrationRequired",
        409,
        { detail: error.message },
      );
    }
    if (error instanceof BrandKnowledgeCompilationError || error instanceof BrandKnowledgeEvidenceError) {
      return apiError("invalidInput", 409, { detail: error.message });
    }
    return handleApiError(error, "client-profiles.[id].brand-knowledge.publish.POST");
  }
}
