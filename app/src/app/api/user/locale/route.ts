import { NextResponse } from "next/server";
import { z } from "zod";
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = updateLocaleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { locale } = parsed.data;
    if (!isValidLocale(locale)) {
      return NextResponse.json(
        { error: `Invalid locale: ${locale}` },
        { status: 400 }
      );
    }

    await db
      .update(user)
      .set({ locale, updatedAt: new Date() })
      .where(eq(user.id, session.user.id));

    return NextResponse.json({ success: true, locale });
  } catch (error) {
    console.error("[POST /api/user/locale] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
