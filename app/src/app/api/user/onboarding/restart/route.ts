import { auth } from "@/server/auth";
import { db } from "@/server/db";
import * as schema from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

async function getSessionUser(headers: Headers) {
  const session = await auth.api.getSession({ headers });
  return session?.user ?? null;
}

export async function POST(request: Request) {
  const user = await getSessionUser(request.headers);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await db
    .update(schema.user)
    .set({ onboardingCompletedAt: null })
    .where(eq(schema.user.id, user.id));

  return NextResponse.json({ success: true });
}
