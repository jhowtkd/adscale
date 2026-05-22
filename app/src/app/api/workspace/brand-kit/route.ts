import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  getBrandKitByWorkspace,
  upsertBrandKit,
  deleteBrandKit,
} from "@/server/db/repositories/brand-kit";
import { deleteObject } from "@/server/storage/r2";
import { getPublicUrl } from "@/server/storage/r2";
import { isWorkspaceAssetKey } from "@/server/repositories/asset";

const brandKitSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).optional(),
  visualNotes: z.string().trim().max(1000).optional(),
  toneNotes: z.string().trim().max(1000).optional(),
  constraints: z.string().trim().max(1000).optional(),
  brandColors: z.array(z.string().regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/)).max(50).optional(),
  brandFonts: z.array(z.string().trim().min(1)).max(50).optional(),
  logoAssetKey: z.string().trim().min(1).optional().nullable(),
  toneOfVoice: z.string().trim().max(1000).optional(),
  prohibitedElements: z.string().trim().max(1000).optional(),
  requiredElements: z.string().trim().max(1000).optional(),
});

export async function GET(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const brandKit = await getBrandKitByWorkspace(workspace.id);
    return NextResponse.json({
      brandKit,
      logoUrl: brandKit?.logoAssetKey ? getPublicUrl(brandKit.logoAssetKey) : null,
    });
  } catch (error) {
    return handleApiError(error, "workspace.brand-kit.GET");
  }
}

export async function POST(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const body = await request.json();
    const parsed = brandKitSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    if (parsed.data.logoAssetKey) {
      const valid = await isWorkspaceAssetKey(workspace.id, parsed.data.logoAssetKey);
      if (!valid) {
        return apiError("invalidInput", 400, {
          detail: "logoAssetKey does not belong to this workspace",
        });
      }
    }

    const brandKit = await upsertBrandKit(workspace.id, parsed.data);
    return NextResponse.json({
      brandKit,
      logoUrl: brandKit.logoAssetKey ? getPublicUrl(brandKit.logoAssetKey) : null,
    });
  } catch (error) {
    return handleApiError(error, "workspace.brand-kit.POST");
  }
}

export async function DELETE(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);

    // Delete logo from R2 before clearing brand kit (repo handles client_references)
    const existing = await getBrandKitByWorkspace(workspace.id);
    if (existing?.logoAssetKey) {
      try {
        await deleteObject(existing.logoAssetKey);
      } catch {
        // Ignore R2 deletion errors (file may already be gone)
      }
    }

    const brandKit = await deleteBrandKit(workspace.id);
    return NextResponse.json({
      brandKit,
      logoUrl: null,
    });
  } catch (error) {
    return handleApiError(error, "workspace.brand-kit.DELETE");
  }
}
