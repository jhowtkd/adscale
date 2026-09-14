import { createHash } from "node:crypto";
import { z } from "zod";

import { canonicalJsonStringify } from "../creative-work/canonical-json";
import {
  personFidelitySelectionGate,
  resolvePersonFidelity,
} from "../creative-work/person-fidelity";
import {
  quoteCreativeWork,
  type CreativeWorkFormat,
  type CreativeWorkIdentitySnapshot,
} from "../creative-work/contracts";
import {
  brandKnowledgeClaimKeySchema,
  brandKnowledgeEvidenceRefSchema,
} from "../brand-knowledge/contracts";
import type { BrandKnowledgeVersionSnapshotV1 } from "../brand-knowledge/version-compiler";

/** Slots per calibration round and base rounds before an explicit extension. */
export const CALIBRATION_SLOTS_PER_ROUND = 4;
export const CALIBRATION_BASE_ROUNDS = 3;
/** Canonical format of every calibration example (plan 01, T2). */
export const CALIBRATION_FORMAT: CreativeWorkFormat = "4:5";
export const CALIBRATION_FEEDBACK_NOTE_LIMIT = 2000;
export const CALIBRATION_FEEDBACK_DIMENSIONS_LIMIT = 8;
export const CALIBRATION_FEEDBACK_DIMENSION_LENGTH = 80;
export const CALIBRATION_COVERAGE_LIMIT = 12;
export const CALIBRATION_COVERAGE_ITEM_LENGTH = 100;

/** Frozen training content under review. Built server-side only, never from client JSON. */
export type Candidate = {
  hash: string;
  knowledge: BrandKnowledgeVersionSnapshotV1;
  identity: Omit<CreativeWorkIdentitySnapshot, "brandKnowledge">;
  evidenceHashes: Record<string, string>;
};

export type SlotAssessment = {
  status: "queued" | "processing" | "completed" | "failed";
  objective: "pass" | "fail" | "inconclusive";
  rating: "good" | "bad" | null;
  needsHumanReview: boolean;
};

export type CalibrationFeedback = {
  rating: "good" | "bad";
  note: string;
  dimensions: string[];
  actorId: string;
  at: string;
};

export type CalibrationSlot = {
  index: 0 | 1 | 2 | 3;
  workItemId: string;
  outputId: string | null;
  feedback: CalibrationFeedback | null;
};

export type CalibrationRound = {
  number: number;
  candidate: Candidate;
  quoteCredits: number;
  confirmedBy: string;
  confirmedAt: string;
  coverage: string[];
  slots: [CalibrationSlot, CalibrationSlot, CalibrationSlot, CalibrationSlot];
};

export type TrainingSessionStatus = "review" | "calibrating" | "pending" | "activated" | "archived";

export function nextRoundNumber(completedRounds: number, extensions: number): number | null {
  return completedRounds < CALIBRATION_BASE_ROUNDS + extensions ? completedRounds + 1 : null;
}

export function canActivate(
  hash: string,
  round: { candidateHash: string; slots: SlotAssessment[] },
): boolean {
  return (
    hash === round.candidateHash &&
    round.slots.length === CALIBRATION_SLOTS_PER_ROUND &&
    round.slots.every(
      (s) =>
        s.status === "completed" &&
        s.objective !== "fail" &&
        s.rating === "good" &&
        !s.needsHumanReview,
    )
  );
}

export type PersonFidelitySlotSignal = "blocked" | "needs_review";

/**
 * Person-fidelity signal for a calibration slot (plan 03, T3). SlotAssessment
 * builders MUST set needsHumanReview when this returns non-null: a confirmed
 * mismatch blocks activation until a new image is generated, and doubt blocks
 * until the specific human review bound to this output and hash is recorded.
 * canActivate already honors needsHumanReview — the same central guard as the
 * output-selection path, never a disabled button alone.
 */
export function personFidelitySlotSignal(
  quality: unknown,
  outputId: string | null,
): PersonFidelitySlotSignal | null {
  const gate = personFidelitySelectionGate(resolvePersonFidelity(quality), outputId);
  if (gate === null || gate === "selectable") return null;
  return gate;
}

/**
 * Coverage labels of a candidate: the distinct claim keys it exercises,
 * capped like round coverage. Shown in the review UI; never a claim of
 * exhaustive brand validation.
 */
export function calibrationCoverage(candidate: Pick<Candidate, "knowledge">): string[] {
  const keys = [...new Set(candidate.knowledge.claims.map((claim) => claim.claimKey))];
  return keys.slice(0, CALIBRATION_COVERAGE_LIMIT);
}

type PersistedCalibrationOutput = {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  quality: unknown;
};

/**
 * Builds the activation-relevant assessment of one slot from PERSISTED state
 * only: the output row, its stored quality block and the recorded feedback.
 * Shared by the review route (display) and publish (activation guard) so both
 * judge the same evidence. Unknown quality stays inconclusive — only a stored
 * objective verdict and a specific person-fidelity review can clear a slot.
 */
export function assessCalibrationSlot(input: {
  output: PersistedCalibrationOutput | null;
  outputId: string | null;
  feedback: { rating: "good" | "bad" } | null;
}): SlotAssessment {
  const status = input.output?.status ?? "queued";
  const quality = input.output?.quality;
  const verdict = (quality as { objectiveVerdict?: unknown } | null | undefined)?.objectiveVerdict;
  const objective: SlotAssessment["objective"] =
    status === "failed"
      ? "fail"
      : status === "completed" && (verdict === "pass" || verdict === "fail" || verdict === "inconclusive")
        ? verdict
        : "inconclusive";
  return {
    status,
    objective,
    rating: input.feedback?.rating ?? null,
    needsHumanReview: personFidelitySlotSignal(quality, input.outputId) !== null,
  };
}

