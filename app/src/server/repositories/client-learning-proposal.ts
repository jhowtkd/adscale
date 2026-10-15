import { and, desc, eq } from "drizzle-orm";

import { db } from "../db";
import {
  clientLearningProposals,
  clientCorpusConsents,
  type ClientLearningProposal,
  type CalibrationRule,
  type NewCalibrationRule,
} from "../db/schema";
import { insertCalibrationRule } from "./calibration-rule";
import { lockCorpusConsentScope } from "./human-quality-corpus";
import { CorpusConsentError } from "../human-quality/corpus";
import type { ClientLearningProposalEvidence } from "../human-quality/calibration/types";

export interface InsertClientLearningProposalInput {
  workspaceId: string;
  clientProfileId: string;
  sliceKey: string;
  primaryFailureReason: string;
  rationale: string;
  evidenceRefs: ClientLearningProposalEvidence;
}

export interface ListClientLearningProposalsFilters {
  status?: string;
  workspaceId?: string;
  clientProfileId?: string;
}

export async function insertClientLearningProposal(
  input: InsertClientLearningProposalInput
): Promise<ClientLearningProposal> {
  const [row] = await db
    .insert(clientLearningProposals)
    .values({
      workspaceId: input.workspaceId,
      clientProfileId: input.clientProfileId,
      sliceKey: input.sliceKey,
      primaryFailureReason: input.primaryFailureReason,
      rationale: input.rationale,
      evidenceRefs: input.evidenceRefs,
      status: "proposed",
    })
    .returning();

  return row;
}

export async function listRejectedProposalsBySlice(
  workspaceId: string,
  clientProfileId: string,
  sliceKey: string
): Promise<ClientLearningProposal[]> {
  return db
    .select()
    .from(clientLearningProposals)
    .where(
      and(
        eq(clientLearningProposals.workspaceId, workspaceId),
        eq(clientLearningProposals.clientProfileId, clientProfileId),
        eq(clientLearningProposals.sliceKey, sliceKey),
        eq(clientLearningProposals.status, "rejected")
      )
    )
    .orderBy(desc(clientLearningProposals.cooldownUntil), desc(clientLearningProposals.proposedAt));
}

export async function findActiveProposalBySlice(
  workspaceId: string,
  clientProfileId: string,
  sliceKey: string
): Promise<ClientLearningProposal | null> {
  const [row] = await db
    .select()
    .from(clientLearningProposals)
    .where(
      and(
        eq(clientLearningProposals.workspaceId, workspaceId),
        eq(clientLearningProposals.clientProfileId, clientProfileId),
        eq(clientLearningProposals.sliceKey, sliceKey),
        eq(clientLearningProposals.status, "proposed")
      )
    )
    .limit(1);

  return row ?? null;
}

export async function getClientLearningProposalById(
  id: string
): Promise<ClientLearningProposal | null> {
  const [row] = await db
    .select()
    .from(clientLearningProposals)
    .where(eq(clientLearningProposals.id, id))
    .limit(1);

  return row ?? null;
}

export async function listClientLearningProposals(
  filters: ListClientLearningProposalsFilters = {}
): Promise<ClientLearningProposal[]> {
  const conditions = [];

  if (filters.status) {
    conditions.push(eq(clientLearningProposals.status, filters.status));
  }
  if (filters.workspaceId) {
    conditions.push(eq(clientLearningProposals.workspaceId, filters.workspaceId));
  }
  if (filters.clientProfileId) {
    conditions.push(
      eq(clientLearningProposals.clientProfileId, filters.clientProfileId)
    );
  }

  return db
    .select()
    .from(clientLearningProposals)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(clientLearningProposals.proposedAt));
}

export async function markProposalAccepted(
  id: string,
  acceptedBy: string,
  ruleInput: NewCalibrationRule
): Promise<{ proposal: ClientLearningProposal; rule: CalibrationRule } | null> {
  return db.transaction(async tx => {
    await lockCorpusConsentScope(tx, ruleInput.workspaceId, ruleInput.clientProfileId);
    const [current] = await tx.select().from(clientLearningProposals)
      .where(and(eq(clientLearningProposals.id, id), eq(clientLearningProposals.status, "proposed")))
      .for("update").limit(1);
    if (!current) return null;
    const [consent] = await tx.select().from(clientCorpusConsents).where(and(
      eq(clientCorpusConsents.workspaceId, current.workspaceId),
      eq(clientCorpusConsents.clientProfileId, current.clientProfileId),
      eq(clientCorpusConsents.status, "granted"),
    )).limit(1);
    if (!consent) throw new CorpusConsentError("Consentimento vigente necessário para usar o corpus", "client_consent_required");
    const rule = await insertCalibrationRule(ruleInput, tx);
    const [proposal] = await tx.update(clientLearningProposals)
      .set({ status: "accepted", acceptedAt: new Date(), acceptedBy })
      .where(eq(clientLearningProposals.id, id)).returning();
    return { proposal, rule };
  });
}

export async function markProposalRejected(
  id: string,
  reason: string,
  cooldownUntil: Date,
  rejectedBy: string,
  rejectedAt: Date
): Promise<ClientLearningProposal | null> {
  const [row] = await db
    .update(clientLearningProposals)
    .set({
      status: "rejected",
      rejectedReason: reason,
      cooldownUntil,
      rejectedBy,
      rejectedAt,
    })
    .where(and(eq(clientLearningProposals.id, id), eq(clientLearningProposals.status, "proposed")))
    .returning();

  return row ?? null;
}
