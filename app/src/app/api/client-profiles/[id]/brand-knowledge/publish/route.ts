import { NextResponse } from "next/server";

import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { BrandKnowledgeCompilationError } from "@/server/brand-knowledge/version-compiler";
import {
  BrandKnowledgeEvidenceError,
  publishBrandKnowledgeVersion,
} from "@/server/repositories/brand-knowledge";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [{ user, workspace }, { id }] = await Promise.all([requireWorkspaceAccess(request), params]);
    const version = await publishBrandKnowledgeVersion({
      workspaceId: workspace.id,
      clientProfileId: id,
      userId: user.id,
    });
    return NextResponse.json({ version }, { status: 201 });
  } catch (error) {
    if (error instanceof BrandKnowledgeCompilationError || error instanceof BrandKnowledgeEvidenceError) {
      return apiError("invalidInput", 409, { detail: error.message });
    }
    return handleApiError(error, "client-profiles.[id].brand-knowledge.publish.POST");
  }
}
