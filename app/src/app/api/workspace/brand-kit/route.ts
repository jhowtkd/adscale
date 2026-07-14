import { NextResponse } from "next/server";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  BrandKitAmbiguityError,
  BrandKitAvailableWorkspace,
  BrandKitProfileNotFoundError,
  getBrandKit,
  getBrandKitByWorkspace,
  upsertBrandKit,
  deleteBrandKit,
} from "@/server/repositories/brand-kit";
import { getClientProfiles } from "@/server/repositories/client-reference";
import { objectStorage } from "@/server/storage";
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

/**
 * Emits the descriptive 409 shape the frontend uses to render a workspace
 * selector. The response keeps the legacy `error`/`code`/`details` envelope
 * (so older clients still work) but adds a structured `details.availableWorkspaces`
 * array and a stable `code: "workspace_ambiguous"`.
 */
async function ambiguousWorkspaceResponse(
  availableWorkspaces: BrandKitAvailableWorkspace[]
) {
  const t = await getTranslations("errors");
  const message = t("brandKitAmbiguous");
  return NextResponse.json(
    {
      error: message,
      code: "workspace_ambiguous",
      message,
      details: { availableWorkspaces },
    },
    { status: 409 }
  );
}

async function clientProfileNotFoundResponse() {
  const t = await getTranslations("errors");
  const message = t("clientProfileNotFound");
  return NextResponse.json(
    {
      error: message,
      code: "client_profile_not_found",
      message,
      details: {},
    },
    { status: 404 }
  );
}

async function handleBrandKitError(error: unknown) {
  if (error instanceof BrandKitAmbiguityError) {
    return ambiguousWorkspaceResponse(error.availableWorkspaces ?? []);
  }
  if (error instanceof BrandKitProfileNotFoundError) {
    return clientProfileNotFoundResponse();
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
      const profiles = await getClientProfiles(workspace.id);
      if (profiles.length > 1) {
        return ambiguousWorkspaceResponse(
          profiles.map((profile) => ({
            id: profile.id,
            name: profile.name,
          }))
        );
      }
    }

    return NextResponse.json({
      brandKit,
      logoUrl: brandKit?.logoAssetKey ? objectStorage.publicUrl(brandKit.logoAssetKey) : null,
    });
  } catch (error) {
    const brandKitError = await handleBrandKitError(error);
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
      logoUrl: brandKit.logoAssetKey ? objectStorage.publicUrl(brandKit.logoAssetKey) : null,
    });
  } catch (error) {
    const brandKitError = await handleBrandKitError(error);
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
      const profiles = await getClientProfiles(workspace.id);
      if (profiles.length > 1) {
        return ambiguousWorkspaceResponse(
          profiles.map((profile) => ({
            id: profile.id,
            name: profile.name,
          }))
        );
      }
    }

    if (existing?.logoAssetKey) {
      try {
        await objectStorage.delete(existing.logoAssetKey);
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
    const brandKitError = await handleBrandKitError(error);
    if (brandKitError) return brandKitError;
    return handleApiError(error, "workspace.brand-kit.DELETE");
  }
}
