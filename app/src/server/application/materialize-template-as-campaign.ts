/**
 * Phase 5 / item 39: materialize a workspace template as a campaign origin
 * of CanonicalCreativeWork (intent + briefing + format filled from template).
 *
 * Generic templates never copy references. A client profile is attached only
 * when the user explicitly selects it during materialization.
 */
import { projectCampaignAsCanonicalWork } from "@/server/creative-work/projection/from-campaign";
import type { CanonicalCreativeWork } from "@/server/creative-work/canonical/types";
import {
  createCampaign,
  type CreateCampaignInput,
  type CreativeLevel,
  type GenerationMode,
  type StyleIntensity,
} from "@/server/repositories/campaign";
import { getTemplateById } from "@/server/repositories/template";

type CampaignRow = Awaited<ReturnType<typeof createCampaign>>;

export type MaterializeTemplateAsCampaignInput = {
  workspaceId: string;
  userId: string;
  templateId: string;
  name: string;
  client: string;
  clientProfileId?: string | null;
};

export type MaterializeTemplateAsCampaignError =
  | { code: "template_not_found" };

export type MaterializeTemplateAsCampaignSuccess = {
  campaign: CampaignRow;
  /** Origin-agnostic view with intent.kind === "campaign". */
  canonical: CanonicalCreativeWork;
};

export type MaterializeTemplateAsCampaignResult =
  | { ok: true; value: MaterializeTemplateAsCampaignSuccess }
  | { ok: false; error: MaterializeTemplateAsCampaignError };

const GENERATION_MODES = new Set<GenerationMode>([
  "art_variation",
  "format_adaptation",
  "restyling",
]);
const CREATIVE_LEVELS = new Set<CreativeLevel>([
  "conservative",
  "balanced",
  "bold",
  "extreme",
]);
const STYLE_INTENSITIES = new Set<StyleIntensity>([
  "soft",
  "medium",
  "strong",
]);

function asGenerationMode(value: string | null | undefined): GenerationMode | undefined {
  if (value && GENERATION_MODES.has(value as GenerationMode)) {
    return value as GenerationMode;
  }
  return undefined;
}

function asCreativeLevel(value: string | null | undefined): CreativeLevel | undefined {
  if (value && CREATIVE_LEVELS.has(value as CreativeLevel)) {
    return value as CreativeLevel;
  }
  return undefined;
}

function asStyleIntensity(value: string | null | undefined): StyleIntensity | undefined {
  if (value && STYLE_INTENSITIES.has(value as StyleIntensity)) {
    return value as StyleIntensity;
  }
  return undefined;
}

/** Map the template briefing plus the user's explicit brand choice; never copy refs. */
export function buildCampaignInputFromTemplate(
  template: NonNullable<Awaited<ReturnType<typeof getTemplateById>>>,
  userFields: { name: string; client: string; clientProfileId?: string | null }
): CreateCampaignInput {
  return {
    name: userFields.name,
    client: userFields.client,
    product: template.product ?? undefined,
    objective: template.objective ?? undefined,
    audience: template.audience ?? undefined,
    platforms: template.platforms ?? undefined,
    tone: template.tone ?? undefined,
    offer: template.offer ?? undefined,
    constraints: template.constraints ?? undefined,
    notes: template.notes ?? undefined,
    generationMode: asGenerationMode(template.generationMode),
    creativeLevel: asCreativeLevel(template.creativeLevel),
    styleIntensity: asStyleIntensity(template.styleIntensity),
    ctaVariants: template.ctaVariants ?? undefined,
    targetFormats: template.targetFormats ?? undefined,
    clientProfileId: userFields.clientProfileId ?? null,
    selectedReferenceIds: null,
    status: "draft",
  };
}

export async function materializeTemplateAsCampaign(
  input: MaterializeTemplateAsCampaignInput
): Promise<MaterializeTemplateAsCampaignResult> {
  const template = await getTemplateById(input.templateId, input.workspaceId);
  if (!template) {
    return { ok: false, error: { code: "template_not_found" } };
  }

  const createInput = buildCampaignInputFromTemplate(template, {
    name: input.name,
    client: input.client,
    clientProfileId: input.clientProfileId,
  });

  // Hard invariants: never carry brand/refs from template path.
  if (createInput.selectedReferenceIds?.length) {
    throw new Error(
      "materializeTemplateAsCampaign: selectedReferenceIds must not come from template"
    );
  }
  const campaign = await createCampaign(input.workspaceId, createInput);

  const canonical = projectCampaignAsCanonicalWork(
    {
      id: campaign.id,
      workspaceId: campaign.workspaceId,
      name: campaign.name,
      client: campaign.client,
      product: campaign.product,
      objective: campaign.objective,
      audience: campaign.audience,
      platforms: campaign.platforms,
      tone: campaign.tone,
      offer: campaign.offer,
      constraints: campaign.constraints,
      notes: campaign.notes,
      clientProfileId: campaign.clientProfileId,
      targetFormats: campaign.targetFormats,
      status: campaign.status,
      creativeDiagnosisStatus: campaign.creativeDiagnosisStatus,
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt,
    },
    []
  );

  if (canonical.intent.kind !== "campaign") {
    throw new Error(
      `materializeTemplateAsCampaign: expected intent.kind campaign, got ${canonical.intent.kind}`
    );
  }
  if (canonical.originKind !== "campaign") {
    throw new Error(
      `materializeTemplateAsCampaign: expected originKind campaign, got ${canonical.originKind}`
    );
  }

  const expectedFormatHint = campaign.targetFormats?.[0] ?? null;
  if (canonical.intent.formatHint !== expectedFormatHint) {
    throw new Error(
      `materializeTemplateAsCampaign: formatHint mismatch (got ${canonical.intent.formatHint}, expected ${expectedFormatHint})`
    );
  }

  return { ok: true, value: { campaign, canonical } };
}
