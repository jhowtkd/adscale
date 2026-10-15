// Read side of the quality rejection classification evidence: pure parsing and the
// latest-classification rule, so readers (brand evidence, factual alerts) need neither the
// consumer nor the command contracts.
import { z } from "zod";
import type { EquipeEvent } from "../data";
import { ADJUSTMENT_CATEGORIES, QUALITY_CLASSIFICATIONS, ROUND_REJECTION_CLASSIFIED_EVENT } from "./rejection-vocabulary";

export const REJECTION_CLASSIFICATION_EVIDENCE_EVENT = "learning.rejection_classification_recorded";
export const REJECTION_FACTUAL_ALERT_EVENT = "learning.rejection_factual_alert";

const adjustmentRef = {
  adjustmentSourceEventId: z.string().uuid().nullable().optional(), versionHash: z.string().min(1).max(120).nullable().optional(),
  classificationSequence: z.number().int().positive().nullable().optional(),
};
export const classificationSourceSchema = z.object({
  itemId: z.string().uuid(), from: z.enum(ADJUSTMENT_CATEGORIES),
  to: z.enum(QUALITY_CLASSIFICATIONS), evidence: z.string().max(4000).nullable(), loosened: z.boolean(),
  ...adjustmentRef,
});
export const classificationEvidenceSchema = z.object({
  sourceEventId: z.string().uuid(), clientProfileId: z.string().uuid(), itemId: z.string().uuid(), roundId: z.string().uuid(),
  from: z.enum(ADJUSTMENT_CATEGORIES), category: z.enum(QUALITY_CLASSIFICATIONS),
  evidence: z.string().max(1000).nullable(), evidenceSanitized: z.boolean(), loosened: z.boolean(),
  ...adjustmentRef,
});

export function isQualityActor(event: EquipeEvent): event is EquipeEvent & { actorType: "staff"; actorId: string; actorRole: "quality" } {
  return event.actorType === "staff" && event.actorRole === "quality" && Boolean(event.actorId?.trim());
}

export function isFactuallyClassifiedAdjustment(events: EquipeEvent[], sourceEventId: string, versionHash: string): boolean {
  let latest: z.infer<typeof classificationSourceSchema> | null = null;
  for (const event of events) {
    if (event.eventType !== ROUND_REJECTION_CLASSIFIED_EVENT || event.objectType !== "round" || !isQualityActor(event)) continue;
    const parsed = classificationSourceSchema.safeParse(event.payload);
    if (parsed.success && parsed.data.adjustmentSourceEventId === sourceEventId && parsed.data.versionHash === versionHash &&
        parsed.data.classificationSequence && parsed.data.classificationSequence > (latest?.classificationSequence ?? 0)) latest = parsed.data;
  }
  return latest?.to === "fact";
}

/**
 * Ids of the classification events still in force: the latest one per round and Item wins, as in
 * roundItemQuality. Events come in ledger order; the sequence breaks ties between equal timestamps.
 */
export function currentClassificationIds(events: EquipeEvent[]): Set<string> {
  const latest = new Map<string, { id: string; sequence: number }>();
  for (const event of events) {
    if (event.eventType !== ROUND_REJECTION_CLASSIFIED_EVENT || event.objectType !== "round" || !event.objectId || !isQualityActor(event)) continue;
    const parsed = classificationSourceSchema.safeParse(event.payload);
    if (!parsed.success) continue;
    const key = `${event.objectId}:${parsed.data.itemId}`;
    const sequence = parsed.data.classificationSequence ?? 0;
    if (sequence >= (latest.get(key)?.sequence ?? 0)) latest.set(key, { id: event.id, sequence });
  }
  return new Set([...latest.values()].map(entry => entry.id));
}

export function readRejectionClassificationEvidence(event: EquipeEvent, clientProfileId: string) {
  const parsed = classificationEvidenceSchema.safeParse(event.payload);
  if (!parsed.success || parsed.data.clientProfileId !== clientProfileId || !isQualityActor(event) ||
      event.objectType !== "learning_evidence" || event.objectId !== parsed.data.sourceEventId ||
      event.eventType !== (parsed.data.category === "fact" ? REJECTION_FACTUAL_ALERT_EVENT : REJECTION_CLASSIFICATION_EVIDENCE_EVENT)) return null;
  return { ...parsed.data, id: event.id, occurredAt: event.occurredAt,
    authorType: "equipe_actor" as const, actorType: event.actorType, actorId: event.actorId, actorRole: event.actorRole };
}
