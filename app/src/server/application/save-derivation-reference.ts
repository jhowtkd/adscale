/**
 * Canonical application command: save an approved derivation as a brand reference.
 * Phase 4 / items 28–29 — HTTP and Assistente are thin adapters over this module.
 */
import { assertDerivationApprovable } from "@/server/ai/creative-quality-gate";
import { recordBrandMemoryEvent } from "@/server/memory/brand-memory-dispatch";
import { recordOutputDecisionEvidenceBestEffort } from "@/server/output-learning/output-decision-recorder";
import {
  createClientReference,
  getClientProfile,
  type ClientReferenceKind,
} from "@/server/repositories/client-reference";
import { getDerivationById } from "@/server/repositories/derivation";

export type SaveDerivationReferenceInput = {
  workspaceId: string;
  derivationId: string;
  clientProfileId: string;
  label: string;
  kind?: ClientReferenceKind;
  notes?: string;
  /** When set, records output-learning evidence (HTTP path). */
  actorUserId?: string | null;
  /** Telemetry source for evidence (e.g. route name). */
  evidenceSource?: string;
};

export type SaveDerivationReferenceError =
  | { code: "derivation_not_found" }
  | { code: "derivation_not_approved" }
  | { code: "derivation_missing_output" }
  | {
      code: "derivation_hard_failures";
      qualityVerdict: string | null;
      hardFailures: unknown;
    }
  | { code: "client_profile_not_found" };

export type SaveDerivationReferenceSuccess = {
  reference: Awaited<ReturnType<typeof createClientReference>>;
  derivation: NonNullable<Awaited<ReturnType<typeof getDerivationById>>>;
  profile: { id: string; name: string };
};

export type SaveDerivationReferenceResult =
  | { ok: true; value: SaveDerivationReferenceSuccess }
  | { ok: false; error: SaveDerivationReferenceError };

/**
 * Shared business rules for "salvar como referência".
 * Adapters own auth, transport mapping, and input parsing only.
 */
export async function saveDerivationReference(
  input: SaveDerivationReferenceInput
): Promise<SaveDerivationReferenceResult> {
  const kind = input.kind ?? "style";

  const derivation = await getDerivationById(
    input.derivationId,
    input.workspaceId
  );
  if (!derivation) {
    return { ok: false, error: { code: "derivation_not_found" } };
  }
  if (derivation.status !== "approved") {
    return { ok: false, error: { code: "derivation_not_approved" } };
  }
  if (!derivation.outputKey) {
    return { ok: false, error: { code: "derivation_missing_output" } };
  }

  const approvable = assertDerivationApprovable(derivation);
  if (!approvable.ok) {
    return {
      ok: false,
      error: {
        code: "derivation_hard_failures",
        qualityVerdict: approvable.qualityVerdict ?? null,
        hardFailures: approvable.hardFailures,
      },
    };
  }

  const profile = await getClientProfile(
    input.workspaceId,
    input.clientProfileId
  );
  if (!profile) {
    return { ok: false, error: { code: "client_profile_not_found" } };
  }

  const reference = await createClientReference(input.workspaceId, {
    clientProfileId: profile.id,
    assetKey: derivation.outputKey,
    label: input.label,
    kind,
    notes: input.notes,
    sourceDerivationId: derivation.id,
  });

  await recordBrandMemoryEvent({
    type: "creative_saved_as_reference",
    workspaceId: input.workspaceId,
    clientProfileId: profile.id,
    campaignId: derivation.campaignId,
    derivationId: derivation.id,
    occurredAt: reference.createdAt,
    summary: `Approved creative was saved as "${reference.label}" (${reference.kind}) for brand/client profile "${profile.name}".`,
    payload: {
      action: "approved_creative_saved_as_reference",
      profile: { id: profile.id, name: profile.name },
      reference: {
        label: reference.label,
        kind: reference.kind,
        notes: reference.notes,
        assetKey: reference.assetKey,
      },
      derivation: {
        id: derivation.id,
        format: derivation.format,
        generationMode: derivation.generationMode,
        ctaText: derivation.ctaText,
        qualityScore: derivation.qualityScore,
        qaStatus: derivation.qaStatus,
      },
    },
  });

  if (input.actorUserId && input.evidenceSource) {
    void recordOutputDecisionEvidenceBestEffort({
      workspaceId: input.workspaceId,
      userId: input.actorUserId,
      clientProfileId: profile.id,
      campaignId: derivation.campaignId,
      derivationId: derivation.id,
      action: "saved_reference",
      source: input.evidenceSource,
      snapshotInput: derivation,
      snapshotExtras: {
        referenceKind: reference.kind,
        referenceLabel: reference.label,
      },
    });
  }

  return {
    ok: true,
    value: {
      reference,
      derivation,
      profile: { id: profile.id, name: profile.name },
    },
  };
}
