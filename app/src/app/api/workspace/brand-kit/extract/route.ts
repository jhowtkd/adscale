import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/with-rate-limit";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { extractBrandKitFromImage } from "@/server/ai/brand-kit-extractor";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
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

    if (!ALLOWED_TYPES.includes(file.type as (typeof ALLOWED_TYPES)[number])) {
      return apiError("invalidFileType", 400);
    }

    if (file.size <= 0 || file.size > MAX_SIZE) {
      return apiError("fileTooLarge", 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const extracted = await extractBrandKitFromImage(buffer, file.type);

    return NextResponse.json({ extracted });
  } catch (error) {
    return handleApiError(error, "workspace.brand-kit.extract.POST");
  }
}
