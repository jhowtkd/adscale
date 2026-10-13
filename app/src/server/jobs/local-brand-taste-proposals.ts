import { listOutputDecisionEventsForClient } from "@/server/repositories/output-decision-event";
import { listAdjustmentEvidenceForBrand } from "@/server/equipe/module/adjustment-evidence";
import { createPostgresEquipeUnitOfWork } from "@/server/equipe/data/postgres";
import type { ProposalEvidenceRef } from "@/server/brand-taste/proposal-evidence-types";
import { db } from "@/server/db";
import { clientProfiles, type CalibrationRule } from "@/server/db/schema";
import { logger } from "@/lib/logger";
import {
  LocalLearningAuthorizationError,
  type LocalLearningAuthorizationPort,
  type LocalLearningDenialReason,
} from "@/server/brand-taste/local-learning-authorization";
import {
  insertCalibrationRule,
  listCalibrationRulesForClientProfile,
} from "@/server/repositories/calibration-rule";
import { listCalibrationSignalsForClientProfile } from "@/server/repositories/calibration-signal";
import { extractRuleCandidatesFromSignals } from "@/server/brand-taste/rule-extraction";
import { requireLocalLearningAuthorization } from "@/server/brand-taste/local-learning-authorization";

export type LocalBrandTasteGeneration =
  | { status: "generated"; created: CalibrationRule[]; skipped: number }
  | { status: "denied"; reason: LocalLearningDenialReason };

function evidenceKey(input: {
  category: string;
  mismatchBucket: string | null;
  supportingSignalIds: readonly string[];
  supportingEvidenceRefs?: readonly ProposalEvidenceRef[];
}): string {
  return [input.category, input.mismatchBucket ?? "", [...input.supportingSignalIds.map(id => `calibration_signal:${id}`), ...(input.supportingEvidenceRefs ?? []).map(ref => `${ref.kind}:${ref.id}`)].sort().join(",")].join("|");
}

export async function readLocalBrandTasteEvidence(
  scope: { workspaceId: string; clientProfileId: string },
  authorize?: LocalLearningAuthorizationPort,
) {
  await requireLocalLearningAuthorization(scope, authorize);
  const signals = await listCalibrationSignalsForClientProfile(scope);
  const decisions = await listOutputDecisionEventsForClient(scope.clientProfileId, scope.workspaceId);
  const adjustments = await listAdjustmentEvidenceForBrand({ uow: createPostgresEquipeUnitOfWork(db), authorize }, scope);
  return { signals, decisions, adjustments };
}

/**
 * Scheduled/manual taste-by-category proposals for one brand (#686).
 * The #655 port decides first: a denial creates nothing and the stable
 * reason is recorded. Candidates persist as `candidate` rules only —
 * generation never approves or activates — deduplicated by scope
 * (workspace, brand, category, bucket) and evidence set.
 */
export async function generateLocalBrandTasteProposals(
  scope: { workspaceId: string; clientProfileId: string },
  authorize?: LocalLearningAuthorizationPort,
): Promise<LocalBrandTasteGeneration> {
  let candidates;
  try {
    const evidence = await readLocalBrandTasteEvidence(scope, authorize);
    candidates = extractRuleCandidatesFromSignals({ clientProfileId: scope.clientProfileId, ...evidence });
  } catch (cause) {
    if (cause instanceof LocalLearningAuthorizationError) {
      logger.info({
        event: "local_brand_taste_denied",
        workspaceId: scope.workspaceId,
        clientProfileId: scope.clientProfileId,
        reason: cause.reason,
      });
      return { status: "denied", reason: cause.reason };
    }
    throw cause;
  }

  const existing = await listCalibrationRulesForClientProfile(scope);
  const existingKeys = new Set(existing.map((rule) => evidenceKey({
    category: rule.category,
    mismatchBucket: rule.mismatchBucket,
    supportingSignalIds: rule.supportingSignalIds,
    supportingEvidenceRefs: rule.supportingEvidenceRefs,
  })));

  const created: CalibrationRule[] = [];
  let skipped = 0;
  for (const candidate of candidates) {
    const key = evidenceKey({
      category: candidate.category,
      mismatchBucket: candidate.mismatchBucket,
      supportingSignalIds: candidate.supportingDecisionIds,
      supportingEvidenceRefs: candidate.supportingEvidenceRefs,
    });
    if (existingKeys.has(key)) {
      skipped += 1;
      continue;
    }
    existingKeys.add(key);
    created.push(await insertCalibrationRule({
      workspaceId: scope.workspaceId,
      clientProfileId: scope.clientProfileId,
      category: candidate.category,
      status: "candidate",
      rationale: candidate.rationale,
      supportingSignalIds: [...candidate.supportingDecisionIds],
      supportingEvidenceRefs: candidate.supportingEvidenceRefs ?? [],
      confidence: candidate.confidence,
      caveats: [...candidate.caveats],
      mismatchBucket: candidate.mismatchBucket,
      version: candidate.version,
    }));
  }
  return { status: "generated", created, skipped };
}

export async function generateAllLocalBrandTasteProposals(
  authorize?: LocalLearningAuthorizationPort,
): Promise<{ brands: number; created: number; denied: number }> {
  const brands = await db
    .select({ id: clientProfiles.id, workspaceId: clientProfiles.workspaceId })
    .from(clientProfiles);
  let created = 0;
  let denied = 0;
  for (const brand of brands) {
    const result = await generateLocalBrandTasteProposals(
      { workspaceId: brand.workspaceId, clientProfileId: brand.id },
      authorize,
    );
    if (result.status === "denied") denied += 1;
    else created += result.created.length;
  }
  return { brands: brands.length, created, denied };
}
