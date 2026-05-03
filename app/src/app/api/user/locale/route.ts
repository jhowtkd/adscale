import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { isValidLocale } from "@/i18n/config";
import { getSessionFromHeaders } from "@/server/auth/session";

const updateLocaleSchema = z.object({
  locale: z.string(),
});

export async function POST(request: Request) {
  try {
    const session = await getSessionFromHeaders(request.headers);
    if (!session) {
      return apiError("unauthorized", 401);
    }

    const body = await request.json();
    const parsed = updateLocaleSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidRequestBody", 400, parsed.error.flatten());
    }

    const { locale } = parsed.data;
    if (!isValidLocale(locale)) {
      return apiError("invalidLocale", 400);
    }

    await db
      .update(user)
      .set({ locale, updatedAt: new Date() })
      .where(eq(user.id, session.user.id));

    return NextResponse.json({ success: true, locale });
  } catch (error) {
    return handleApiError(error, "user.locale.POST");
  }
}
