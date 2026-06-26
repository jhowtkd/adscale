import { analyzeCreativeDiagnosis } from "@/server/ai/creative-diagnosis";
import { analyzeImageContent } from "@/server/ai/image-analysis";
import { createAsset } from "@/server/repositories/asset";
import { linkThreadToCampaign } from "@/server/repositories/assistant-thread";
import { createCampaign, getCampaignById, updateCampaign } from "@/server/repositories/campaign";
import { getClientProfile } from "@/server/repositories/client-reference";
import {
  GuidedFlowValidationError,
  getGuidedFlowByThread,
  patchGuidedFlow,
} from "@/server/repositories/guided-flow";
import { getWorkspaceAssetById } from "@/server/repositories/workspace-asset";
import { downloadBuffer } from "@/server/storage/r2";

export interface BriefingSnapshot {
  client: string;
  product: string | null;
  offer: string;
  objective: string;
  audience: string;
  ctaText: string;
  constraints: string;
  confidence: {
    client: number;
    offer: number;
    ctaText: number;
    audience: number;
  };
}

function mimeTypeFromKey(key: string): string {
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

function mapContentBriefToBriefingFields(content: {
  product: string;
  offer: string;
  cta: { text: string; style: string };
  brandElements: string[];
  keyVisual: string;
}): Omit<BriefingSnapshot, "confidence"> {
  const constraints = content.brandElements?.length
    ? `Preserve: ${content.brandElements.join(", ")}`
    : "";

  return {
    client: content.product || "",
    product: content.product || null,
    offer: content.offer || "",
    objective: content.cta?.text ? `Drive action: ${content.cta.text}` : "",
    audience: content.keyVisual ? `Visual target: ${content.keyVisual}` : "",
    ctaText: content.cta?.text || "",
    constraints,
  };
}

function deriveMissingFields(snapshot: BriefingSnapshot): string[] {
  const missing: string[] = [];
  if (snapshot.confidence.offer < 0.7 || !snapshot.offer.trim()) {
    missing.push("offer");
  }
  if (snapshot.confidence.audience < 0.7 || !snapshot.audience.trim()) {
    missing.push("audience");
  }
  if (snapshot.confidence.ctaText < 0.7 || !snapshot.ctaText.trim()) {
    missing.push("cta");
  }
  if (!snapshot.objective.trim()) {
    missing.push("objective");
  }
  return missing;
}

export async function selectExistingCreative(input: {
  workspaceId: string;
  threadId: string;
  clientProfileId: string;
  workspaceAssetId: string;
  locale?: string;
}) {
  const flow = await getGuidedFlowByThread(input.workspaceId, input.threadId);
  if (!flow) {
    throw new GuidedFlowValidationError("Guided flow not found");
  }
  if (flow.path !== "existing_creative") {
    throw new GuidedFlowValidationError("Flow path is not existing_creative");
  }
  if (flow.currentStep !== "select_creative") {
    throw new GuidedFlowValidationError("Flow is not at select_creative step");
  }

  const workspaceAsset = await getWorkspaceAssetById(
    input.workspaceAssetId,
    input.workspaceId
  );
  if (!workspaceAsset) {
    throw new GuidedFlowValidationError("Workspace asset not found");
  }

  const profile = await getClientProfile(input.workspaceId, input.clientProfileId);
  if (!profile) {
    throw new GuidedFlowValidationError("Client profile not found");
  }

  const campaign = await createCampaign(input.workspaceId, {
    name: `${profile.name} — peça existente`,
    client: profile.name,
    clientProfileId: input.clientProfileId,
    status: "draft",
    generationMode: "art_variation",
    creativeDiagnosisStatus: "analyzing",
  });

  const campaignAsset = await createAsset(input.workspaceId, campaign.id, {
    key: workspaceAsset.key,
    type: workspaceAsset.type,
    size: workspaceAsset.size ?? undefined,
    width: workspaceAsset.width ?? undefined,
    height: workspaceAsset.height ?? undefined,
    role: "base",
  });

  await linkThreadToCampaign(input.workspaceId, input.threadId, campaign.id);

  const imageBuffer = await downloadBuffer(workspaceAsset.key);
  const mimeType = mimeTypeFromKey(workspaceAsset.key);
  const content = await analyzeImageContent(imageBuffer, mimeType);
  const extracted = mapContentBriefToBriefingFields(content);
  const briefingSnapshot: BriefingSnapshot = {
    ...extracted,
    confidence: {
      client: content.product ? 0.85 : 0.3,
      offer: content.offer ? 0.8 : 0.3,
      ctaText: content.cta?.text ? 0.9 : 0.2,
      audience: content.keyVisual ? 0.6 : 0.2,
    },
  };

  await updateCampaign(campaign.id, input.workspaceId, {
    product: briefingSnapshot.product,
    offer: briefingSnapshot.offer,
    objective: briefingSnapshot.objective,
    audience: briefingSnapshot.audience,
    constraints: briefingSnapshot.constraints,
    ctaVariants: briefingSnapshot.ctaText ? [briefingSnapshot.ctaText] : [],
  });

  const diagnosisResult = await analyzeCreativeDiagnosis({
    campaign: {
      name: campaign.name,
      client: profile.name,
      product: briefingSnapshot.product,
      objective: briefingSnapshot.objective,
      audience: briefingSnapshot.audience,
      platforms: [],
      tone: null,
      offer: briefingSnapshot.offer,
      constraints: briefingSnapshot.constraints,
      notes: null,
      ctaVariants: briefingSnapshot.ctaText ? [briefingSnapshot.ctaText] : [],
    },
    imageBuffer,
    mimeType,
    locale: input.locale,
  });

  await updateCampaign(campaign.id, input.workspaceId, {
    creativeDiagnosisStatus: diagnosisResult.status,
    creativeDiagnosis: diagnosisResult.diagnosis,
    creativeDiagnosisSource: diagnosisResult.source,
    creativeDiagnosisUpdatedAt: new Date(),
  });

  const missingFields = deriveMissingFields(briefingSnapshot);
  const assumptions = [diagnosisResult.diagnosis.detectedConcept];

  const guidedFlow = await patchGuidedFlow(
    input.workspaceId,
    input.threadId,
    input.clientProfileId,
    {
      currentStep: "review_diagnosis",
      campaignId: campaign.id,
      assetIds: [campaignAsset.id],
      missingFields,
      slots: {
        briefingSnapshot,
        diagnosis: diagnosisResult.diagnosis,
        assumptions,
        recommendedAction: "quick_restyle",
        baseCreativeId: campaignAsset.id,
      },
    }
  );

  return {
    campaignId: campaign.id,
    campaignAssetId: campaignAsset.id,
    guidedFlow,
    briefingSnapshot,
    diagnosis: diagnosisResult.diagnosis,
    missingFields,
  };
}

export async function acknowledgeExistingCreativeDiagnosis(input: {
  workspaceId: string;
  threadId: string;
  clientProfileId: string;
}) {
  const flow = await getGuidedFlowByThread(input.workspaceId, input.threadId);
  if (!flow) {
    throw new GuidedFlowValidationError("Guided flow not found");
  }
  if (flow.path !== "existing_creative" || flow.currentStep !== "review_diagnosis") {
    throw new GuidedFlowValidationError("Flow is not at review_diagnosis step");
  }

  const guidedFlow = await patchGuidedFlow(
    input.workspaceId,
    input.threadId,
    input.clientProfileId,
    { currentStep: "confirm_improvement" }
  );

  return { guidedFlow };
}

export function buildExistingCreativePromptAugment(input: {
  currentStep: string;
  slots: Record<string, unknown>;
  assetIds: string[];
}): string | null {
  if (input.currentStep !== "confirm_improvement") {
    return null;
  }

  const baseCreativeId =
    typeof input.slots.baseCreativeId === "string"
      ? input.slots.baseCreativeId
      : input.assetIds[0];

  if (!baseCreativeId) {
    return null;
  }

  const briefing =
    input.slots.briefingSnapshot && typeof input.slots.briefingSnapshot === "object"
      ? (input.slots.briefingSnapshot as BriefingSnapshot)
      : null;

  const lines = [
    "Guided path: existing_creative at confirm_improvement.",
    `Propose quick_restyle with baseCreativeId=${baseCreativeId}.`,
    "Do not ask the user to re-enter briefing fields already extracted from the creative.",
  ];

  if (briefing) {
    lines.push(
      `Extracted briefing — offer: ${briefing.offer || "n/a"}, audience: ${briefing.audience || "n/a"}, CTA: ${briefing.ctaText || "n/a"}.`
    );
  }

  return lines.join("\n");
}

export async function getExistingCreativeContextForThread(
  workspaceId: string,
  threadId: string
) {
  const flow = await getGuidedFlowByThread(workspaceId, threadId);
  if (!flow || flow.path !== "existing_creative") {
    return null;
  }

  let campaign = null;
  if (flow.campaignId) {
    campaign = await getCampaignById(flow.campaignId, workspaceId);
  }

  return { flow, campaign };
}
