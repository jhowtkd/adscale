import { NextResponse } from "next/server";
import { ALLOWED_IMAGE_TYPES, isAllowedImageType } from "@/lib/upload-config";
import { apiError, handleApiError } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/with-rate-limit";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { extractBrandKitFromImage } from "@/server/ai/brand-kit-extractor";
import { spendCreditsOrApiError } from "@/server/billing/gates";

const MAX_SIZE = 10 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);

    const rateLimitResult = await checkRateLimit(request, {
      category: "ai",
      workspaceId: workspace.id,
    });
    if (rateLimitResult) return rateLimitResult;

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

    if (file.size <= 0 || file.size > MAX_SIZE) {
      return apiError("fileTooLarge", 400);
    }

    const creditError = await spendCreditsOrApiError({
      workspaceId: workspace.id,
      action: "creative_qa",
      amount: 1,
      idempotencyKey: `brand-kit-extract:${workspace.id}:${file.name}:${file.size}`,
      metadata: { workspaceId: workspace.id },
    });
    if (creditError) return creditError;

    const buffer = Buffer.from(await file.arrayBuffer());
    const extracted = await extractBrandKitFromImage(buffer, file.type);

    return NextResponse.json({ extracted });
  } catch (error) {
    return handleApiError(error, "workspace.brand-kit.extract.POST");
  }
}
