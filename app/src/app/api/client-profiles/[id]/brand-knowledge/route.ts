import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { findBrandKnowledgeConflicts } from "@/server/brand-knowledge/comparators";
import { brandKnowledgeJsonValueSchema } from "@/server/brand-knowledge/contracts";
import {
  listBrandKnowledgeClaims,
  listBrandKnowledgeVersions,
  reviewBrandKnowledgeClaim,
} from "@/server/repositories/brand-knowledge";
import { getClientProfile } from "@/server/repositories/client-reference";

const reviewSchema = z.object({
  claimId: z.string().min(1),
  status: z.enum(["approved", "rejected"]),
  value: brandKnowledgeJsonValueSchema.optional(),
  alternatives: z.array(z.object({ claimId: z.string().min(1), value: brandKnowledgeJsonValueSchema })).max(20).optional(),
});

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
    const parsed = reviewSchema.safeParse(body);
    if (!parsed.success) return apiError("invalidInput", 400, parsed.error.flatten());
    const claim = await reviewBrandKnowledgeClaim({
      workspaceId: workspace.id,
      clientProfileId: id,
      claimId: parsed.data.claimId,
      userId: user.id,
      status: parsed.data.status,
      ...(parsed.data.value === undefined ? {} : { value: parsed.data.value }),
      alternatives: parsed.data.alternatives,
    });
    if (!claim) return apiError("clientProfileNotFound", 404);
    const claims = await listBrandKnowledgeClaims(workspace.id, id);
    return NextResponse.json({ claim, conflicts: findBrandKnowledgeConflicts(claims) });
  } catch (error) {
    return handleApiError(error, "client-profiles.[id].brand-knowledge.PATCH");
  }
}
