import { auth } from "@/server/auth";
import { BetaRedeemError, redeemBetaAccess } from "@/server/billing/beta";
import { getWorkspaceForUser } from "@/server/repositories/workspace";
import { db } from "@/server/db";
import * as schema from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

async function getSessionUser(headers: Headers) {
  const session = await auth.api.getSession({ headers });
  return session?.user ?? null;
}

export async function GET(request: Request) {
  const user = await getSessionUser(request.headers);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select({ onboardingCompletedAt: schema.user.onboardingCompletedAt })
    .from(schema.user)
    .where(eq(schema.user.id, user.id))
    .limit(1);

  return NextResponse.json({
    completed: !!rows[0]?.onboardingCompletedAt,
  });
}

const onboardingBodySchema = z.object({
  betaCode: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  const user = await getSessionUser(request.headers);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = onboardingBodySchema.safeParse(
    await request.json().catch(() => ({}))
  );
  const betaCode = body.success ? body.data.betaCode : undefined;

  let betaRedeemError: { code: string; message: string } | null = null;
  if (betaCode) {
    const workspace = await getWorkspaceForUser(user.id);
    if (workspace) {
      try {
        await redeemBetaAccess({
          workspaceId: workspace.id,
          userId: user.id,
          code: betaCode,
        });
      } catch (error) {
        if (error instanceof BetaRedeemError) {
          betaRedeemError = { code: error.code, message: error.message };
        } else {
          throw error;
        }
      }
    }
  }

  await db
    .update(schema.user)
    .set({ onboardingCompletedAt: new Date() })
    .where(eq(schema.user.id, user.id));

  return NextResponse.json({ success: true, betaRedeemError });
}
