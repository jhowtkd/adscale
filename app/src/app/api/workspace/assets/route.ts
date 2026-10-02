import { shouldAnalyzeWorkspaceAssets, getHandoffAssetScope, createHandoffWorkspaceAsset } from "@/server/equipe/handoff/assets";
import { getClientProfile } from "@/server/repositories/client-reference";
import { resolveBrandKitProfileId } from "@/server/repositories/brand-kit";
import { NextResponse } from "next/server";
import { isAllowedImageType, validateImageMagicBytes, sanitizeStorageFilename, SVG_LOGO_TYPE } from "@/lib/upload-config";
import { MAX_SVG_BYTES, SvgLogoError, rasterizeSvgLogo } from "@/server/equipe/handoff/svg-logo";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/with-rate-limit";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { createWorkspaceAsset, getWorkspaceAssets, getWorkspaceAssetsCount } from "@/server/repositories/workspace-asset";
import { objectStorage } from "@/server/storage";
import { inngest } from "@/server/jobs/client";
import { heavyImageEventName } from "@/server/jobs/heavy-image-events";

const MAX_SIZE = 10 * 1024 * 1024;

const uploadSchema = z.object({
  clientProfileId: z.preprocess(v => v === null || v === "" ? undefined : v, z.string().uuid().optional()),
  handoffId: z.preprocess(v => v === null || v === "" ? undefined : v, z.string().uuid().optional()),
  /** What the file is for. Only the brand logo of a handoff may be an SVG (it is drawn as a PNG, below). Any other value is no purpose: an upload that sends one is not refused for it, as before this field existed. */
  purpose: z.preprocess(v => v === "logo" ? v : undefined, z.literal("logo").optional()),
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

    // An SVG is a vector file a browser would run: it is taken for one purpose only (the logo of a brand handoff, checked below) and is never stored.
    const svg = file.type === SVG_LOGO_TYPE;
    if (!svg) {
      if (!isAllowedImageType(file.type)) {
        return apiError("invalidFileType", 400);
      }

      if (!(await validateImageMagicBytes(file, file.type))) {
        return apiError("invalidFileType", 400);
      }
    }

    if (file.size <= 0 || file.size > (svg ? MAX_SVG_BYTES : MAX_SIZE)) {
      return apiError("fileTooLarge", 400);
    }

    const parsed = uploadSchema.safeParse({
      clientProfileId: formData.get("clientProfileId"),
      handoffId: formData.get("handoffId"),
      purpose: formData.get("purpose"),
      width: formData.get("width"),
      height: formData.get("height"),
    });

    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }
    if (svg && !(parsed.data.handoffId && parsed.data.purpose === "logo")) return apiError("invalidFileType", 400);

    const handoff = parsed.data.handoffId ? await getHandoffAssetScope(workspace.id, parsed.data.handoffId) : null;
    if (parsed.data.handoffId && (!handoff || parsed.data.clientProfileId)) return apiError("invalidInput", 400);
    const clientProfileId = handoff ? null : await resolveBrandKitProfileId(workspace.id, parsed.data.clientProfileId);
    const analyze = !handoff && await shouldAnalyzeWorkspaceAssets(workspace.id, clientProfileId);
    let buffer: Buffer = Buffer.from(await file.arrayBuffer());
    let stored = { name: file.name, type: file.type, size: file.size, width: parsed.data.width, height: parsed.data.height };
    if (svg) {
      // An SVG is drawn on this server, one at a time: a flood of them is answered with a rate limit (and the drawing queue is bounded) instead of a queue that grows.
      const limited = await checkRateLimit(request, { category: "general", identifier: `svg-logo:${workspace.id}` });
      if (limited) return limited;
      // Sanitized and drawn as a PNG (transparent, at most 1024 px): that PNG is the logo. The SVG itself is dropped here, so no browser is ever served it.
      try {
        const raster = await rasterizeSvgLogo(buffer);
        buffer = raster.png;
        stored = { name: `${file.name.replace(/\.svg$/i, "") || "logo"}.png`, type: "image/png", size: raster.png.length, width: raster.width, height: raster.height };
      } catch (error) {
        if (error instanceof SvgLogoError) return error.code === "svg_busy" ? apiError("rateLimitExceeded", 429) : apiError("svgUnreadable", 400);
        throw error;
      }
    }
    const safeName = sanitizeStorageFilename(stored.name);
    const key = `workspaces/${workspace.id}/assets/${crypto.randomUUID()}-${safeName}`;

    await objectStorage.put(key, buffer, stored.type);
    let asset: Awaited<ReturnType<typeof createWorkspaceAsset>> | null;
    try {
      const input = {
        workspaceId: workspace.id,
        clientProfileId,
        name: stored.name,
        key,
        type: stored.type,
        size: stored.size,
        width: stored.width,
        height: stored.height,
        source: "brand_upload",
        ...(handoff ? { metadata: { handoffId: handoff.id, readingId: handoff.readingId, provisional: true } } : {}),
      };
      asset = handoff ? await createHandoffWorkspaceAsset(input, handoff.id) : await createWorkspaceAsset(input);
    } catch (error) {
      await objectStorage.delete(key).catch(() => null);
      throw error;
    }
    if (!asset) {
      await objectStorage.delete(key);
      return apiError("invalidInput", 400);
    }

    // Free uploads must never bypass the account's AI ledger.
    if (analyze) await inngest.send({
      name: heavyImageEventName("workspace.asset.analyze"),
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

// Every source a producer writes to workspace_assets; any other text is not a filter the Library can have.
const ASSET_SOURCES = ["upload", "brand_upload", "brand_site", "brand_instagram", "brand_training", "brand_font", "curated_inspiration", "curated_inspiration_copy", "creative_work"] as const;

const listSchema = z.object({
  clientProfileId: z.string().uuid().optional(),
  kind: z.enum(["identity", "images", "post", "page"]).optional(),
  q: z.string().optional(),
  tags: z.string().optional(),
  type: z.string().optional(),
  source: z.enum(ASSET_SOURCES).optional(),
  excludeSources: z.string().optional(),
  page: z.preprocess((v) => (v === null || v === "" ? undefined : v), z.coerce.number().int().positive().optional()),
  limit: z.preprocess((v) => (v === null || v === "" ? undefined : v), z.coerce.number().int().positive().max(200).optional()),
});

export async function GET(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const { searchParams } = new URL(request.url);

    const parsed = listSchema.safeParse({
      clientProfileId: searchParams.get("clientProfileId") ?? undefined,
      kind: searchParams.get("kind") ?? undefined,
      q: searchParams.get("q") ?? undefined,
      tags: searchParams.get("tags") ?? undefined,
      type: searchParams.get("type") ?? undefined,
      source: searchParams.get("source") ?? undefined,
      excludeSources: searchParams.get("excludeSources") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const limit = parsed.data.limit ?? 24;
    if (parsed.data.clientProfileId && !await getClientProfile(workspace.id, parsed.data.clientProfileId)) return apiError("clientProfileNotFound", 404);
    const page = parsed.data.page ?? 1;
    const offset = (page - 1) * limit;

    const filters = {
      clientProfileId: parsed.data.clientProfileId,
      kind: parsed.data.kind,
      query: parsed.data.q,
      tags: parsed.data.tags ? parsed.data.tags.split(",") : undefined,
      type: parsed.data.type,
      source: parsed.data.source,
      excludeSources: parsed.data.excludeSources?.split(",").filter(Boolean),
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
