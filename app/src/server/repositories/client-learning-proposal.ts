import { and, desc, eq, gt } from "drizzle-orm";

import { db } from "../db";
import {
  clientLearningProposals,
  type ClientLearningProposal,
} from "../db/schema";
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

export async function findSliceInCooldown(
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
        eq(clientLearningProposals.status, "rejected"),
        gt(clientLearningProposals.cooldownUntil, new Date())
      )
    )
    .orderBy(desc(clientLearningProposals.proposedAt))
    .limit(1);

  return row ?? null;
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
  acceptedBy: string
): Promise<ClientLearningProposal | null> {
  const [row] = await db
    .update(clientLearningProposals)
    .set({
      status: "accepted",
      acceptedAt: new Date(),
      acceptedBy,
    })
    .where(eq(clientLearningProposals.id, id))
    .returning();

  return row ?? null;
}

export async function markProposalRejected(
  id: string,
  reason: string,
  cooldownUntil: Date
): Promise<ClientLearningProposal | null> {
  const [row] = await db
    .update(clientLearningProposals)
    .set({
      status: "rejected",
      rejectedReason: reason,
      cooldownUntil,
    })
    .where(eq(clientLearningProposals.id, id))
    .returning();

  return row ?? null;
}
