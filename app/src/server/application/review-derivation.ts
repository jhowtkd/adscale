/**
 * Canonical application command: approve/reject a derivation (Phase 4).
 * HTTP PATCH and Assistente quick_review adapt transport only.
 */
import { MIN_DIRECTION_REASON_LENGTH } from "@/lib/derivation-display";
import { assertDerivationApprovable } from "@/server/ai/creative-quality-gate";
import {
  normalizeExportStatusPayload,
  normalizeOlharVerdictPayload,
} from "@/server/ai/olhar/dual-verdict";
import { recordBrandMemoryEvent } from "@/server/memory/brand-memory-dispatch";
import { recordCampaignMemoryEntry } from "@/server/memory/campaign-memory-context";
import type { OutputDecisionSnapshot } from "@/server/output-learning/output-decision-events";
import { recordOutputDecisionEvidenceBestEffort } from "@/server/output-learning/output-decision-recorder";
import { extractRejectionReason } from "@/server/output-learning/output-decision-reasons";
import {
  getCampaignById,
  refreshCampaignStatus,
} from "@/server/repositories/campaign";
import {
  getDerivationById,
  updateDerivationStatus,
} from "@/server/repositories/derivation";

export type ReviewDecision = "entra" | "quase_regenerar" | "nao_entra";
export type ReviewStatus = "approved" | "rejected";

export type ReviewDerivationInput = {
  workspaceId: string;
  derivationId: string;
  /** Prefer decision; status is legacy HTTP fallback. */
  decision?: ReviewDecision;
  status?: ReviewStatus;
  directionReason?: string;
  overrideReason?: string;
  actorUserId?: string | null;
  evidenceSource?: string;
};

export type ReviewDerivationError =
  | { code: "invalid_input" }
  | { code: "invalid_direction_reason" }
  | { code: "derivation_not_found" }
  | {
      code: "derivation_hard_failures";
      qualityVerdict: string | null;
      hardFailures: unknown;
      olharVerdict: unknown;
      exportStatus: unknown;
    };

export type ReviewDerivationSuccess = {
  derivation: NonNullable<Awaited<ReturnType<typeof updateDerivationStatus>>>;
  campaign: Awaited<ReturnType<typeof getCampaignById>>;
  effectiveStatus: ReviewStatus;
  isOverrideApproval: boolean;
};

export type ReviewDerivationResult =
  | { ok: true; value: ReviewDerivationSuccess }
  | { ok: false; error: ReviewDerivationError };

function mapDecisionToStatus(decision: ReviewDecision): ReviewStatus {
  return decision === "entra" ? "approved" : "rejected";
}

function isValidReasonText(reason?: string): boolean {
  return Boolean(
    reason?.trim() && reason.trim().length >= MIN_DIRECTION_REASON_LENGTH
  );
}

function buildVerdictSnapshotExtras(derivation: {
  olharVerdict?: unknown;
  exportStatus?: unknown;
}): Pick<OutputDecisionSnapshot, "olharVerdict" | "exportStatus"> {
  const olharVerdict = normalizeOlharVerdictPayload(derivation.olharVerdict);
  const exportStatus = normalizeExportStatusPayload(derivation.exportStatus);

  return {
    ...(olharVerdict !== null
      ? { olharVerdict: { value: olharVerdict.value } }
      : {}),
    ...(exportStatus !== null
      ? { exportStatus: { value: exportStatus.value } }
      : {}),
  };
}

