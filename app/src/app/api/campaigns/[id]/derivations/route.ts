import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getCampaignById } from "@/server/repositories/campaign";
import { getPlanByCampaign } from "@/server/repositories/plan";
import {
  createDerivation,
  getDerivationsByCampaign,
} from "@/server/repositories/derivation";
import { inngest } from "@/server/jobs/client";

const createDerivationsSchema = z.object({
  count: z.number().min(1).max(20).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const { id: campaignId } = await params;

    const campaign = await getCampaignById(campaignId, workspace.id);
    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const parsed = createDerivationsSchema.safeParse(body);
    const count = parsed.success ? (parsed.data.count ?? 3) : 3;

    const plan = await getPlanByCampaign(campaignId, workspace.id);

    const created: Awaited<ReturnType<typeof createDerivation>>[] = [];

    for (let i = 0; i < count; i++) {
      const derivation = await createDerivation({
        campaignId,
        workspaceId: workspace.id,
        planId: plan?.id ?? undefined,
        status: "queued",
      });
      created.push(derivation);

      await inngest.send({
        name: "derivation.generate",
        data: {
          derivationId: derivation.id,
          campaignId,
          workspaceId: workspace.id,
        },
      });
    }

    return NextResponse.json({ derivations: created }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "No workspace") {
      return NextResponse.json({ error: "No workspace" }, { status: 403 });
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
    return NextResponse.json({ derivations: items });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "No workspace") {
      return NextResponse.json({ error: "No workspace" }, { status: 403 });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
