import { NextResponse } from "next/server";
import { isAllowedImageType, validateImageMagicBytes } from "@/lib/upload-config";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { createWorkspaceAsset, deleteWorkspaceAsset, getWorkspaceAssets } from "@/server/repositories/workspace-asset";
import { uploadBuffer, getPublicUrl } from "@/server/storage/r2";
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

    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_").replace(/\.{2,}/g, ".");
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
      uploadBuffer(key, buffer, file.type),
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

    return NextResponse.json({ asset }, { status: 201 });
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
  limit: z.preprocess((v) => (v === null || v === "" ? undefined : v), z.coerce.number().int().positive().max(100).optional()),
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

    const assets = await getWorkspaceAssets(workspace.id, {
      query: parsed.data.q,
      tags: parsed.data.tags ? parsed.data.tags.split(",") : undefined,
      type: parsed.data.type,
      source: parsed.data.source,
      limit,
      offset,
    });

    const assetsWithUrl = assets.map((asset) => ({
      ...asset,
      url: getPublicUrl(asset.key),
    }));

    return NextResponse.json({ assets: assetsWithUrl });
  } catch (error) {
    return handleApiError(error, "workspace.assets.GET");
  }
}
