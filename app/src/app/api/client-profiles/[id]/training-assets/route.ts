import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  createTrainingReference,
  deleteTrainingReference,
  getClientProfile,
  getTrainingReferences,
} from "@/server/repositories/client-reference";
import {
  createWorkspaceAsset,
  deleteWorkspaceAsset,
  getWorkspaceAssetsByKeys,
} from "@/server/repositories/workspace-asset";
import {
  normalizeTrainingUpload,
  sanitizeStorageFilename,
} from "@/server/brand-training/upload";
import { objectStorage } from "@/server/storage";
import { inngest } from "@/server/jobs/client";
import { heavyImageEventName } from "@/server/jobs/heavy-image-events";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const [{ workspace }, { id }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    // Workspace ID is resolved exclusively from the session — never from query.
    void new URL(request.url);

    const profile = await getClientProfile(workspace.id, id);
    if (!profile) {
      return apiError("clientProfileNotFound", 404);
    }

    const references = await getTrainingReferences(workspace.id, id);
    const assets = await getWorkspaceAssetsByKeys(
      workspace.id,
      references.map((reference) => reference.assetKey),
    );
    const assetsByKey = new Map(assets.map((asset) => [asset.key, asset]));
    const enriched = references.flatMap((reference) => {
      const asset = assetsByKey.get(reference.assetKey);
      return asset ? [{
        ...reference,
        asset,
        url: objectStorage.publicUrl(asset.key),
      }] : [];
    });

    return NextResponse.json({
      references: enriched,
    });
  } catch (error) {
    return handleApiError(error, "client-profiles.[id].training-assets.GET");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const [{ workspace }, { id }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const profile = await getClientProfile(workspace.id, id);
    if (!profile) {
      return apiError("clientProfileNotFound", 404);
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return apiError("invalidInput", 400);
    }

    const label = (() => {
      const fromForm = formData.get("label");
      if (typeof fromForm === "string" && fromForm.trim().length > 0) {
        return fromForm.trim().slice(0, 120);
      }
      return file.name || "Reference";
    })();

    let normalized: Awaited<ReturnType<typeof normalizeTrainingUpload>>;
    try {
      normalized = await normalizeTrainingUpload(file);
    } catch (err) {
      const code = err instanceof Error ? err.message : "invalidInput";
      if (code === "invalid_size") return apiError("fileTooLarge", 400);
      if (code === "invalid_type") return apiError("invalidFileType", 400);
      throw err;
    }

    const safeName = sanitizeStorageFilename(
      file.name.replace(/\.[^.]+$/, "") || "reference",
    );
    const key = `workspaces/${workspace.id}/brand-training/${crypto.randomUUID()}-${safeName}.${normalized.extension}`;

    // Upload to object storage first so a storage failure doesn't leave an orphan row.
    await objectStorage.put(key, normalized.buffer, normalized.type);

    let asset: Awaited<ReturnType<typeof createWorkspaceAsset>>;
    try {
      asset = await createWorkspaceAsset({
        workspaceId: workspace.id,
        name: file.name || `${safeName}.${normalized.extension}`,
        key,
        type: normalized.type,
        size: normalized.buffer.byteLength,
        source: "brand_training",
        metadata: {
          hasAlpha: normalized.hasAlpha,
          originalMimeType: file.type,
          sha256: createHash("sha256").update(normalized.buffer).digest("hex"),
        },
      });
    } catch (error) {
      await objectStorage.delete(key).catch(() => null);
      throw error;
    }

    let reference: Awaited<ReturnType<typeof createTrainingReference>>;
    try {
      reference = await createTrainingReference(workspace.id, {
        clientProfileId: id,
        assetKey: key,
        label,
      });
    } catch (error) {
      await deleteWorkspaceAsset(asset.id, workspace.id).catch(() => null);
      await objectStorage.delete(key).catch(() => null);
      throw error;
    }

    try {
      await inngest.send({
        name: heavyImageEventName("brand.training.analyze"),
        data: {
          workspaceId: workspace.id,
          clientProfileId: id,
          referenceId: reference.id,
          assetKey: key,
          mimeType: normalized.type,
          hasAlpha: normalized.hasAlpha,
        },
      });
    } catch (error) {
      await deleteTrainingReference({
        workspaceId: workspace.id,
        clientProfileId: id,
        referenceId: reference.id,
      }).catch(() => null);
      await deleteWorkspaceAsset(asset.id, workspace.id).catch(() => null);
      await objectStorage.delete(key).catch(() => null);
      throw error;
    }

    return NextResponse.json(
      {
        reference: {
          ...reference,
          asset,
          url: objectStorage.publicUrl(key),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error, "client-profiles.[id].training-assets.POST");
  }
}
