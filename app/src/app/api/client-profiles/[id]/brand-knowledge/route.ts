import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  BrandRepertoireError,
  synthesizeBrandRepertoire,
} from "@/server/application/synthesize-brand-repertoire";
import { findBrandKnowledgeConflicts } from "@/server/brand-knowledge/comparators";
import { brandKnowledgeJsonValueSchema } from "@/server/brand-knowledge/contracts";
import { visualRepertoireSchema } from "@/server/brand-training/visual-repertoire";
import {
  RepertoireSelectionRequiredError,
  RepertoireSynthesisError,
} from "@/server/brand-training/synthesize-repertoire";
import {
  BrandKnowledgeCalibrationError,
  BrandKnowledgeConflictError,
  BrandKnowledgeEvidenceError,
  listBrandKnowledgeClaims,
  listBrandKnowledgeVersions,
  reviewBrandKnowledgeClaim,
  reviewRepertoireCollection,
} from "@/server/repositories/brand-knowledge";
import { getClientProfile } from "@/server/repositories/client-reference";

const reviewSchema = z.object({
  claimId: z.string().min(1),
  status: z.enum(["approved", "rejected"]),
  value: brandKnowledgeJsonValueSchema.optional(),
  alternatives: z.array(z.object({ claimId: z.string().min(1), value: brandKnowledgeJsonValueSchema })).max(20).optional(),
});

const reviewRepertoireSchema = z.object({
  command: z.literal("review_repertoire"),
  sessionId: z.string().uuid(),
  expectedRevision: z.number().int().nonnegative(),
  value: visualRepertoireSchema,
}).strict();

const synthesizeRepertoireSchema = z.object({
  command: z.literal("synthesize_repertoire"),
  referenceIds: z.array(z.string().uuid()).max(48).optional(),
  feedback: z.array(z.object({
    outputId: z.string().min(1).max(200),
    rating: z.enum(["good", "bad"]),
    note: z.string().max(2000),
  }).strict()).max(20).optional(),
}).strict();

const patchSchema = z.union([reviewRepertoireSchema, synthesizeRepertoireSchema, reviewSchema]);

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [{ workspace }, { id }] = await Promise.all([requireWorkspaceAccess(request), params]);
    if (!(await getClientProfile(workspace.id, id))) return apiError("clientProfileNotFound", 404);
    const [claims, versions] = await Promise.all([
      listBrandKnowledgeClaims(workspace.id, id),
      listBrandKnowledgeVersions(workspace.id, id),
    ]);
    return NextResponse.json({
      claims,
      conflicts: findBrandKnowledgeConflicts(claims),
      versions,
      activeVersion: versions.find((version) => version.status === "active") ?? null,
    });
  } catch (error) {
    return handleApiError(error, "client-profiles.[id].brand-knowledge.GET");
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [{ user, workspace }, { id }, body] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
      request.json(),
    ]);
    if (!(await getClientProfile(workspace.id, id))) return apiError("clientProfileNotFound", 404);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return apiError("invalidInput", 400, parsed.error.flatten());
    const data = parsed.data;

    if ("command" in data && data.command === "review_repertoire") {
      try {
        const { claim, revision } = await reviewRepertoireCollection({
          workspaceId: workspace.id,
          clientProfileId: id,
          sessionId: data.sessionId,
          expectedRevision: data.expectedRevision,
          value: data.value,
          userId: user.id,
        });
        const claims = await listBrandKnowledgeClaims(workspace.id, id);
        return NextResponse.json({ claim, revision, conflicts: findBrandKnowledgeConflicts(claims) });
      } catch (error) {
        if (error instanceof BrandKnowledgeCalibrationError) {
          if (error.code === "calibration_required") return apiError("brandCalibrationNotFound", 404);
          return apiError("stale_input", 409);
        }
        if (error instanceof BrandKnowledgeConflictError) {
          return apiError("brandKnowledgeConflict", 409, { detail: error.message });
        }
        if (error instanceof BrandKnowledgeEvidenceError) {
          return apiError("invalidInput", 409, { detail: error.message });
        }
        return handleApiError(error, "client-profiles.[id].brand-knowledge.PATCH.review_repertoire");
      }
    }

    if ("command" in data && data.command === "synthesize_repertoire") {
      try {
        const result = await synthesizeBrandRepertoire({
          workspaceId: workspace.id,
          profileId: id,
          ...(data.referenceIds ? { referenceIds: data.referenceIds } : {}),
          ...(data.feedback ? { feedback: data.feedback } : {}),
        });
        return NextResponse.json(result, { status: 201 });
      } catch (error) {
        if (error instanceof BrandRepertoireError) {
          return apiError(error.code, 422, { detail: error.message });
        }
        if (error instanceof RepertoireSelectionRequiredError) {
          return apiError("brandRepertoireSelectionRequired", 409, { detail: error.message });
        }
        if (error instanceof RepertoireSynthesisError) {
          return apiError("brandRepertoireSynthesisFailed", 502, {
            recoverable: error.recoverable,
            detail: error.message,
          });
        }
        if (error instanceof BrandKnowledgeEvidenceError) {
          return apiError("invalidInput", 409, { detail: error.message });
        }
        return handleApiError(error, "client-profiles.[id].brand-knowledge.PATCH.synthesize_repertoire");
      }
    }

    if (!("claimId" in data)) return apiError("invalidInput", 400);
    const claim = await reviewBrandKnowledgeClaim({
      workspaceId: workspace.id,
      clientProfileId: id,
      claimId: data.claimId,
      userId: user.id,
      status: data.status,
      ...(data.value === undefined ? {} : { value: data.value }),
      alternatives: data.alternatives,
    });
    if (!claim) return apiError("clientProfileNotFound", 404);
    const claims = await listBrandKnowledgeClaims(workspace.id, id);
    return NextResponse.json({ claim, conflicts: findBrandKnowledgeConflicts(claims) });
  } catch (error) {
    return handleApiError(error, "client-profiles.[id].brand-knowledge.PATCH");
  }
}
