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
import { peopleCatalogSchema, type PeopleCatalog } from "./people";
import { visualRepertoireSchema, type VisualRepertoire } from "./visual-repertoire";

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
 * One deterministic calibration case (plan 02, T2): which reviewed language
 * or person the slot exercises. The brief copy always comes from the neutral
 * calibration briefs by slot order — only these IDs replace the context.
 */
export type CalibrationCase = {
  slot: 0 | 1 | 2 | 3;
  languageId: string | null;
  personId: string | null;
};

type CalibrationLearnedContent = {
  repertoire: VisualRepertoire | null;
  catalog: PeopleCatalog | null;
};

function learnedContentOf(knowledge: BrandKnowledgeVersionSnapshotV1 | null | undefined): CalibrationLearnedContent {
  const claims = knowledge?.claims ?? [];
  const repertoireValue = claims.find((claim) => claim.claimKey === "visual.repertoire")?.value;
  const catalogValue = claims.find((claim) => claim.claimKey === "people.catalog")?.value;
  const repertoire = visualRepertoireSchema.safeParse(repertoireValue);
  const catalog = peopleCatalogSchema.safeParse(catalogValue);
  return {
    repertoire: repertoire.success ? repertoire.data : null,
    catalog: catalog.success ? catalog.data : null,
  };
}

/**
 * Plans the four deterministic calibration cases from the reviewed content
 * (plan 02, T2): (1) the common identity, (2) the first reviewed language,
 * (3) the second language, or the first photo-confirmed person when there is
 * no second language, (4) a new composition of the first case — or, when the
 * previous round tested the same candidate, a recomposition of the
 * highest-priority bad-rated slot (lowest slot index wins).
 *
 * Language order is the confirmed collection's order: the review's explicit
 * choice, never a silent first-occurrence pick. Later rounds keep the same
 * briefings and aspects while the candidate is unchanged (the plan is a pure
 * function of it); a changed candidate regenerates all four cases. Only
 * photo-confirmed people are exercised — an unconfirmed person would fail
 * preparation, never silently become optional inspiration.
 *
 * The retest target of a bad slot 3 is the case slot 3 itself exercised,
 * which only the full round history can reconstruct: pass `priorRounds` in
 * creation order so a twice-failed language keeps being retested instead of
 * silently falling back to the common context. `priorRound` stays as a
 * single-step shorthand for the first retest, where both forms agree.
 */
export function planCalibrationCases(input: {
  candidate: Pick<Candidate, "hash" | "knowledge">;
  priorRound?: Pick<CalibrationRound, "candidate" | "slots"> | null;
  priorRounds?: ReadonlyArray<Pick<CalibrationRound, "candidate" | "slots">> | null;
}): [CalibrationCase, CalibrationCase, CalibrationCase, CalibrationCase] {
  const { repertoire, catalog } = learnedContentOf(input.candidate.knowledge);
  const languages = repertoire?.languages ?? [];
  const confirmedPerson = catalog?.people.find((person) => person.referenceAdequacy === "confirmed") ?? null;
  const base: [CalibrationCase, CalibrationCase, CalibrationCase, CalibrationCase] = [
    { slot: 0, languageId: null, personId: null },
    { slot: 1, languageId: languages[0]?.id ?? null, personId: null },
    languages[1]
      ? { slot: 2, languageId: languages[1].id, personId: null }
      : confirmedPerson
        ? { slot: 2, languageId: null, personId: confirmedPerson.id }
        : { slot: 2, languageId: null, personId: null },
    { slot: 3, languageId: null, personId: null },
  ];
  const history = input.priorRounds ?? (input.priorRound ? [input.priorRound] : []);
  // Only the trailing same-candidate suffix chains: the round before it
  // tested another candidate, so its plan was the base plan above.
  let chainStart = history.length;
  while (chainStart > 0 && history[chainStart - 1]!.candidate.hash === input.candidate.hash) {
    chainStart -= 1;
  }
  const chain = history.slice(chainStart);
  if (chain.length === 0) return base;
  // Slots 0-2 never change while the candidate is unchanged; only the slot 3
  // retest target threads through the chain.
  const retestTargetOf = (
    plan: [CalibrationCase, CalibrationCase, CalibrationCase, CalibrationCase],
    slots: Pick<CalibrationRound, "slots">["slots"],
  ): CalibrationCase => {
    const badSlot = slots.find((slot) => slot.feedback?.rating === "bad");
    const target = badSlot ? plan[badSlot.index] : plan[0];
    return { slot: 3, languageId: target!.languageId, personId: target!.personId };
  };
  // Rebuild what each chained round exercised: the first one ran the base
  // plan, each later one retested its predecessor's worst slot.
  let priorPlan: [CalibrationCase, CalibrationCase, CalibrationCase, CalibrationCase] = [
    base[0]!,
    base[1]!,
    base[2]!,
    base[3]!,
  ];
  for (let index = 1; index < chain.length; index += 1) {
    priorPlan = [base[0]!, base[1]!, base[2]!, retestTargetOf(priorPlan, chain[index - 1]!.slots)];
  }
  return [base[0]!, base[1]!, base[2]!, retestTargetOf(priorPlan, chain[chain.length - 1]!.slots)];
}

