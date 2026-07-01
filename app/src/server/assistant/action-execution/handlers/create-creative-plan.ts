import { z } from "zod";
import { getActionContract } from "@/server/assistant/action-contracts/registry";
import { buildPlanPrompt } from "@/server/ai/prompt-builder";
import { getOpenAI } from "@/server/ai/utils";
import { spendOrApiError } from "@/server/billing/paywall";
import { env } from "@/server/validation/env";
import { createCampaign } from "@/server/repositories/campaign";
import { createPlan } from "@/server/repositories/plan";
import { getClientProfile, getClientReferencesByIds } from "@/server/repositories/client-reference";
import { getWorkspaceAssetById } from "@/server/repositories/workspace-asset";
import { linkThreadToCampaign } from "@/server/repositories/assistant-thread";
import type { ActionExecutionContext } from "../types";
import { AssistantActionExecutionError } from "../types";

const planSchema = z.object({
  strategy: z.string(),
  angles: z.array(z.string()),
  hooks: z.array(z.string()),
  ctas: z.array(z.string()),
});

async function validateReferences(ctx: ActionExecutionContext, ids: string[]) {
  const clientRefs = await getClientReferencesByIds(ctx.workspaceId, ids);
  const validClientIds = new Set(
    clientRefs
      .filter((reference) => reference.clientProfileId === ctx.clientProfileId)
      .map((reference) => reference.id)
  );
  const remaining = ids.filter((id) => !validClientIds.has(id));
  const workspaceAssets = await Promise.all(
    remaining.map((id) => getWorkspaceAssetById(id, ctx.workspaceId))
  );
  const validAssetIds = new Set(workspaceAssets.filter(Boolean).map((asset) => asset!.id));
  if (ids.some((id) => !validClientIds.has(id) && !validAssetIds.has(id))) {
    throw new AssistantActionExecutionError("Visual reference not found", "asset_not_found");
  }
}

export async function executeCreateCreativePlan(ctx: ActionExecutionContext) {
  const contract = getActionContract("create_creative_plan");
  const parsed = contract?.inputSchema.safeParse(ctx.inputSnapshot);
  if (!parsed?.success) {
    throw new AssistantActionExecutionError("Invalid creative plan inputs", "execution_failed");
  }
  const input = parsed.data as {
    productOffer: string;
    audience: string;
    objective: string;
    cta: string;
    platformOrFormat: string;
    constraints: string;
    referenceIds: string[];
  };
  await validateReferences(ctx, input.referenceIds);

  const profile = await getClientProfile(ctx.workspaceId, ctx.clientProfileId);
  if (!profile) {
    throw new AssistantActionExecutionError("Client profile not found", "scope_mismatch");
  }

  const creditError = await spendOrApiError({
    workspaceId: ctx.workspaceId,
    action: "creative_plan",
    idempotencyKey: `assistant-action:${ctx.actionId}:creative_plan`,
    metadata: { actionId: ctx.actionId, clientProfileId: ctx.clientProfileId },
    userId: ctx.userId,
  });
  if (creditError) {
    throw new AssistantActionExecutionError("Insufficient credits", "credit_blocked");
  }

  const now = new Date();
  const prompt = `${buildPlanPrompt(
    {
      id: ctx.actionId,
      workspaceId: ctx.workspaceId,
      name: `${profile.name} — plano criativo`,
      client: profile.name,
      product: input.productOffer,
      objective: input.objective,
      audience: input.audience,
      platforms: [input.platformOrFormat],
      tone: null,
      offer: input.productOffer,
      constraints: input.constraints,
      notes: null,
      clientProfileId: profile.id,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    },
    undefined,
    ctx.locale
  )}\n\nUse ${input.referenceIds.length} validated visual references as auxiliary direction. Preserve CTA exactly: ${input.cta}`;

  const completion = await getOpenAI().chat.completions.create({
    model: env.OPENAI_TEXT_MODEL,
    messages: [{ role: "user", content: prompt }],
    max_completion_tokens: 2048,
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new AssistantActionExecutionError("Plan generation failed", "execution_failed");
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  let planPayload: z.infer<typeof planSchema>;
  try {
    planPayload = planSchema.parse(JSON.parse(match ? match[1]!.trim() : raw.trim()));
  } catch {
    throw new AssistantActionExecutionError("Plan generation returned invalid data", "execution_failed");
  }

  const campaign = await createCampaign(ctx.workspaceId, {
    name: `${profile.name} — plano criativo`,
    client: profile.name,
    clientProfileId: profile.id,
    product: input.productOffer,
    offer: input.productOffer,
    objective: input.objective,
    audience: input.audience,
    constraints: input.constraints,
    platforms: [input.platformOrFormat],
    targetFormats: [input.platformOrFormat],
    ctaVariants: [input.cta],
    selectedReferenceIds: input.referenceIds,
    status: "draft",
  });
  await createPlan(campaign.id, ctx.workspaceId, planPayload);
  await linkThreadToCampaign(ctx.workspaceId, ctx.threadId, campaign.id);

  return {
    mode: "sync" as const,
    resultSummary: "Plano criativo criado e vinculado à campanha.",
    campaignId: campaign.id,
  };
}
