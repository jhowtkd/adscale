import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getBrandKnowledgeVersion } from "@/server/repositories/brand-knowledge";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  try {
    const [{ workspace }, { id, versionId }] = await Promise.all([requireWorkspaceAccess(request), params]);
    if (!z.string().uuid().safeParse(id).success || !z.string().uuid().safeParse(versionId).success) {
      return apiError("clientProfileNotFound", 404);
    }
    const version = await getBrandKnowledgeVersion(workspace.id, id, versionId);
    if (!version) return apiError("clientProfileNotFound", 404);
    return NextResponse.json({ version });
  } catch (error) {
    return handleApiError(error, "client-profiles.[id].brand-knowledge.versions.[versionId].GET");
  }
}