function caseRuleIds(
  learned: CalibrationLearnedContent,
  target: Pick<CalibrationCase, "languageId">,
): string[] {
  const language = target.languageId
    ? (learned.repertoire?.languages.find((entry) => entry.id === target.languageId) ?? null)
    : null;
  const rules = language ? language.rules : (learned.repertoire?.common ?? []);
  return rules.map((rule) => rule.id);
}

/**
 * Coverage IDs of a candidate: the ordered distinct language, person and
 * rule IDs its four deterministic cases exercise, capped like round
 * coverage. Shown in the review UI next to the IDs left unexercised; never
 * a claim of exhaustive brand validation.
 */
function fullCalibrationCoverage(
  candidate: Pick<Candidate, "hash" | "knowledge">,
  priorRound?: Pick<CalibrationRound, "candidate" | "slots"> | null,
  priorRounds?: ReadonlyArray<Pick<CalibrationRound, "candidate" | "slots">> | null,
): string[] {
  const learned = learnedContentOf(candidate.knowledge);
  const cases = planCalibrationCases({
    candidate,
    priorRound: priorRound ?? null,
    priorRounds: priorRounds ?? null,
  });
  // Case targets first so a long rule list never pushes the exercised
  // language/person IDs out of the capped coverage; rule IDs follow in the
  // same slot order.
  const ordered: string[] = [];
  for (const target of cases) {
    if (target.languageId) ordered.push(target.languageId);
    if (target.personId) ordered.push(target.personId);
  }
  for (const target of cases) {
    ordered.push(...caseRuleIds(learned, target));
  }
  return [...new Set(ordered)];
}

/** Persisted display metadata is bounded; coverage decisions use the full set. */
export function calibrationCoverage(
  candidate: Pick<Candidate, "hash" | "knowledge">,
  priorRound?: Pick<CalibrationRound, "candidate" | "slots"> | null,
  priorRounds?: ReadonlyArray<Pick<CalibrationRound, "candidate" | "slots">> | null,
): string[] {
  return fullCalibrationCoverage(candidate, priorRound, priorRounds).slice(0, CALIBRATION_COVERAGE_LIMIT);
}

/**
 * Reviewed language, rule and person IDs the round coverage does not
 * exercise. Deterministic order: languages (id, then their rules), common
 * rules, people. The review shows these next to the covered IDs so four
 * cases never read as exhaustive brand validation.
 */
export function uncoveredTrainingIds(input: {
  candidate: Pick<Candidate, "hash" | "knowledge">;
  priorRounds?: ReadonlyArray<Pick<CalibrationRound, "candidate" | "slots">>;

}): string[] {
  const learned = learnedContentOf(input.candidate.knowledge);
  const all: string[] = [];
  for (const language of learned.repertoire?.languages ?? []) {
    all.push(language.id, ...language.rules.map((rule) => rule.id));
  }
  all.push(...(learned.repertoire?.common.map((rule) => rule.id) ?? []));
  all.push(...(learned.catalog?.people.map((person) => person.id) ?? []));
  const covered = new Set(fullCalibrationCoverage(input.candidate, null, input.priorRounds));
  return [...new Set(all)].filter((id) => !covered.has(id));
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
