import { NextResponse } from "next/server";
import { z } from "zod";
import JSZip from "jszip";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { rateLimit } from "@/lib/rate-limit";
import { db } from "@/server/db";
import { derivations } from "@/server/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { downloadBuffer } from "@/server/storage/r2";

const bodySchema = z.object({
  derivationIds: z.array(z.string().uuid()).min(1).max(50),
});

export async function POST(request: Request) {
  try {
    const limit = await rateLimit(request, "general");
    if (!limit.success) {
      return apiError("rateLimitExceeded", 429);
    }

    const { workspace } = await requireWorkspaceAccess(request);
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidRequestBody", 400);
    }

    const { derivationIds } = parsed.data;

    const items = await db
      .select()
      .from(derivations)
      .where(
        and(
          eq(derivations.workspaceId, workspace.id),
          eq(derivations.status, "approved"),
          inArray(derivations.id, derivationIds)
        )
      );

    if (items.length === 0) {
      return apiError("nothingToExport", 400);
    }

    const zip = new JSZip();
    let addedFiles = 0;

    for (const d of items) {
      if (!d.outputKey) continue;
      try {
        const buffer = await downloadBuffer(d.outputKey);
        const ext = d.format?.toLowerCase() || "png";
        const fileName = `derivation-${d.id}.${ext}`;
        zip.file(fileName, buffer);
        addedFiles++;
      } catch {
        // skip files that fail to download
      }
    }

    if (addedFiles === 0) {
      return apiError("nothingToExport", 400);
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="adscale-derivations-${Date.now()}.zip"`,
      },
    });
  } catch (error) {
    return handleApiError(error, "export.zip.POST");
  }
}
