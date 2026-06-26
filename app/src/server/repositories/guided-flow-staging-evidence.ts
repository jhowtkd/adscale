import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import {
  assistantGuidedFlowStagingEvidence,
  type AssistantGuidedFlowStagingEvidence,
  type NewAssistantGuidedFlowStagingEvidence,
} from "../db/schema";
import { getAssistantThreadById } from "./assistant-thread";

export const STAGING_CHECK_KEYS = [
  "diagnosis",
  "briefing",
  "creative_plan",
  "approval_lifecycle",
] as const;

export const STAGING_VERDICTS = ["pass", "fail", "tech_debt"] as const;

export class GuidedFlowStagingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuidedFlowStagingValidationError";
  }
}

const MAX_SAFE_NOTES = 256;

export function sanitizeStagingSafeNotes(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim().slice(0, MAX_SAFE_NOTES);
  return trimmed.length > 0 ? trimmed : null;
}

async function assertStagingScope(
  workspaceId: string,
  clientProfileId: string,
  threadId: string
) {
  const thread = await getAssistantThreadById(workspaceId, threadId);
  if (!thread) {
    throw new GuidedFlowStagingValidationError("Thread not found");
  }
  if (thread.clientProfileId !== clientProfileId) {
    throw new GuidedFlowStagingValidationError("Client profile scope mismatch");
  }
}

export async function insertGuidedFlowStagingEvidence(
  input: NewAssistantGuidedFlowStagingEvidence
): Promise<AssistantGuidedFlowStagingEvidence> {
  if (
    !STAGING_CHECK_KEYS.includes(
      input.checkKey as (typeof STAGING_CHECK_KEYS)[number]
    )
  ) {
    throw new GuidedFlowStagingValidationError("Invalid check key");
  }
  if (!STAGING_VERDICTS.includes(input.verdict as (typeof STAGING_VERDICTS)[number])) {
    throw new GuidedFlowStagingValidationError("Invalid verdict");
  }

  await assertStagingScope(input.workspaceId, input.clientProfileId, input.threadId);

  const [row] = await db
    .insert(assistantGuidedFlowStagingEvidence)
    .values({
      ...input,
      safeNotes: sanitizeStagingSafeNotes(input.safeNotes),
    })
    .returning();

  return row;
}

export async function listGuidedFlowStagingEvidence(
  workspaceId: string
): Promise<AssistantGuidedFlowStagingEvidence[]> {
  return db
    .select()
    .from(assistantGuidedFlowStagingEvidence)
    .where(eq(assistantGuidedFlowStagingEvidence.workspaceId, workspaceId))
    .orderBy(desc(assistantGuidedFlowStagingEvidence.createdAt))
    .limit(200);
}

export async function listGuidedFlowStagingEvidenceForOwner(): Promise<
  AssistantGuidedFlowStagingEvidence[]
> {
  return db
    .select()
    .from(assistantGuidedFlowStagingEvidence)
    .orderBy(desc(assistantGuidedFlowStagingEvidence.createdAt))
    .limit(500);
}

export function summarizeStagingCoverage(
  rows: AssistantGuidedFlowStagingEvidence[]
) {
  const paths = new Set(rows.map((row) => row.path));
  return {
    existingCreativeCovered: paths.has("existing_creative"),
    fromZeroCovered: paths.has("from_zero"),
    totalRecords: rows.length,
    passCount: rows.filter((row) => row.verdict === "pass").length,
    techDebtCount: rows.filter((row) => row.verdict === "tech_debt").length,
    failCount: rows.filter((row) => row.verdict === "fail").length,
  };
}
