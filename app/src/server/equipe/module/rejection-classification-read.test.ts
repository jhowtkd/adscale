import { describe, expect, it } from "vitest";
import type { EquipeEvent } from "../data";
import { currentClassificationIds } from "./rejection-classification-read";

const round = "00000000-0000-4000-8000-000000000001";
const item = "00000000-0000-4000-8000-000000000002";
const requestA = "00000000-0000-4000-8000-00000000000a";
const requestB = "00000000-0000-4000-8000-00000000000b";

function classification(id: string, to: "fact" | "brand" | "taste", adjustmentSourceEventId: string, classificationSequence: number): EquipeEvent {
  return {
    id, eventType: "round.rejection_classified", objectType: "round", objectId: round,
    actorType: "staff", actorId: "quality-1", actorRole: "quality",
    payload: { itemId: item, from: "voice", to, evidence: null, loosened: false, adjustmentSourceEventId, versionHash: "hash", classificationSequence },
  } as unknown as EquipeEvent;
}

describe("currentClassificationIds", () => {
  it("lets a newer adjustment request win even though its sequence restarts at one", () => {
    const events = [classification("a1", "fact", requestA, 1), classification("a2", "taste", requestA, 2), classification("b1", "fact", requestB, 1)];
    expect([...currentClassificationIds(events)]).toEqual(["b1"]);
  });

  it("orders classifications of the same request by sequence when the ledger ties them", () => {
    const events = [classification("a2", "taste", requestA, 2), classification("a1", "fact", requestA, 1)];
    expect([...currentClassificationIds(events)]).toEqual(["a2"]);
  });
});
