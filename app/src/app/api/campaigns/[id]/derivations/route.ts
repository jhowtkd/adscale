import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-response";
import { eq, and, sql } from "drizzle-orm";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getCampaignById } from "@/server/repositories/campaign";
import { getPlanByCampaign } from "@/server/repositories/plan";
import {
  createDerivation,
  getDerivationsByCampaign,
} from "@/server/repositories/derivation";
import { inngest } from "@/server/jobs/client";
import { db } from "@/server/db";
import { derivations } from "@/server/db/schema";
import { getUserLocale } from "@/server/repositories/user";
import { env } from "@/server/validation/env";

const createDerivationsSchema = z.object({
  count: z.number().min(1).max(20).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);
    const locale = await getUserLocale(user.id);
    const { id: campaignId } = await params;

    const campaign = await getCampaignById(campaignId, workspace.id);
    if (!campaign) {
      return apiError("campaignNotFound", 404);
    }

    const body = await request.json();
    const parsed = createDerivationsSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidRequestBody", 400, parsed.error.flatten());
    }
    const count = parsed.data.count ?? 1;

    const plan = await getPlanByCampaign(campaignId, workspace.id);

    // Rate limit: block if there are already queued/processing derivations
    const existingQueued = await db.select({ id: derivations.id })
      .from(derivations)
      .where(
        and(
          eq(derivations.campaignId, campaignId),
          eq(derivations.workspaceId, workspace.id),
          sql`${derivations.status} IN ('queued', 'processing')`
        )
      )
      .limit(1);
    if (existingQueued.length > 0) {
      return apiError("derivationsInProgress", 429);
    }

    const created: Awaited<ReturnType<typeof createDerivation>>[] = [];

    for (let i = 0; i < count; i++) {
      const derivation = await createDerivation({
        campaignId,
        workspaceId: workspace.id,
        planId: plan?.id ?? undefined,
        status: "queued",
      });
      created.push(derivation);
      console.log(`[derivations POST] created derivationId=${derivation.id}`);

      try {
        await inngest.send({
          name: "derivation.generate",
          data: {
            derivationId: derivation.id,
            campaignId,
            workspaceId: workspace.id,
            locale: (user as { locale?: string }).locale,
          },
        });
        console.log(`[derivations POST] event sent derivationId=${derivation.id}`);
      } catch (sendErr) {
        console.error(`[derivations POST] event send FAILED derivationId=${derivation.id}`, sendErr);
        throw sendErr;
      }
    }

    return NextResponse.json({ derivations: created }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return apiError("unauthorized", 401);
    }
    if (error instanceof Error && error.message === "No workspace") {
      return apiError("noWorkspace", 403);
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const { id: campaignId } = await params;

    const items = await getDerivationsByCampaign(campaignId, workspace.id);
    const derivationsWithImageUrl = items.map((d) => ({
      ...d,
      imageUrl: d.outputKey ? `${env.R2_PUBLIC_BASE_URL}/${d.outputKey}` : null,
    }));
    return NextResponse.json({ derivations: derivationsWithImageUrl });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return apiError("unauthorized", 401);
    }
    if (error instanceof Error && error.message === "No workspace") {
      return apiError("noWorkspace", 403);
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
