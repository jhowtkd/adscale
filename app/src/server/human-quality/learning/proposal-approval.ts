import { requireLocalLearningAuthorization } from "@/server/brand-taste/local-learning-authorization";
import { getCorpusConsent } from "@/server/repositories/assistant-goal";
import { listEvaluatedCorpusWithEvaluations } from "@/server/repositories/human-quality-corpus";
import { listFeedbackArtifactIdsByCorpusItemIds } from "@/server/repositories/human-quality-feedback-artifact";
import { buildClientLearningProposals } from "./aggregate";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { calibrationRules, guidanceProposalApprovals, clientLearningProposals, clientProfiles, clientCorpusConsents, user, type CalibrationRule } from "@/server/db/schema";
import { isPlatformOwnerEmail } from "@/server/auth/platform-owner";
import { hashGuidanceContent, isGuidanceCategoryApplicable, validateLearnedGuidanceBudget, LearnedGuidanceError, type EligibleGuidanceRevision } from "@/server/brand-taste/learned-guidance";
import { confirmedGuidanceMetadataSchema, type ConfirmedGuidanceMetadata } from "@/server/brand-taste/guidance-metadata";
import { learningProposalRevision, withLearningProposalRevision, proposalMetadataInputSchema, CORRECTION_CANDIDATE_RATIONALE_PREFIX, keepsCorrectionCandidatePointer, type LearningProposalKind, type GuidanceProposalDraft } from "@/server/brand-taste/proposal-review";
import { canPromoteRuleToApproved } from "@/server/brand-taste/rule-extraction";
import { mapRuleRowToCandidate } from "@/server/brand-taste/calibration-rules";
import { MIN_SLICE_SAMPLE } from "../calibration/report";
import { enforceCorpusQualityRuleCap } from "./corpus-quality-cap";
import { writeCalibrationRuleDecision } from "@/server/brand-taste/guidance-decisions";
import { MAX_CORPUS_QUALITY_RULES } from "./corpus-quality-prompt";

export class GuidanceProposalError extends Error {
  constructor(public readonly code: "not_proposed" | "forbidden" | "revision_conflict" | "metadata_required" | "invalid_metadata" | "insufficient_evidence" | "client_consent_required" | "fixture_ack_required" | "budget_exceeded" | "invalid_guidance" | "caveat_ack_required" | "guidance_text_required", message: string, public readonly current?: object) {
    super(message); this.name = "GuidanceProposalError";
  }
}
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Proposal = typeof clientLearningProposals.$inferSelect | CalibrationRule;

async function owner(tx: Tx, actorId: string) {
  const [actor] = await tx.select({ id: user.id, name: user.name, email: user.email }).from(user).where(eq(user.id, actorId)).limit(1);
  if (!actor || !isPlatformOwnerEmail(actor.email)) throw new GuidanceProposalError("forbidden", "Somente o Dono da plataforma pode revisar e aprovar orientações.");
  return actor;
}
async function target(tx: Tx, kind: LearningProposalKind, id: string): Promise<Proposal> {
  const table = kind === "rule" ? calibrationRules : clientLearningProposals;
  const [row] = await tx.select().from(table).where(eq(table.id, id)).for("update").limit(1);
  if (!row) throw new GuidanceProposalError("not_proposed", "Proposta não encontrada.");
  return row as Proposal;
}
function assertProposedRevision(kind: LearningProposalKind, row: Proposal, expectedRevision: string) {
  if (learningProposalRevision(kind, row) !== expectedRevision) throw new GuidanceProposalError("revision_conflict", "A proposta mudou. Leia a revisão atual antes de continuar.", withLearningProposalRevision(kind, row));
  if (row.status !== (kind === "rule" ? "candidate" : "proposed")) throw new GuidanceProposalError("not_proposed", "Esta proposta já recebeu uma decisão.");
}
function metadataFor(text: string, value: unknown): ConfirmedGuidanceMetadata {
  const parsed = proposalMetadataInputSchema.safeParse(value);
  if (!parsed.success || parsed.data.roles.some(role => !isGuidanceCategoryApplicable(role, parsed.data.category))) throw new GuidanceProposalError("invalid_metadata", "Confira categoria, natureza, papéis e escopo de uso.");
  return { ...parsed.data, contentHash: hashGuidanceContent(text) };
}
export async function editLearningProposal(input: { kind: LearningProposalKind; proposalId: string; reviewerUserId: string; expectedRevision: string; text: string; metadata: unknown }) {
  return db.transaction(async tx => {
    const actor = await owner(tx, input.reviewerUserId);
    const proposal = await target(tx, input.kind, input.proposalId);
    assertProposedRevision(input.kind, proposal, input.expectedRevision);
    const draft: GuidanceProposalDraft = { revision: (proposal.proposalDraft?.revision ?? 0) + 1, originalText: proposal.proposalDraft?.originalText ?? proposal.rationale,
      editedText: input.text, editedBy: actor.id, editedByName: actor.name, editedAt: new Date().toISOString(), metadata: metadataFor(input.text, input.metadata) };
    const table = input.kind === "rule" ? calibrationRules : clientLearningProposals;
    const [updated] = await tx.update(table).set({ proposalDraft: draft }).where(eq(table.id, proposal.id)).returning();
    return withLearningProposalRevision(input.kind, updated);
  });
}

