import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CAROUSEL_GATE_BRANDS,
  CAROUSEL_GATE_INPUT_KINDS,
  evaluateCarouselHumanGate,
  runCarouselHumanGateCheck,
  validateCarouselGateEvidenceShape,
  type CarouselGateEntry,
} from "./check-carousel-human-gate";

function entry(overrides: Partial<CarouselGateEntry> = {}): CarouselGateEntry {
  return {
    brand: "nike",
    inputKind: "short_idea",
    slideCount: 5,
    inventedFacts: 0,
    corruptedTexts: 0,
    visualLanguage: "single_system",
    narrativeProgression: "clear",
    selfContainedFailures: 0,
    reviewer: "Ana revisora",
    artifactIds: ["work-1"],
    ...overrides,
  };
}

function completeEntries(): CarouselGateEntry[] {
  return CAROUSEL_GATE_BRANDS.flatMap((brand) =>
    CAROUSEL_GATE_INPUT_KINDS.map((inputKind) => entry({ brand, inputKind })),
  );
}

describe("check-carousel-human-gate", () => {
  it("covers exactly three named brands crossed with the three input kinds", () => {
    expect(CAROUSEL_GATE_BRANDS).toEqual(["nike", "mtv", "absolut"]);
    expect(CAROUSEL_GATE_INPUT_KINDS).toEqual(["short_idea", "long_text", "pre_split"]);
    expect(CAROUSEL_GATE_BRANDS.flatMap((brand) => CAROUSEL_GATE_INPUT_KINDS.map((inputKind) => `${brand}:${inputKind}`)))
      .toHaveLength(9);
  });

  it("accepts a fully passing nine-entry review", () => {
    const result = evaluateCarouselHumanGate(completeEntries());
    expect(result).toEqual({ accepted: true, singleSystemCount: 9, clearProgressionCount: 9 });
  });

  it("rejects fewer than nine entries", () => {
    const entries = completeEntries().slice(0, 8);
    expect(evaluateCarouselHumanGate(entries).accepted).toBe(false);
  });

  it("rejects any invented fact or corrupted text", () => {
    const entries = completeEntries();
    entries[4]!.inventedFacts = 1;
    expect(evaluateCarouselHumanGate(entries).accepted).toBe(false);
    const corrupted = completeEntries();
    corrupted[0]!.corruptedTexts = 2;
    expect(evaluateCarouselHumanGate(corrupted).accepted).toBe(false);
  });

  it("accepts at most one deck off on each subjective verdict", () => {
    const visual = completeEntries();
    visual[3]!.visualLanguage = "mixed";
    expect(evaluateCarouselHumanGate(visual)).toMatchObject({ accepted: true, singleSystemCount: 8 });
    const narrative = completeEntries();
    narrative[7]!.narrativeProgression = "confusing";
    expect(evaluateCarouselHumanGate(narrative)).toMatchObject({ accepted: true, clearProgressionCount: 8 });
    const twoOff = completeEntries();
    twoOff[3]!.visualLanguage = "mixed";
    twoOff[5]!.visualLanguage = "mixed";
    expect(evaluateCarouselHumanGate(twoOff).accepted).toBe(false);
  });

  it("rejects any self-contained failure", () => {
    const entries = completeEntries();
    entries[8]!.selfContainedFailures = 1;
    expect(evaluateCarouselHumanGate(entries).accepted).toBe(false);
  });

  it("validates the evidence shape: all nine cells, reviewer and artifact ids", () => {
    expect(() => validateCarouselGateEvidenceShape({
      schemaVersion: 1,
      status: "completed",
      reviewedAt: "2026-09-01T00:00:00.000Z",
      entries: completeEntries(),
    })).not.toThrow();
    expect(() => validateCarouselGateEvidenceShape({
      schemaVersion: 1,
      status: "completed",
      reviewedAt: null,
      entries: completeEntries().filter((_, index) => index !== 4),
    })).toThrow(/exactly 9 entries/);
    expect(() => validateCarouselGateEvidenceShape({
      schemaVersion: 1,
      status: "completed",
      reviewedAt: null,
      entries: completeEntries().map((item, index) => index === 2 ? { ...item, reviewer: " " } : item),
    })).toThrow(/human reviewer/);
    expect(() => validateCarouselGateEvidenceShape({
      schemaVersion: 1,
      status: "completed",
      reviewedAt: null,
      entries: completeEntries().map((item, index) => index === 2 ? { ...item, artifactIds: [] } : item),
    })).toThrow(/artifact id/);
    expect(() => validateCarouselGateEvidenceShape({
      schemaVersion: 1,
      status: "completed",
      reviewedAt: null,
      entries: completeEntries().map((item, index) => index === 2 ? { ...item, slideCount: 4 } : item),
    })).toThrow(/between 5 and 8/);
  });

  it("reports pending for the template state and fails the file run", () => {
    const file = path.join(os.tmpdir(), `carousel-gate-${crypto.randomUUID()}.json`);
    fs.writeFileSync(file, JSON.stringify({
      schemaVersion: 1,
      status: "pending_human_review",
      reviewedAt: null,
      entries: [],
    }));
    try {
      expect(runCarouselHumanGateCheck(file)).toMatchObject({
        accepted: false,
        detail: expect.stringContaining("PENDING"),
      });
    } finally {
      fs.rmSync(file, { force: true });
    }
  });

  it("passes a completed evidence file end to end", () => {
    const file = path.join(os.tmpdir(), `carousel-gate-${crypto.randomUUID()}.json`);
    fs.writeFileSync(file, JSON.stringify({
      schemaVersion: 1,
      status: "completed",
      reviewedAt: "2026-09-01T00:00:00.000Z",
      entries: completeEntries(),
    }));
    try {
      expect(runCarouselHumanGateCheck(file).accepted).toBe(true);
    } finally {
      fs.rmSync(file, { force: true });
    }
  });
});
