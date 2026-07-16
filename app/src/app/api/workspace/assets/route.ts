import { NextResponse } from "next/server";
import { isAllowedImageType, validateImageMagicBytes, sanitizeStorageFilename } from "@/lib/upload-config";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { createWorkspaceAsset, deleteWorkspaceAsset, getWorkspaceAssets, getWorkspaceAssetsCount } from "@/server/repositories/workspace-asset";
import { objectStorage } from "@/server/storage";
import { inngest } from "@/server/jobs/client";

const MAX_SIZE = 50 * 1024 * 1024;

const uploadSchema = z.object({
  width: z.preprocess(
    (v) => (v === null || v === "" || v === undefined ? undefined : v),
    z.coerce.number().int().positive().optional()
  ),
  height: z.preprocess(
    (v) => (v === null || v === "" || v === undefined ? undefined : v),
    z.coerce.number().int().positive().optional()
  ),
});

export async function POST(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);

    const contentLengthHeader = request.headers.get("content-length");
    if (contentLengthHeader) {
      const contentLength = parseInt(contentLengthHeader, 10);
      if (!isNaN(contentLength) && contentLength > MAX_SIZE) {
        return apiError("fileTooLarge", 400);
      }
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return apiError("invalidInput", 400);
    }

    if (!isAllowedImageType(file.type)) {
      return apiError("invalidFileType", 400);
    }

    if (!(await validateImageMagicBytes(file, file.type))) {
      return apiError("invalidFileType", 400);
    }

    if (file.size <= 0 || file.size > MAX_SIZE) {
      return apiError("fileTooLarge", 400);
    }

    const parsed = uploadSchema.safeParse({
      width: formData.get("width"),
      height: formData.get("height"),
    });

    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const safeName = sanitizeStorageFilename(file.name);
    const key = `workspaces/${workspace.id}/assets/${crypto.randomUUID()}-${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    let createdAsset: Awaited<ReturnType<typeof createWorkspaceAsset>> | null = null;
    const [asset] = await Promise.all([
      createWorkspaceAsset({
        workspaceId: workspace.id,
        name: file.name,
        key,
        type: file.type,
        size: file.size,
        width: parsed.data.width,
        height: parsed.data.height,
      }).then((asset) => {
        createdAsset = asset;
        return asset;
      }),
      objectStorage.put(key, buffer, file.type),
    ]).catch(async (error) => {
      if (createdAsset) {
        await deleteWorkspaceAsset(createdAsset.id, workspace.id).catch(() => null);
      }
      throw error;
    });

    // Trigger async AI analysis
    await inngest.send({
      name: "workspace.asset.analyze",
      data: { assetId: asset.id, workspaceId: workspace.id, key },
    });

    return NextResponse.json(
      {
        asset: {
          ...asset,
          // Authenticated proxy — private creative_work keys are not on R2 public CDN.
          url: `/api/workspace/assets/${asset.id}/file`,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error, "workspace.assets.POST");
  }
}

const listSchema = z.object({
  q: z.string().optional(),
  tags: z.string().optional(),
  type: z.string().optional(),
  source: z.string().optional(),
  page: z.preprocess((v) => (v === null || v === "" ? undefined : v), z.coerce.number().int().positive().optional()),
  limit: z.preprocess((v) => (v === null || v === "" ? undefined : v), z.coerce.number().int().positive().max(200).optional()),
});

export async function GET(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const { searchParams } = new URL(request.url);

    const parsed = listSchema.safeParse({
      q: searchParams.get("q") ?? undefined,
      tags: searchParams.get("tags") ?? undefined,
      type: searchParams.get("type") ?? undefined,
      source: searchParams.get("source") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const limit = parsed.data.limit ?? 24;
    const page = parsed.data.page ?? 1;
    const offset = (page - 1) * limit;

    const filters = {
      query: parsed.data.q,
      tags: parsed.data.tags ? parsed.data.tags.split(",") : undefined,
      type: parsed.data.type,
      source: parsed.data.source,
    };

    const [assets, total] = await Promise.all([
      getWorkspaceAssets(workspace.id, { ...filters, limit, offset }),
      getWorkspaceAssetsCount(workspace.id, filters),
    ]);

    // Use app-auth file proxy so creative_work outputs (and any private key)
    // render in the library after "Salvar na biblioteca". publicUrl fails for
    // non-public R2 prefixes.
    const assetsWithUrl = assets.map((asset) => ({
      ...asset,
      url: `/api/workspace/assets/${asset.id}/file`,
    }));

    return NextResponse.json({ assets: assetsWithUrl, total });
  } catch (error) {
    return handleApiError(error, "workspace.assets.GET");
  }
}