function validateApprovalBudget(candidate: EligibleGuidanceRevision, metadata: ConfirmedGuidanceMetadata, approved: CalibrationRule[]) {
  for (const role of metadata.roles) {
    for (const mode of metadata.generationModes) for (const format of metadata.formats) {
      const revisions = approved.flatMap(rule => {
        const parsed = confirmedGuidanceMetadataSchema.safeParse(rule.confirmedMetadata);
        if (!parsed.success || !rule.metadataConfirmedBy || !rule.metadataConfirmedAt || parsed.data.contentHash !== hashGuidanceContent(rule.rationale)
          || !parsed.data.roles.includes(role) || !parsed.data.generationModes.includes(mode) || !parsed.data.formats.includes(format)) return [];
        return [{ ruleId: rule.id, revision: "legacy" as const, contentHash: parsed.data.contentHash, text: rule.rationale, category: parsed.data.category, roles: parsed.data.roles }];
      });
      validateLearnedGuidanceBudget({ role, revisions: [...revisions, candidate] });
    }
  }
}

// JSONB retains the response bytes; restore only row timestamps, never draft.editedAt.
function restoreApprovalDates<T extends Proposal>(row: T): T {
  const restored: Record<string, unknown> = { ...row };
  for (const key of ["createdAt", "updatedAt", "proposedAt", "acceptedAt", "rejectedAt", "cooldownUntil", "approvedAt", "metadataConfirmedAt"]) {
    if (typeof restored[key] === "string") restored[key] = new Date(restored[key]);
  }
  return restored as T;
}

