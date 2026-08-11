import {
  mapDerivationStatusToCanonical,
  normalizeCampaignState,
} from "@/server/creative-work/canonical/status";
import {
  makeCanonicalWorkId,
  requireIso,
  toIso,
  type CanonicalCreativeWork,
  type CanonicalOutput,
  type CanonicalVersion,
  type CanonicalWorkNextAction,
  type CanonicalWorkSummary,
} from "@/server/creative-work/canonical/types";

export interface CampaignProjectionSource {
  id: string;
  workspaceId: string;
  name: string;
  client: string | null;
  product: string | null;
  objective: string | null;
  audience: string | null;
  platforms: string[] | null;
  tone: string | null;
  offer: string | null;
  constraints: string | null;
  notes: string | null;
  clientProfileId: string | null;
  /** First entry becomes intent.formatHint (template / campaign target formats). */
  targetFormats?: string[] | null;
  /** Persisted creation mode; exposed as the canonical Protocol. */
  generationMode?: string | null;
  status: string;
  creativeDiagnosisStatus?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  activeDerivations?: number;
  totalDerivations?: number;
  completedDerivations?: number;
  failedDerivations?: number;
}

export interface DerivationProjectionSource {
  id: string;
  status: string;
  format: string | null;
  creativeLevel: string | null;
  outputKey: string | null;
  createdAt?: Date | string | null;
}

function resumeHrefForCampaign(campaignId: string): string {
  return `/campaigns/${campaignId}`;
}

function nextActionForState(state: CanonicalCreativeWork["state"]): CanonicalWorkNextAction {
  if (state === "failed") return "retry";
  if (state === "reviewing" || state === "approved" || state === "delivered") return "review";
  if (state === "generating") return "open";
  return "resume";
}

export function projectCampaignAsCanonicalWork(
  campaign: CampaignProjectionSource,
  derivations: DerivationProjectionSource[] = []
): CanonicalCreativeWork {
  const derivationStatuses = derivations.map((d) => d.status);
  const state = normalizeCampaignState({
    status: campaign.status,
    creativeDiagnosisStatus: campaign.creativeDiagnosisStatus,
    activeDerivations: campaign.activeDerivations ?? 0,
    totalDerivations:
      campaign.totalDerivations ?? derivations.length,
    completedDerivations: campaign.completedDerivations ?? 0,
    failedDerivations: campaign.failedDerivations ?? 0,
    derivationStatuses,
  });

  const outputs: CanonicalOutput[] = derivations.map((d) => {
    const status = mapDerivationStatusToCanonical(d.status);
    return {
      id: d.id,
      sourceKind: "derivation" as const,
      status,
      format: d.format,
      creativeLevel: d.creativeLevel,
      outputKey: d.outputKey,
      isSelected: status === "approved",
      versionLabel: d.creativeLevel ?? d.format ?? d.id.slice(0, 8),
      createdAt: toIso(d.createdAt),
    };
  });

  const versions: CanonicalVersion[] = outputs.map((o) => ({
    id: `version:${o.id}`,
    label: o.versionLabel,
    outputId: o.id,
    createdAt: o.createdAt,
  }));

  const selected = outputs.find((o) => o.isSelected) ?? null;

  return {
    id: makeCanonicalWorkId("campaign", campaign.id),
    originKind: "campaign",
    originId: campaign.id,
    origin: "campaign",
    workspaceId: campaign.workspaceId,
    clientProfileId: campaign.clientProfileId,
    name: campaign.name,
    state,
    intent: {
      kind: "campaign",
      objective: campaign.objective,
      formatHint: campaign.targetFormats?.[0] ?? null,
      platforms: campaign.platforms ?? [],
    },
    briefing: {
      product: campaign.product,
      client: campaign.client,
      audience: campaign.audience,
      offer: campaign.offer,
      tone: campaign.tone,
      constraints: campaign.constraints,
      notes: campaign.notes,
      headline: null,
      body: null,
      cta: null,
      theme: null,
    },
    outputs,
    versions,
    selectedOutputId: selected?.id ?? null,
    createdAt: requireIso(campaign.createdAt),
    updatedAt: requireIso(campaign.updatedAt),
    resumable: state !== "abandoned" && state !== "failed",
    resumeHref: resumeHrefForCampaign(campaign.id),
    protocol: campaign.generationMode ?? null,
    brandName: campaign.client,
    previewHref: null,
    previewAlt: campaign.name,
    resultCount: campaign.totalDerivations ?? derivations.length,
    nextAction: nextActionForState(state),
  };
}

export function summarizeCampaignAsCanonicalWork(
  campaign: CampaignProjectionSource,
  derivations: DerivationProjectionSource[] = []
): CanonicalWorkSummary {
  const full = projectCampaignAsCanonicalWork(campaign, derivations);
  return {
    id: full.id,
    originKind: full.originKind,
    originId: full.originId,
    origin: full.origin,
    workspaceId: full.workspaceId,
    clientProfileId: full.clientProfileId,
    name: full.name,
    state: full.state,
    updatedAt: full.updatedAt,
    resumable: full.resumable,
    resumeHref: full.resumeHref,
    protocol: full.protocol,
    brandName: full.brandName,
    previewHref: full.previewHref,
    previewAlt: full.previewAlt,
    resultCount: full.resultCount,
    nextAction: full.nextAction,
  };
}
