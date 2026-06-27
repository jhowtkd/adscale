import { analyzeCreativeDiagnosis } from "@/server/ai/creative-diagnosis";
import { analyzeImageContent } from "@/server/ai/image-analysis";
import { getCampaignById } from "@/server/repositories/campaign";
import { createCampaign, updateCampaign } from "@/server/repositories/campaign";
import { createAsset } from "@/server/repositories/asset";
import { linkThreadToCampaign } from "@/server/repositories/assistant-thread";
import { getClientProfile } from "@/server/repositories/client-reference";
import {
  GuidedFlowValidationError,
  getGuidedFlowByThread,
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

export async function materializeExistingCreativeCampaign(input: {
  workspaceId: string;
  threadId: string;
  clientProfileId: string;
  workspaceAssetId: string;
}) {
  const flow = await getGuidedFlowByThread(input.workspaceId, input.threadId);
  if (
    !flow ||
    flow.path !== "existing_creative" ||
    flow.currentStep !== "confirm_improvement" ||
    (flow.slots as Record<string, unknown>)?.reviewApproved !== true
  ) {
    throw new GuidedFlowValidationError("Diagnosis must be approved before campaign creation");
  }
  if (flow.campaignId) {
    const campaign = await getCampaignById(flow.campaignId, input.workspaceId);
    const baseCreativeId = (flow.slots as Record<string, unknown>).baseCreativeId;
    if (campaign && typeof baseCreativeId === "string") {
      return { campaign, baseCreativeId };
    }
  }

  const [workspaceAsset, profile] = await Promise.all([
    getWorkspaceAssetById(input.workspaceAssetId, input.workspaceId),
    getClientProfile(input.workspaceId, input.clientProfileId),
  ]);
  if (!workspaceAsset || !profile) {
    throw new GuidedFlowValidationError("Creative or client profile not found");
  }
  const slots = (flow.slots ?? {}) as Record<string, unknown>;
  const briefing = (slots.briefingSnapshot ?? {}) as Partial<BriefingSnapshot>;
  const rawDiagnosis = (slots.diagnosis ?? {}) as Record<string, unknown>;
  const diagnosis = {
    detectedConcept:
      typeof rawDiagnosis.detectedConcept === "string"
        ? rawDiagnosis.detectedConcept
        : "Conceito revisado",
    elementsToPreserve: Array.isArray(rawDiagnosis.elementsToPreserve)
      ? (rawDiagnosis.elementsToPreserve as string[])
      : [],
    variationOpportunities: Array.isArray(rawDiagnosis.variationOpportunities)
      ? (rawDiagnosis.variationOpportunities as string[])
      : [],
  };

  const campaign = await createCampaign(input.workspaceId, {
    name: `${profile.name} — melhoria de peça`,
    client: profile.name,
    clientProfileId: profile.id,
    product: briefing.product ?? undefined,
    offer: briefing.offer,
    objective: briefing.objective,
    audience: briefing.audience,
    constraints: briefing.constraints,
    ctaVariants: briefing.ctaText ? [briefing.ctaText] : [],
    creativeDiagnosisStatus: "ready",
    creativeDiagnosis: diagnosis,
    creativeDiagnosisSource: "edited",
    generationMode: "art_variation",
    status: "draft",
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
  await updateCampaign(campaign.id, input.workspaceId, {
    creativeDiagnosis: diagnosis,
  });

  return { campaign, baseCreativeId: campaignAsset.id };
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

export async function analyzeExistingCreativeForJourney(input: {
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

  const diagnosisResult = await analyzeCreativeDiagnosis({
    campaign: {
      name: `${profile.name} — peça existente`,
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

  const missingFields = deriveMissingFields(briefingSnapshot);
  const assumptions = [diagnosisResult.diagnosis.detectedConcept];

  return {
    workspaceAssetId: workspaceAsset.id,
    briefingSnapshot,
    diagnosis: diagnosisResult.diagnosis,
    assumptions,
    missingFields,
  };
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
    `Propose start_complete_campaign with baseCreativeId=${baseCreativeId}. The server will materialize the reviewed workspace creative only after confirmation.`,
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
