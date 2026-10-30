import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { creativeWorkCarouselSlides, creativeWorkItems, creativeWorkOutputs } from "../db/schema";
import {
  assessCalibrationSlot,
  calibrationDraftKey,
  slotApproved,
  type CalibrationRound,
  type CalibrationSlotRefinement,
  type SlotAssessment,
} from "../brand-training/calibration";
import {
  hasCalibrationVisualScope,
  planCalibrationScopes,
  type CalibrationGuidanceSnapshot,
  type CalibrationRefinementPlan,
} from "../brand-training/visual-guidance-contract";

type Reader = Pick<typeof db, "select">;
type SlotIndex = 0 | 1 | 2 | 3;
type OutputRow = typeof creativeWorkOutputs.$inferSelect;
type ExampleOutput = Pick<OutputRow, "id" | "status" | "quality" | "outputKey" | "parentOutputId" | "frozenGuidance"> & {
  targetFormat: OutputRow["targetFormat"] | null;
};

export type CalibrationExampleEvidence = {
  round: number;
  slot: SlotIndex;
  generationMode: string;
  format: string;
  workItemId: string;
  work: typeof creativeWorkItems.$inferSelect | null;
  output: ExampleOutput | null;
  outputId: string | null;
  refinement: CalibrationSlotRefinement | null;
  assessment: SlotAssessment;
  /** Operator-approved as of now; a refinement also needs its Peça-base to remain approved. */
  approved: boolean;
};

export type CalibrationPendingProof = {
  generationMode: string;
  format: string;
  reason: "no_base" | "awaiting_round" | "not_approved";
};

const REFINEMENT_SCOPES = [
  { generationMode: "creative_revision", format: "4:5" },
  { generationMode: "creative_revision", format: "9:16" },
  { generationMode: "format_adaptation", format: "9:16" },
] as const;

/** The trailing rounds of one candidate: anything before them validated other content. */
function calibrationChain(rounds: readonly CalibrationRound[], candidateHash: string) {
  let start = rounds.length;
  while (start > 0 && rounds[start - 1]!.candidate.hash === candidateHash) start -= 1;
  return rounds.slice(start);
}

/** Every example of a candidate's chain, judged from persisted state only, in round and slot order. */
export async function loadCalibrationExampleEvidence(
  input: { workspaceId: string; sessionId: string; rounds: readonly CalibrationRound[]; candidateHash: string },
  reader: Reader = db,
): Promise<CalibrationExampleEvidence[]> {
  const chain = calibrationChain(input.rounds, input.candidateHash);
  const workIds = [...new Set(chain.flatMap(round => round.slots.map(slot => slot.workItemId)))];
  if (!workIds.length) return [];
  const works = await reader.select().from(creativeWorkItems).where(and(
    eq(creativeWorkItems.workspaceId, input.workspaceId), inArray(creativeWorkItems.id, workIds),
  ));
  const outputs = await reader.select().from(creativeWorkOutputs).where(and(
    eq(creativeWorkOutputs.workspaceId, input.workspaceId), inArray(creativeWorkOutputs.workItemId, workIds),
  ));
  const carouselIds = works.filter(work => work.toolKind === "carousel").map(work => work.id);
  const slides = carouselIds.length ? await reader.select().from(creativeWorkCarouselSlides).where(and(
    eq(creativeWorkCarouselSlides.workspaceId, input.workspaceId), inArray(creativeWorkCarouselSlides.workItemId, carouselIds),
    eq(creativeWorkCarouselSlides.position, 1), eq(creativeWorkCarouselSlides.isCurrent, true),
  )) : [];
  const examples = chain.flatMap(round => round.slots.map((slot): CalibrationExampleEvidence => {
    const work = works.find(row => row.id === slot.workItemId) ?? null;
    const carousel = work?.toolKind === "carousel";
    const rows = outputs.filter(row => row.workItemId === slot.workItemId);
    // A base work also holds its refinements: the operation key tells them apart, never the row order.
    const operationKey = `revision:${calibrationDraftKey(input.sessionId, round.number, slot.index)}`;
    const slide = carousel
      ? slides.find(row => row.workItemId === slot.workItemId && (!slot.outputId || row.id === slot.outputId))
        ?? slides.find(row => row.workItemId === slot.workItemId) : null;
    const output: ExampleOutput | null = carousel
      ? slide ? {
        id: slide.id,
        status: slide.status === "draft" ? "queued" : slide.status,
        quality: slide.quality,
        outputKey: slide.outputKey,
        parentOutputId: null,
        targetFormat: null,
        frozenGuidance: null,
      } : null
      : slot.refinement
        ? rows.find(row => row.operationKey === operationKey) ?? null
        : rows.find(row => row.id === slot.outputId) ?? rows.find(row => !row.parentOutputId) ?? null;
    const outputId = output?.id ?? slot.outputId;
    const assessment = assessCalibrationSlot({
      output,
      outputId,
      feedback: slot.feedback,
    });
    return {
      round: round.number,
      slot: slot.index,
      generationMode: slot.refinement?.generationMode ?? (carousel ? "carousel" : "single"),
      format: slot.refinement?.format ?? work?.format ?? "4:5",
      workItemId: slot.workItemId,
      work,
      output,
      outputId,
      refinement: slot.refinement ?? null,
      assessment,
      approved: slotApproved(assessment),
    };
  }));
  return examples.map(example => {
    const refinement = example.refinement;
    if (!refinement) return example;
    const base = examples.find(entry => entry.round === refinement.baseRound && entry.slot === refinement.baseSlot);
    return { ...example, approved: example.approved && Boolean(base?.approved && base.outputId === refinement.baseOutputId) };
  });
}