export function freezeCandidate(input: Omit<Candidate, "hash">): Candidate {
  return {
    ...input,
    hash: createHash("sha256").update(canonicalJsonStringify(input)).digest("hex"),
  };
}

export const calibrationDraftKey = (sessionId: string, round: number, slot: number) =>
  `brand-calibration:${sessionId}:${round}:${slot}`;

export const calibrationCredits = (format: CreativeWorkFormat) =>
  CALIBRATION_SLOTS_PER_ROUND *
  quoteCreativeWork({ intent: "single", format, targetFormats: [] }).credits;

const hexHashSchema = z.string().regex(/^[0-9a-f]{64}$/);
const isoDateTimeSchema = z.string().datetime();
const uuidSchema = z.string().uuid();

const publishedClaimSchema = z
  .object({
    id: z.string().min(1).max(200),
    claimKey: brandKnowledgeClaimKeySchema,
    kind: z.enum(["fact", "rule", "preference", "prohibition"]),
    value: z.unknown(),
    scope: z.object({
      level: z.literal("global"),
      format: z.enum(["1:1", "4:5", "9:16"]).optional(),
      channel: z.string().trim().min(1).max(80).optional(),
    }),
    authority: z.enum(["human", "explicit", "measured", "inferred"]),
    confidence: z.enum(["low", "medium", "high"]),
    evidenceRefs: z.array(brandKnowledgeEvidenceRefSchema.strict()).max(50),
    reviewedAt: isoDateTimeSchema,
    reviewedByUserId: z.string().min(1).max(200),
  })
  .strict();

const candidateKnowledgeSchema = z
  .object({
    schemaVersion: z.literal(1),
    profileId: uuidSchema,
    compiledAt: isoDateTimeSchema,
    claims: z.array(publishedClaimSchema).max(1000),
    excluded: z
      .array(
        z
          .object({ claimId: z.string().min(1).max(200), reason: z.literal("not_approved") })
          .strict(),
      )
      .max(1000),
  })
  .strict();

const candidateIdentitySchema = z
  .object({
    clientProfileId: uuidSchema,
    confirmedAt: isoDateTimeSchema,
    assets: z.array(z.unknown()).max(500),
    brandKit: z
      .object({
        colors: z.array(z.string().max(100)).max(100),
        fonts: z.array(z.string().max(200)).max(100),
        toneOfVoice: z.string().max(4000).nullable(),
        prohibitedElements: z.string().max(4000).nullable(),
        requiredElements: z.string().max(4000).nullable(),
      })
      .catchall(z.unknown()),
  })
  .catchall(z.unknown());

export const candidateSchema = z
  .object({
    hash: hexHashSchema,
    knowledge: candidateKnowledgeSchema,
    identity: candidateIdentitySchema,
    evidenceHashes: z.record(z.string().max(400), hexHashSchema),
  })
  .strict();

export const calibrationFeedbackSchema = z
  .object({
    rating: z.enum(["good", "bad"]),
    note: z.string().max(CALIBRATION_FEEDBACK_NOTE_LIMIT),
    dimensions: z
      .array(z.string().max(CALIBRATION_FEEDBACK_DIMENSION_LENGTH))
      .max(CALIBRATION_FEEDBACK_DIMENSIONS_LIMIT),
    actorId: z.string().min(1).max(200),
    at: isoDateTimeSchema,
  })
  .strict();

const calibrationSlotSchema = z
  .object({
    index: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
    workItemId: uuidSchema,
    outputId: uuidSchema.nullable(),
    feedback: calibrationFeedbackSchema.nullable(),
  })
  .strict();

export const calibrationRoundSchema = z
  .object({
    number: z.number().int().positive(),
    candidate: candidateSchema,
    quoteCredits: z.number().int().nonnegative(),
    confirmedBy: z.string().min(1).max(200),
    confirmedAt: isoDateTimeSchema,
    coverage: z
      .array(z.string().max(CALIBRATION_COVERAGE_ITEM_LENGTH))
      .max(CALIBRATION_COVERAGE_LIMIT),
    slots: z.tuple([
      calibrationSlotSchema,
      calibrationSlotSchema,
      calibrationSlotSchema,
      calibrationSlotSchema,
    ]),
  })
  .strict();

export const slotAssessmentSchema = z
  .object({
    status: z.enum(["queued", "processing", "completed", "failed"]),
    objective: z.enum(["pass", "fail", "inconclusive"]),
    rating: z.enum(["good", "bad"]).nullable(),
    needsHumanReview: z.boolean(),
  })
  .strict();

const revisionSchema = z.number().int().nonnegative();

export const calibrationCommandSchema = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("create"), expectedActiveVersionId: uuidSchema.nullable() })
    .strict(),
  z
    .object({
      action: z.literal("start"),
      sessionId: uuidSchema,
      expectedRevision: revisionSchema,
      acceptedCredits: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      action: z.literal("feedback"),
      sessionId: uuidSchema,
      expectedRevision: revisionSchema,
      round: z.number().int().positive(),
      slot: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
      rating: z.enum(["good", "bad"]),
      note: z.string().max(CALIBRATION_FEEDBACK_NOTE_LIMIT),
      dimensions: z
        .array(z.string().max(CALIBRATION_FEEDBACK_DIMENSION_LENGTH))
        .max(CALIBRATION_FEEDBACK_DIMENSIONS_LIMIT),
    })
    .strict(),
  z
    .object({ action: z.literal("extend"), sessionId: uuidSchema, expectedRevision: revisionSchema })
    .strict(),
  z
    .object({
      action: z.literal("archive"),
      sessionId: uuidSchema,
      expectedRevision: revisionSchema,
    })
    .strict(),
]);

export type CalibrationCommand = z.infer<typeof calibrationCommandSchema>;
