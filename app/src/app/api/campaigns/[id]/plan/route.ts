import { NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getCampaignById } from "@/server/repositories/campaign";
import { getAssetsByCampaign } from "@/server/repositories/asset";
import {
  createPlan,
  getPlanByCampaign,
  updatePlanStatus,
} from "@/server/repositories/plan";
import { getUserLocale } from "@/server/repositories/user";
import { buildPlanPrompt } from "@/server/ai/prompt-builder";
import { env } from "@/server/validation/env";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const planSchema = z.object({
  strategy: z.string(),
  angles: z.array(z.string()),
  hooks: z.array(z.string()),
  ctas: z.array(z.string()),
});

const updatePlanSchema = z.object({
  status: z.enum(["approved", "rejected"]),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const { id: campaignId } = await params;

    const plan = await getPlanByCampaign(campaignId, workspace.id);
    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    return NextResponse.json({ plan });
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);
    const { id: campaignId } = await params;

    const campaign = await getCampaignById(campaignId, workspace.id);
    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    const assets = await getAssetsByCampaign(campaignId, workspace.id);
    const asset = assets[0];

    const prompt = buildPlanPrompt(campaign, asset, (user as { locale?: string }).locale);

    const completion = await openai.chat.completions.create({
      model: env.OPENAI_TEXT_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 2048,
    });

    const rawContent = completion.choices[0]?.message?.content;
    if (!rawContent) {
      return NextResponse.json(
        { error: "Empty response from AI" },
        { status: 502 }
      );
    }

    // Extract JSON from potential markdown code block
    const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonString = jsonMatch ? jsonMatch[1].trim() : rawContent.trim();

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(jsonString);
    } catch {
      console.error("Invalid JSON from AI:", rawContent);
      return NextResponse.json(
        { error: "Invalid JSON from AI" },
        { status: 502 }
      );
    }

    const validated = planSchema.safeParse(parsedJson);
    if (!validated.success) {
      return NextResponse.json(
        { error: "AI response validation failed", issues: validated.error.flatten() },
        { status: 502 }
      );
    }

    const plan = await createPlan(campaignId, workspace.id, validated.data);

    return NextResponse.json({ plan }, { status: 201 });
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const { id: campaignId } = await params;

    const body = await request.json();
    const parsed = updatePlanSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const plan = await getPlanByCampaign(campaignId, workspace.id);
    if (!plan) {
      return NextResponse.json(
        { error: "Plan not found" },
        { status: 404 }
      );
    }

    const updated = await updatePlanStatus(plan.id, workspace.id, parsed.data.status);

    return NextResponse.json({ plan: updated });
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