/** Peça-base per format and what the candidate already proved, read before planning a round. */
export function calibrationRefinementPlan(evidence: readonly CalibrationExampleEvidence[]): CalibrationRefinementPlan {
  const baseOf = (format: "4:5" | "9:16") => {
    const newest = evidence.filter(example => !example.refinement && example.approved && example.generationMode === "single"
      && example.format === format && example.output?.outputKey && !example.output.parentOutputId);
    const round = newest[newest.length - 1]?.round;
    const example = newest.find(entry => entry.round === round);
    return example?.outputId
      ? { round: example.round, slot: example.slot, workItemId: example.workItemId, outputId: example.outputId }
      : undefined;
  };
  const [portrait, story] = [baseOf("4:5"), baseOf("9:16")];
  return {
    bases: { ...(portrait ? { "4:5": portrait } : {}), ...(story ? { "9:16": story } : {}) },
    approvedRevisionFormats: REFINEMENT_SCOPES.filter(scope => scope.generationMode === "creative_revision"
      && isProved(latestScopeExamples(evidence, scope))).map(scope => scope.format),
  };
}

/** The freshest judgement of a scope; an older round never outvotes a later one. */
export function latestScopeExamples(
  evidence: readonly CalibrationExampleEvidence[],
  scope: { generationMode: string; format: string },
): CalibrationExampleEvidence[] {
  const matching = evidence.filter(example => example.generationMode === scope.generationMode && example.format === scope.format);
  const round = matching[matching.length - 1]?.round;
  return matching.filter(example => example.round === round);
}

const isProved = (examples: readonly CalibrationExampleEvidence[]) =>
  examples.length > 0 && examples.every(example => example.approved);

/** Refinement scopes that activate without proof if the operator stops now, and why. */
export function calibrationProofPending(
  snapshot: CalibrationGuidanceSnapshot | undefined,
  evidence: readonly CalibrationExampleEvidence[],
): CalibrationPendingProof[] {
  const { bases } = calibrationRefinementPlan(evidence);
  const latestRound = evidence[evidence.length - 1]?.round;
  return REFINEMENT_SCOPES.flatMap((scope): CalibrationPendingProof[] => {
    if (!hasCalibrationVisualScope(snapshot, scope)) return [];
    const examples = latestScopeExamples(evidence, scope);
    if (isProved(examples) || examples.some(example => example.round === latestRound && example.assessment.rating === null)) return [];
    const base = bases[scope.generationMode === "format_adaptation" ? "4:5" : scope.format];
    return [{ ...scope, reason: examples.length ? "not_approved" : base ? "awaiting_round" : "no_base" }];
  });
}

/** Whether the next round would exercise a refinement scope that still has no proof. */
export function calibrationRefinementDue(
  snapshot: CalibrationGuidanceSnapshot | undefined,
  evidence: readonly CalibrationExampleEvidence[],
): boolean {
  return planCalibrationScopes(snapshot, calibrationRefinementPlan(evidence))
    .some(scope => scope.base && !isProved(latestScopeExamples(evidence, scope)));
}