export async function reviewDerivation(
  input: ReviewDerivationInput
): Promise<ReviewDerivationResult> {
  if (!input.decision && !input.status) {
    return { ok: false, error: { code: "invalid_input" } };
  }

  const effectiveStatus = input.decision
    ? mapDecisionToStatus(input.decision)
    : input.status!;

  if (
    effectiveStatus === "rejected" &&
    (input.decision === "nao_entra" || input.decision === "quase_regenerar") &&
    !isValidReasonText(input.directionReason)
  ) {
    return { ok: false, error: { code: "invalid_direction_reason" } };
  }

  let isOverrideApproval = false;
  let derivationForAudit:
    | Awaited<ReturnType<typeof getDerivationById>>
    | undefined;

  if (effectiveStatus === "approved") {
    const derivation = await getDerivationById(
      input.derivationId,
      input.workspaceId
    );
    if (!derivation) {
      return { ok: false, error: { code: "derivation_not_found" } };
    }
    derivationForAudit = derivation;

    const approvable = assertDerivationApprovable(derivation);
    if (!approvable.ok) {
      if (!input.overrideReason?.trim()) {
        return {
          ok: false,
          error: {
            code: "derivation_hard_failures",
            qualityVerdict: approvable.qualityVerdict ?? null,
            hardFailures: approvable.hardFailures,
            olharVerdict: approvable.olharVerdict ?? null,
            exportStatus: approvable.exportStatus ?? null,
          },
        };
      }
      if (!isValidReasonText(input.overrideReason)) {
        return { ok: false, error: { code: "invalid_direction_reason" } };
      }
      isOverrideApproval = true;
    }
  }

  const updated = await updateDerivationStatus(
    input.derivationId,
    input.workspaceId,
    effectiveStatus
  );
  if (!updated) {
    return { ok: false, error: { code: "derivation_not_found" } };
  }

  const [, campaign] = await Promise.all([
    refreshCampaignStatus(updated.campaignId, input.workspaceId),
    getCampaignById(updated.campaignId, input.workspaceId),
  ]);

  if (effectiveStatus === "approved" && updated.ctaText?.trim()) {
    await recordCampaignMemoryEntry(updated.campaignId, input.workspaceId, {
      type: "approved_cta",
      text: `Approved CTA: "${updated.ctaText.trim()}"`,
      derivationId: updated.id,
    });
  } else if (effectiveStatus === "rejected") {
    const rejectionNote =
      updated.regenerationSuggestion ??
      (Array.isArray(updated.hardFailures) && updated.hardFailures.length > 0
        ? `Rejected due to: ${(
            updated.hardFailures as Array<{ message?: string }>
          )
            .map((f) => f.message)
            .filter(Boolean)
            .join("; ")}`
        : "Creative rejected by reviewer.");
    await recordCampaignMemoryEntry(updated.campaignId, input.workspaceId, {
      type: "rejected_output",
      text: rejectionNote,
      derivationId: updated.id,
    });
  }

  await recordBrandMemoryEvent({
    type:
      effectiveStatus === "approved" ? "creative_approved" : "creative_rejected",
    workspaceId: input.workspaceId,
    clientProfileId: campaign?.clientProfileId,
    campaignId: updated.campaignId,
    derivationId: updated.id,
    occurredAt: updated.updatedAt,
    summary:
      effectiveStatus === "approved"
        ? `Creative was approved for campaign "${campaign?.name ?? updated.campaignId}".`
        : `Creative was rejected for campaign "${campaign?.name ?? updated.campaignId}".`,
    payload: {
      campaign: campaign
        ? {
            name: campaign.name,
            client: campaign.client,
            product: campaign.product,
            objective: campaign.objective,
            audience: campaign.audience,
            offer: campaign.offer,
            tone: campaign.tone,
            constraints: campaign.constraints,
            ctaVariants: campaign.ctaVariants,
            creativeLevel: campaign.creativeLevel,
            selectedReferenceIds: campaign.selectedReferenceIds,
          }
        : null,
      derivation: {
        status: updated.status,
        format: updated.format,
        generationMode: updated.generationMode,
        ctaText: updated.ctaText,
        qualityScore: updated.qualityScore,
        scoreStatus: updated.scoreStatus,
        scoreIssues: updated.scoreIssues,
        regenerationSuggestion: updated.regenerationSuggestion,
        qaStatus: updated.qaStatus,
        qaIssues: updated.qaIssues,
        feedback: updated.feedback,
      },
    },
  });

  if (input.actorUserId && input.evidenceSource) {
    const auditDerivation = derivationForAudit ?? updated;
    let snapshotExtras: Partial<OutputDecisionSnapshot> | undefined;

    if (effectiveStatus === "approved" && isOverrideApproval) {
      snapshotExtras = {
        overrideApproved: true,
        ...buildVerdictSnapshotExtras(auditDerivation),
        reason: {
          code: "override_approval",
          text: input.overrideReason!.trim(),
          source: "review_override",
        },
      };
    } else if (effectiveStatus === "rejected") {
      if (
        input.decision === "nao_entra" ||
        input.decision === "quase_regenerar"
      ) {
        snapshotExtras = {
          reason: {
            code: input.decision,
            text: input.directionReason!.trim(),
            source: "direction_reason",
          },
        };
      } else {
        snapshotExtras = {
          reason: extractRejectionReason({
            hardFailures: updated.hardFailures,
            scoreIssues: updated.scoreIssues,
            regenerationSuggestion: updated.regenerationSuggestion,
          }),
        };
      }
    }

    void recordOutputDecisionEvidenceBestEffort({
      workspaceId: input.workspaceId,
      userId: input.actorUserId,
      clientProfileId: campaign?.clientProfileId ?? null,
      campaignId: updated.campaignId,
      derivationId: updated.id,
      action: effectiveStatus,
      source: input.evidenceSource,
      snapshotInput: updated,
      snapshotExtras,
    });
  }

  return {
    ok: true,
    value: {
      derivation: updated,
      campaign,
      effectiveStatus,
      isOverrideApproval,
    },
  };
}
