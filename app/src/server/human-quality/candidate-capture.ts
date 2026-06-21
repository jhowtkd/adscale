import { getCampaignById, updateCampaign } from "@/server/repositories/campaign";
import { resolveCampaignClientProfileId } from "@/server/repositories/client-reference";
import { getDerivationById } from "@/server/repositories/derivation";
import {
  findCorpusCandidateByDerivationVersion,
  insertCorpusCandidate,
} from "@/server/repositories/human-quality-candidate";
import { findCorpusItemByDerivationVersion } from "@/server/repositories/human-quality-corpus";
import type { HumanQualityCorpusCandidate } from "@/server/db/schema";
import { buildQualitySnapshot, validatePrivacySafePayload } from "./corpus";
import { resolveAutoCaptureSourceLabel } from "./source-label";

export class CorpusCandidateCaptureError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
    this.name = "CorpusCandidateCaptureError";
  }
}

export interface CaptureCorpusCandidateInput {
  workspaceId: string;
  derivationId: string;
  corpusVersion?: number;
}

function buildArtifactRef(derivationId: string, styleAssetId?: string | null) {
  const ref: Record<string, unknown> = { derivationId };
  if (styleAssetId) {
    ref.styleAssetId = styleAssetId;
  }
  return ref;
}

function buildQualitySnapshotFromDerivation(derivation: {
  generationMode?: string | null;
  format?: string | null;
  variantIndex?: number | null;
  ctaText?: string | null;
  status?: string | null;
  qualityScore?: number | null;
  qualityVerdict?: string | null;
  scoreStatus?: string | null;
  hardFailures?: unknown;
  scoreIssues?: unknown;
  polishSuggestions?: unknown;
}) {
  return buildQualitySnapshot({
    generationMode: derivation.generationMode,
    format: derivation.format,
    variantIndex: derivation.variantIndex,
    ctaText: derivation.ctaText,
    status: derivation.status,
    qualityScore: derivation.qualityScore,
    qualityVerdict: derivation.qualityVerdict,
    scoreStatus: derivation.scoreStatus,
    hardFailures: derivation.hardFailures,
    scoreIssues: derivation.scoreIssues,
    polishSuggestions: derivation.polishSuggestions,
  }) as Record<string, unknown>;
}

/** Register a completed derivation as a privacy-safe corpus candidate (idempotent). */
export async function captureCorpusCandidateFromDerivation(
  input: CaptureCorpusCandidateInput
): Promise<HumanQualityCorpusCandidate | null> {
  const corpusVersion = input.corpusVersion ?? 1;

  const existingCandidate = await findCorpusCandidateByDerivationVersion(
    input.workspaceId,
    input.derivationId,
    corpusVersion
  );
  if (existingCandidate) {
    return existingCandidate;
  }

  const existingCorpusItem = await findCorpusItemByDerivationVersion(
    input.workspaceId,
    input.derivationId,
    corpusVersion
  );
  if (existingCorpusItem) {
    return null;
  }

  const derivation = await getDerivationById(input.derivationId, input.workspaceId);
  if (!derivation || derivation.status !== "completed") {
    return null;
  }

  const campaign = await getCampaignById(derivation.campaignId, input.workspaceId);
  if (!campaign) {
    return null;
  }

  const clientProfileId = await resolveCampaignClientProfileId(input.workspaceId, {
    clientProfileId: campaign.clientProfileId,
    client: campaign.client,
  });

  if (!clientProfileId) {
    throw new CorpusCandidateCaptureError(
      "Campaign is missing client profile for candidate capture",
      "missing_client_profile"
    );
  }

  if (!campaign.clientProfileId) {
    await updateCampaign(campaign.id, input.workspaceId, { clientProfileId });
  }

  const artifactRef = buildArtifactRef(input.derivationId, derivation.styleAssetId);
  const qualitySnapshot = buildQualitySnapshotFromDerivation(derivation);

  for (const payload of [artifactRef, qualitySnapshot]) {
    const validation = validatePrivacySafePayload(payload);
    if (!validation.ok) {
      throw new CorpusCandidateCaptureError(validation.error, "forbidden_corpus_payload");
    }
  }

  return insertCorpusCandidate({
    workspaceId: input.workspaceId,
    clientProfileId,
    campaignId: derivation.campaignId,
    derivationId: input.derivationId,
    generationMode: derivation.generationMode ?? "art_variation",
    format: derivation.format ?? "",
    corpusVersion,
    sourceLabel: resolveAutoCaptureSourceLabel(input.workspaceId),
    artifactRef,
    qualitySnapshot,
  });
}
