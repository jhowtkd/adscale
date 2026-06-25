import { NextResponse } from "next/server";
import { isAllowedImageType, validateImageMagicBytes } from "@/lib/upload-config";
import { apiError, handleApiError } from "@/lib/api-response";
import { getSessionFromHeaders } from "@/server/auth/session";
import { updateUserAvatar } from "@/server/repositories/user-profile";
import { uploadBuffer, getPublicUrl } from "@/server/storage/r2";

const MAX_SIZE = 10 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const session = await getSessionFromHeaders(request.headers);
    if (!session) {
      return apiError("unauthorized", 401);
    }

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

    const safeName = file.name
      .replace(/[^a-zA-Z0-9.-]/g, "_")
      .replace(/\.{2,}/g, ".");
    const key = `users/${session.user.id}/avatar/${crypto.randomUUID()}-${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    await uploadBuffer(key, buffer, file.type);

    const avatarUrl = getPublicUrl(key);
    await updateUserAvatar(session.user.id, avatarUrl);

    return NextResponse.json({ avatarUrl });
  } catch (error) {
    return handleApiError(error, "user.profile.avatar.POST");
  }
}
