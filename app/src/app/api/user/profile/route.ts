import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { getSessionFromHeaders } from "@/server/auth/session";
import {
  getUserProfile,
  toUserProfileResponse,
  updateUserProfile,
} from "@/server/repositories/user-profile";

const patchProfileSchema = z
  .object({
    firstName: z.string().max(60).optional(),
    lastName: z.string().max(60).optional(),
    bio: z.string().max(500).optional(),
    timezone: z.string().max(80).optional(),
  })
  .strict();

export async function GET(request: Request) {
  try {
    const session = await getSessionFromHeaders(request.headers);
    if (!session) {
      return apiError("unauthorized", 401);
    }

    const row = await getUserProfile(session.user.id);
    if (!row) {
      return apiError("notFound", 404);
    }

    return NextResponse.json(
      toUserProfileResponse(row, session.user.email)
    );
  } catch (error) {
    return handleApiError(error, "user.profile.GET");
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getSessionFromHeaders(request.headers);
    if (!session) {
      return apiError("unauthorized", 401);
    }

    const body = await request.json();
    const parsed = patchProfileSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidRequestBody", 400, parsed.error.flatten());
    }

    const updated = await updateUserProfile(session.user.id, parsed.data);

    return NextResponse.json(
      toUserProfileResponse(updated, session.user.email)
    );
  } catch (error) {
    return handleApiError(error, "user.profile.PATCH");
  }
}
