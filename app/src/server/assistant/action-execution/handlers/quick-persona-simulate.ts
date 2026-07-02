import { getActionContract } from "@/server/assistant/action-contracts/registry";
import { simulatePersonas } from "@/server/ai/persona-simulator";
import { recordBrandMemoryEvent } from "@/server/memory/brand-memory-dispatch";
import { getCampaignById } from "@/server/repositories/campaign";
import { getDerivationById } from "@/server/repositories/derivation";
import {
  createPersonaSimulation,
  getPersonaSimulationBySource,
  isCacheValid,
  updatePersonaSimulation,
} from "@/server/repositories/persona-simulation";
import type { ActionExecutionContext } from "../types";
import { AssistantActionExecutionError } from "../types";

const PERSONA_SOURCE_TYPE = "derivation" as const;

/**
 * Mirrors the POST /api/creatives/[id]/persona-simulation flow but is invoked
 * directly by the assistant action executor. The persona simulator service
 * (`simulatePersonas`) is the shared engine between the two entry points.
 */
export async function executeQuickPersonaSimulate(ctx: ActionExecutionContext) {
  const contract = getActionContract("quick_persona_simulate");
  const parsed = contract?.inputSchema.safeParse(ctx.inputSnapshot);
  if (!parsed?.success) {
    throw new AssistantActionExecutionError(
      "Invalid quick_persona_simulate inputs",
      "execution_failed"
    );
  }

  const { baseCreativeId } = parsed.data;

  const derivation = await getDerivationById(baseCreativeId, ctx.workspaceId);
  if (!derivation) {
    throw new AssistantActionExecutionError(
      "Creative not found",
      "derivation_not_found"
    );
  }
  if (derivation.status !== "approved") {
    throw new AssistantActionExecutionError(
      "Creative must be approved before persona simulation",
      "execution_failed"
    );
  }
  if (!derivation.outputKey) {
    throw new AssistantActionExecutionError(
      "Creative has no generated output to simulate",
      "execution_failed"
    );
  }

  const campaign = await getCampaignById(derivation.campaignId, ctx.workspaceId);
  if (!campaign) {
    throw new AssistantActionExecutionError("Campaign not found", "campaign_not_found");
  }

  const cached = await getPersonaSimulationBySource(
    ctx.workspaceId,
    PERSONA_SOURCE_TYPE,
    baseCreativeId
  );
  if (cached && isCacheValid(cached)) {
    return {
      mode: "sync" as const,
      jobRef: {
        kind: "derivation" as const,
        id: derivation.id,
      },
      resultSummary: `Persona simulation reused from cache (${cached.id})`,
    };
  }

  const results = await simulatePersonas({
    campaign: {
      objective: campaign.objective ?? "",
      audience: campaign.audience ?? "",
      offer: campaign.offer ?? "",
      ctaText: campaign.ctaVariants?.[0] ?? null,
      tone: campaign.tone ?? null,
      constraints: campaign.constraints ?? null,
      clientName: campaign.client ?? null,
      productName: campaign.product ?? null,
    },
    creative: {
      type: PERSONA_SOURCE_TYPE,
      description: derivation.prompt ?? "",
    },
    locale: ctx.locale === "en" ? "en" : "pt-BR",
  });

  const simulation = cached
    ? await updatePersonaSimulation(cached.id, results)
    : await createPersonaSimulation(
        ctx.workspaceId,
        derivation.campaignId,
        PERSONA_SOURCE_TYPE,
        baseCreativeId,
        results
      );

  await recordBrandMemoryEvent({
    type: "persona_test_completed",
    workspaceId: ctx.workspaceId,
    clientProfileId: campaign.clientProfileId,
    campaignId: campaign.id,
    derivationId: baseCreativeId,
    occurredAt: simulation.createdAt,
    summary: `Persona test completed for ${PERSONA_SOURCE_TYPE} in campaign "${campaign.name}".`,
    payload: {
      sourceType: PERSONA_SOURCE_TYPE,
      sourceId: baseCreativeId,
      campaign: {
        name: campaign.name,
        client: campaign.client,
        product: campaign.product,
        objective: campaign.objective,
        audience: campaign.audience,
        offer: campaign.offer,
        tone: campaign.tone,
        constraints: campaign.constraints,
        ctaVariants: campaign.ctaVariants,
      },
      results,
    },
  });

  return {
    mode: "sync" as const,
    jobRef: {
      kind: "derivation" as const,
      id: derivation.id,
    },
    resultSummary: `Persona simulation completed (${simulation.id})`,
  };
}
