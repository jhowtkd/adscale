import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  BrandKitAmbiguityError,
  BrandKitProfileNotFoundError,
  getBrandKit,
  getBrandKitByWorkspace,
  upsertBrandKit,
  deleteBrandKit,
} from "@/server/db/repositories/brand-kit";
import { deleteObject } from "@/server/storage/r2";
import { getPublicUrl } from "@/server/storage/r2";
import { isWorkspaceAssetKey } from "@/server/repositories/asset";

const brandKitSchema = z.object({
  clientProfileId: z.string().uuid().optional(),
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

function readClientProfileId(request: Request) {
  return new URL(request.url).searchParams.get("clientProfileId");
}

function handleBrandKitError(error: unknown) {
  if (error instanceof BrandKitAmbiguityError) {
    return apiError("brandKitAmbiguous", 409, {
      detail: error.message,
    });
  }
  if (error instanceof BrandKitProfileNotFoundError) {
    return apiError("clientProfileNotFound", 404, {
      detail: error.message,
    });
  }
  return null;
}

export async function GET(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const clientProfileId = readClientProfileId(request);
    const brandKit = clientProfileId
      ? await getBrandKit(workspace.id, clientProfileId)
      : await getBrandKitByWorkspace(workspace.id);

    if (!brandKit && !clientProfileId) {
      const profiles = await import("@/server/repositories/client-reference").then((mod) =>
        mod.getClientProfiles(workspace.id)
      );
      if (profiles.length > 1) {
        return apiError("brandKitAmbiguous", 409, {
          detail: "Multiple client profiles exist; clientProfileId is required",
        });
      }
    }

    return NextResponse.json({
      brandKit,
      logoUrl: brandKit?.logoAssetKey ? getPublicUrl(brandKit.logoAssetKey) : null,
    });
  } catch (error) {
    const brandKitError = handleBrandKitError(error);
    if (brandKitError) return brandKitError;
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

    const { clientProfileId, ...brandKitData } = parsed.data;
    const brandKit = await upsertBrandKit(workspace.id, brandKitData, clientProfileId);
    return NextResponse.json({
      brandKit,
      logoUrl: brandKit.logoAssetKey ? getPublicUrl(brandKit.logoAssetKey) : null,
    });
  } catch (error) {
    const brandKitError = handleBrandKitError(error);
    if (brandKitError) return brandKitError;
    return handleApiError(error, "workspace.brand-kit.POST");
  }
}

export async function DELETE(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const clientProfileId = readClientProfileId(request);

    const existing = clientProfileId
      ? await getBrandKit(workspace.id, clientProfileId)
      : await getBrandKitByWorkspace(workspace.id);

    if (!existing && !clientProfileId) {
      const profiles = await import("@/server/repositories/client-reference").then((mod) =>
        mod.getClientProfiles(workspace.id)
      );
      if (profiles.length > 1) {
        return apiError("brandKitAmbiguous", 409, {
          detail: "Multiple client profiles exist; clientProfileId is required",
        });
      }
    }

    if (existing?.logoAssetKey) {
      try {
        await deleteObject(existing.logoAssetKey);
      } catch {
        // Ignore R2 deletion errors (file may already be gone)
      }
    }

    const brandKit = await deleteBrandKit(workspace.id, clientProfileId);
    return NextResponse.json({
      brandKit,
      logoUrl: null,
    });
  } catch (error) {
    const brandKitError = handleBrandKitError(error);
    if (brandKitError) return brandKitError;
    return handleApiError(error, "workspace.brand-kit.DELETE");
  }
}
