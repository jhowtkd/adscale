import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  addBrandFontAsset,
  getClientProfile,
} from "@/server/repositories/client-reference";
import {
  createWorkspaceAsset,
  deleteWorkspaceAsset,
} from "@/server/repositories/workspace-asset";
import {
  normalizeBrandFontUpload,
  type BrandFontAsset,
} from "@/server/brand-training/font-assets";
import { sanitizeStorageFilename } from "@/server/brand-training/upload";
import { objectStorage } from "@/server/storage";

const FONT_WEIGHTS = new Set([100, 200, 300, 400, 500, 600, 700, 800, 900]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const [{ workspace }, { id }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    const profile = await getClientProfile(workspace.id, id);
    if (!profile) return apiError("clientProfileNotFound", 404);
    return NextResponse.json({ fonts: profile.brandFontAssets ?? [] });
  } catch (error) {
    return handleApiError(error, "client-profiles.[id].brand-fonts.GET");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const [{ workspace, user }, { id }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    const profile = await getClientProfile(workspace.id, id);
    if (!profile) return apiError("clientProfileNotFound", 404);

    const form = await request.formData();
    const file = form.get("file");
    const family = typeof form.get("family") === "string" ? String(form.get("family")).trim() : "";
    const weight = Number(form.get("weight"));
    const style = form.get("style");
    if (
      !(file instanceof File) ||
      family.length === 0 || family.length > 100 ||
      !FONT_WEIGHTS.has(weight) ||
      (style !== "normal" && style !== "italic") ||
      form.get("rightsConfirmed") !== "true"
    ) {
      return apiError("invalidInput", 400);
    }

    let normalized: Awaited<ReturnType<typeof normalizeBrandFontUpload>>;
    try {
      normalized = await normalizeBrandFontUpload(file);
    } catch (error) {
      const code = error instanceof Error ? error.message : "invalidInput";
      if (code === "invalid_size") return apiError("fileTooLarge", 400);
      if (code === "invalid_type" || code === "invalid_font") return apiError("invalidFileType", 400);
      throw error;
    }

    const safeName = sanitizeStorageFilename(file.name.replace(/\.[^.]+$/, "") || "font");
    const key = `workspaces/${workspace.id}/brand-fonts/${crypto.randomUUID()}-${safeName}.${normalized.extension}`;
    await objectStorage.put(key, normalized.buffer, normalized.mimeType);

    let asset: Awaited<ReturnType<typeof createWorkspaceAsset>>;
    try {
      asset = await createWorkspaceAsset({
        workspaceId: workspace.id,
        name: file.name,
        key,
        type: normalized.mimeType,
        size: normalized.buffer.byteLength,
        source: "brand_font",
        metadata: { clientProfileId: id, family, weight, style, sha256: normalized.sha256, rightsConfirmed: true },
      });
    } catch (error) {
      await objectStorage.delete(key).catch(() => null);
      throw error;
    }

    const font: BrandFontAsset = {
      assetKey: key,
      family,
      weight: weight as BrandFontAsset["weight"],
      style,
      sha256: normalized.sha256,
      approvedAt: new Date().toISOString(),
      approvedByUserId: user.id,
    };
    try {
      const persisted = await addBrandFontAsset(workspace.id, id, font);
      if (!persisted) {
        await deleteWorkspaceAsset(asset.id, workspace.id).catch(() => null);
        await objectStorage.delete(key).catch(() => null);
        return apiError("invalidInput", 409);
      }
      return NextResponse.json({ font: persisted }, { status: 201 });
    } catch (error) {
      await deleteWorkspaceAsset(asset.id, workspace.id).catch(() => null);
      await objectStorage.delete(key).catch(() => null);
      throw error;
    }
  } catch (error) {
    return handleApiError(error, "client-profiles.[id].brand-fonts.POST");
  }
}