export async function approveLearningProposal(input: { kind: LearningProposalKind; proposalId: string; reviewerUserId: string; expectedRevision: string; acknowledgeFixtureOnly?: boolean; acknowledgeCaveats?: boolean }) {
  return db.transaction(async tx => {
    const actor = await owner(tx, input.reviewerUserId);
    const proposal = await target(tx, input.kind, input.proposalId);
    if (proposal.status !== (input.kind === "rule" ? "candidate" : "proposed")) {
      const [receipt] = await tx.select().from(guidanceProposalApprovals).where(and(
        eq(guidanceProposalApprovals.kind, input.kind), eq(guidanceProposalApprovals.proposalId, proposal.id),
        eq(guidanceProposalApprovals.expectedRevision, input.expectedRevision),
      )).limit(1);
      if (receipt) {
        const decided = restoreApprovalDates(receipt.result.proposal);
        return { proposal: withLearningProposalRevision(input.kind, decided), rule: restoreApprovalDates(receipt.result.rule) };
      }
    }
    assertProposedRevision(input.kind, proposal, input.expectedRevision);
    const draft = proposal.proposalDraft;
    const parsed = confirmedGuidanceMetadataSchema.safeParse(draft?.metadata);
    if (!draft || !parsed.success || parsed.data.contentHash !== hashGuidanceContent(draft.editedText)) throw new GuidanceProposalError("metadata_required", "Salve o texto e confirme seus metadados antes de aprovar.");
    // A categorized-correction candidate only points at its evidence; its text would reach prompts as is.
    if (input.kind === "rule" && draft.originalText.startsWith(CORRECTION_CANDIDATE_RATIONALE_PREFIX) && keepsCorrectionCandidatePointer(draft.editedText)) {
      throw new GuidanceProposalError("guidance_text_required", "Escreva a orientação a partir das correções de apoio antes de aprovar.");
    }
    let fixtureOnly = false;
    if (input.kind === "corpus_quality") {
      const evidence = (proposal as typeof clientLearningProposals.$inferSelect).evidenceRefs;
      if (evidence.corpusItemIds.length < MIN_SLICE_SAMPLE) throw new GuidanceProposalError("insufficient_evidence", "A proposta precisa de pelo menos três itens de apoio.");
      const corpus = proposal as typeof clientLearningProposals.$inferSelect;
      await requireLocalLearningAuthorization(corpus);
      const consent = await getCorpusConsent(corpus.workspaceId, corpus.clientProfileId);
      if (consent?.status !== "granted") {
        throw new GuidanceProposalError("client_consent_required", "Consentimento vigente da marca necessário para usar o corpus.");
      }
      const ids = new Set(corpus.evidenceRefs.corpusItemIds);
      const rows = (await listEvaluatedCorpusWithEvaluations({
        workspaceId: corpus.workspaceId, clientProfileId: corpus.clientProfileId,
        corpusItemIds: [...ids],
      })).filter(row => ids.has(row.item.id));
      if (new Set(rows.map(row => row.item.id)).size !== ids.size || rows.some(row =>
        row.item.workspaceId !== corpus.workspaceId || row.item.clientProfileId !== corpus.clientProfileId ||
        row.evaluation.workspaceId !== corpus.workspaceId || row.evaluation.corpusItemId !== row.item.id ||
        !row.evaluation.factualPass || (row.item.qualitySnapshot.hardFailures?.length ?? 0) > 0 ||
        row.item.qualitySnapshot.qualityVerdict === "fail" || row.item.qualitySnapshot.exportStatus?.value === "bloqueado"
      ) || !buildClientLearningProposals(rows).some(candidate => candidate.sliceKey === corpus.sliceKey &&
        candidate.primaryFailureReason === corpus.primaryFailureReason && candidate.evidenceRefs.corpusItemIds.length === ids.size)) {
        throw new GuidanceProposalError("insufficient_evidence", "Evidência indisponível, fora do escopo ou inelegível.");
      }
      fixtureOnly = corpus.evidenceRefs.fixtureOnly === true || rows.every(row => row.sourceLabel === "synthetic_fixture");
      if (corpus.evidenceRefs.artifactIds?.length) {
        const artifacts = new Set((await listFeedbackArtifactIdsByCorpusItemIds([...ids])).values());
        if (corpus.evidenceRefs.artifactIds.some(id => !artifacts.has(id))) {
          throw new GuidanceProposalError("insufficient_evidence", "Feedback indisponível ou fora do escopo da evidência.");
        }
      }
      if (fixtureOnly && input.acknowledgeFixtureOnly !== true) {
        throw new GuidanceProposalError(
          "fixture_ack_required",
          "Confirme que o apoio é exclusivamente sintético antes de aprovar."
        );
      }
    } else {
      const candidate = mapRuleRowToCandidate(proposal as CalibrationRule);
      // Acknowledgment never overrides an invalid state or ambiguous evidence.
      if (candidate.mismatchBucket === "unclear_sample" && candidate.supportingDecisionIds.length === 1) throw new GuidanceProposalError("insufficient_evidence", "Evidência ambígua não pode ser aprovada.");
      if (!canPromoteRuleToApproved(candidate).ok && !input.acknowledgeCaveats) throw new GuidanceProposalError("caveat_ack_required", "Confira e reconheça as ressalvas da proposta.");
    }
    // Serialize approvals of different proposals too: concurrent accepts cannot each admit rule six.
    const [brand] = await tx.select({ id: clientProfiles.id }).from(clientProfiles).where(and(eq(clientProfiles.id, proposal.clientProfileId), eq(clientProfiles.workspaceId, proposal.workspaceId))).for("update").limit(1);
    if (!brand) throw new GuidanceProposalError("not_proposed", "Marca não encontrada neste workspace.");
    if (input.kind === "corpus_quality") {
      const [consent] = await tx.select().from(clientCorpusConsents).where(and(
        eq(clientCorpusConsents.workspaceId, proposal.workspaceId), eq(clientCorpusConsents.clientProfileId, proposal.clientProfileId), eq(clientCorpusConsents.status, "granted"),
      )).limit(1);
      if (!consent) throw new GuidanceProposalError("client_consent_required", "Consentimento vigente da marca necessário para usar o corpus.");
    }
    const approved = await tx.select().from(calibrationRules).where(and(eq(calibrationRules.workspaceId, proposal.workspaceId), eq(calibrationRules.clientProfileId, proposal.clientProfileId), eq(calibrationRules.status, "approved")));
    let previous: CalibrationRule | undefined;
    if (input.kind === "corpus_quality") {
      [previous] = await tx.select().from(calibrationRules).where(and(
        eq(calibrationRules.workspaceId, proposal.workspaceId), eq(calibrationRules.clientProfileId, proposal.clientProfileId),
        eq(calibrationRules.category, "corpus_quality"), eq(calibrationRules.supportedSliceKey, (proposal as typeof clientLearningProposals.$inferSelect).sliceKey),
      )).for("update").limit(1);
    }
    try {
      validateApprovalBudget({ ruleId: proposal.id, revision: "legacy", contentHash: parsed.data.contentHash, text: draft.editedText, category: parsed.data.category, roles: parsed.data.roles }, parsed.data, approved.filter(rule => rule.id !== previous?.id));
    } catch (error) {
      if (error instanceof LearnedGuidanceError) throw new GuidanceProposalError(error.code === "budget_exceeded" ? "budget_exceeded" : "invalid_guidance", error.message);
      throw error;
    }
    const at = new Date();
    const decidedDraft = { ...draft, revision: draft.revision + 1 };
    let rule: CalibrationRule;
    let decided: Proposal;
    if (input.kind === "rule") {
      [rule] = await tx.update(calibrationRules).set({ rationale: draft.editedText, proposalDraft: decidedDraft, status: "approved", reviewDecision: null, approvedBy: actor.id, approvedAt: at,
        confirmedMetadata: parsed.data, metadataConfirmedBy: actor.id, metadataConfirmedAt: at, updatedAt: at }).where(eq(calibrationRules.id, proposal.id)).returning();
      decided = rule;
    } else {
      const corpus = proposal as typeof clientLearningProposals.$inferSelect;
      const values = { workspaceId: corpus.workspaceId, clientProfileId: corpus.clientProfileId, category: "corpus_quality", status: "approved", reviewDecision: null, supportedSliceKey: corpus.sliceKey,
        rationale: draft.editedText, primaryFailureReason: corpus.primaryFailureReason, proposalDraft: decidedDraft,
        supportingSignalIds: [], supportingEvidenceRefs: [ ...corpus.evidenceRefs.corpusItemIds.map(id => ({ kind: "corpus_item" as const, id })), ...(corpus.evidenceRefs.artifactIds ?? []).map(id => ({ kind: "feedback_artifact" as const, id })) ],
        confidence: "medium", caveats: fixtureOnly ? ["fixture_only_corpus"] : [], version: previous?.version ?? 1, approvedBy: actor.id, approvedAt: at,
        confirmedMetadata: parsed.data, metadataConfirmedBy: actor.id, metadataConfirmedAt: at };
      [rule] = previous
        ? await tx.update(calibrationRules).set({ ...values, updatedAt: at }).where(eq(calibrationRules.id, previous.id)).returning()
        : await tx.insert(calibrationRules).values(values).returning();
      [decided] = await tx.update(clientLearningProposals).set({ proposalDraft: decidedDraft, status: "accepted", acceptedBy: actor.id, acceptedAt: at }).where(eq(clientLearningProposals.id, corpus.id)).returning();
      await enforceCorpusQualityRuleCap({ workspaceId: corpus.workspaceId, clientProfileId: corpus.clientProfileId, rules: [...approved.filter(r => r.category === "corpus_quality" && r.id !== rule.id), rule],
        deprecateRule: async previous => { await writeCalibrationRuleDecision(tx, previous, {
          action: "deprecate", decidedBy: actor.id, source: "corpus_quality_cap",
          reason: `Depreciada pelo teto de ${MAX_CORPUS_QUALITY_RULES} orientações aprovadas de corpus_quality.`,
          expectedRevision: learningProposalRevision("rule", previous),
        }, at); } });
    }
    await tx.insert(guidanceProposalApprovals).values({ kind: input.kind, proposalId: proposal.id,
      expectedRevision: input.expectedRevision, ruleId: rule.id, result: { proposal: decided, rule } });
    return { proposal: withLearningProposalRevision(input.kind, decided), rule };
  });
}
