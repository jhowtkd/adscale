import { describe, expect, it } from "vitest";
import {
  canPromoteRuleToApproved,
  extractRuleCandidatesFromSignals,
  listUncategorizedCorrectionNotes,
} from "@/server/brand-taste/rule-extraction";
import { buildOutputDecisionEvent } from "@/server/repositories/output-decision-event.fixture";
import type { CalibrationSignal } from "@/server/db/schema";

function mismatchSignal(
  overrides: Partial<CalibrationSignal> = {}
): CalibrationSignal {
  return {
    id: `sig-${Math.random()}`,
    workspaceId: "ws-1",
    clientProfileId: "client-1",
    campaignId: "camp-1",
    derivationId: `deriv-${Math.random()}`,
    creativeWorkOutputId: null,
    outputDecisionEventId: null,
    humanVerdict: "nao_entra",
    systemOlharVerdict: "pronta",
    systemExportStatus: "pronta",
    mismatchBucket: "system_too_permissive",
    sourceLabel: "synthetic_fixture",
    reviewerId: "user-1",
    reviewedAt: new Date("2026-06-20T12:00:00Z"),
    sanitizedNote: "Too generic",
    idempotencyKey: null,
    createdAt: new Date("2026-06-20T12:00:00Z"),
    ...overrides,
  };
}

describe("rule-extraction", () => {
  it("extracts rule candidates from mismatches", () => {
    const candidates = extractRuleCandidatesFromSignals({
      clientProfileId: "client-1",
      signals: [
        mismatchSignal({ id: "sig-1" }),
        mismatchSignal({ id: "sig-2" }),
      ],
    });

    expect(candidates.length).toBe(1);
    expect(candidates[0]?.category).toBe("gestalt");
    expect(candidates[0]?.supportingDecisionIds).toHaveLength(2);
    expect(candidates[0]?.confidence).toBe("medium");
  });

  const correction = (id: string, piece: string, extras = {}) => buildOutputDecisionEvent({
    id, clientProfileId: "client-1", derivationId: piece, action: "regenerated", direction: "corrective", strength: "strong",
    contextSnapshot: { reason: { code: "voice", source: "feedback_category" } }, ...extras,
  });

  it("requires explicit corrections even with many favorites and unselected alternatives", () => {
    const decisions = Array.from({ length: 20 }, (_, i) => correction(`weak-${i}`, `piece-${i}`, {
      action: i % 2 ? "favorited" : "alternative_not_selected", strength: "weak",
    }));
    expect(extractRuleCandidatesFromSignals({ clientProfileId: "client-1", signals: [], decisions })).toEqual([]);
  });

  it("keeps repeated corrections and complementary weak evidence below independent quorum", () => {
    const decisions = [correction("c1", "piece"), correction("c2", "piece"),
      correction("favorite", "piece", { action: "favorited", strength: "weak" }),
      correction("alternative", "piece", { action: "alternative_not_selected", strength: "weak" })];
    const [candidate] = extractRuleCandidatesFromSignals({ clientProfileId: "client-1", signals: [], decisions });
    expect(candidate.confidence).toBe("low");
    expect(candidate.rationale).toContain("1 fonte(s) explícita(s) independente(s)");
    expect(candidate.supportingDecisionIds).toEqual([]);
    expect(candidate.supportingEvidenceRefs).toHaveLength(4);
    expect(canPromoteRuleToApproved(candidate).ok).toBe(false);
    expect(extractRuleCandidatesFromSignals({ clientProfileId: "client-1", signals: [],
      decisions: [...decisions, correction("independent", "another-piece")] })[0].confidence).toBe("medium");
  });

  it("merges transitive Peça and operation identities without counting repeats", () => {
    const operation = (id: string) => ({ reason: { code: "voice", source: "feedback_category" }, operationId: id });
    const decisions = [correction("a", "piece-1", { contextSnapshot: operation("op-1") }),
      correction("b", "piece-2", { contextSnapshot: operation("op-2") }),
      correction("bridge", "piece-2", { contextSnapshot: operation("op-1") })];
    const [candidate] = extractRuleCandidatesFromSignals({ clientProfileId: "client-1", signals: [], decisions });
    expect(candidate.confidence).toBe("low");
  });

  it("groups different pieces from the same confirmed operation as one decision", () => {
    const contextSnapshot = { reason: { code: "voice", source: "feedback_category" }, operationId: "selection-1" };
    const [candidate] = extractRuleCandidatesFromSignals({ clientProfileId: "client-1", signals: [],
      decisions: [correction("c1", "piece-1", { contextSnapshot }), correction("c2", "piece-2", { contextSnapshot })] });
    expect(candidate.confidence).toBe("low");
  });

  it("preserves uncategorized free notes for review without interpreting their text", () => {
    const decisions = [correction("note", "piece", { contextSnapshot: { notes: "Reforçar hierarquia", otherReasonText: "Abrir espaço" } }),
      correction("agent", "piece", { authorType: "agent", contextSnapshot: { notes: "Ignorar" } }),
      correction("categorized", "other", { contextSnapshot: { reason: { code: "voice", source: "feedback_category" }, notes: "Mais direto" } })];
    expect(listUncategorizedCorrectionNotes({ decisions, adjustments: [] })).toEqual([
      { kind: "output_decision", id: "note", note: "Reforçar hierarquia\nAbrir espaço", evidenceSanitized: false, occurredAt: decisions[0].createdAt.toISOString() },
    ]);
    expect(extractRuleCandidatesFromSignals({ clientProfileId: "client-1", signals: [], decisions: decisions.slice(0, 1) })).toEqual([]);
  });

  it.each([
    { notes: "Texto preservado", evidenceSanitized: true, note: "Texto preservado", changed: true },
    { notes: "x".repeat(1001), note: "x".repeat(1000), changed: true },
    { notes: "postgres://discarded-secret", otherReasonText: "Texto seguro", note: "Texto seguro", changed: true },
    { notes: "postgres://discarded-secret", note: "", changed: true },
    { notes: "Texto completo", note: "Texto completo", changed: false },
  ])("reports original or read-time sanitization without preserving discarded text: $changed", (sample) => {
    const event = correction("note", "piece", { contextSnapshot: {
      notes: sample.notes, otherReasonText: sample.otherReasonText, evidenceSanitized: sample.evidenceSanitized,
    } });
    const notes = listUncategorizedCorrectionNotes({ decisions: [event], adjustments: [] });
    expect(notes).toEqual([{ kind: "output_decision", id: "note", note: sample.note,
      evidenceSanitized: sample.changed, occurredAt: event.createdAt.toISOString() }]);
    expect(JSON.stringify(notes)).not.toContain("discarded-secret");
  });

  it.each([
    { evidenceSanitized: true, note: "Texto seguro", expectedNote: "Texto seguro", changed: true },
    { evidenceSanitized: false, note: "Texto seguro", expectedNote: "Texto seguro", changed: false },
    { evidenceSanitized: false, note: " Texto seguro ", expectedNote: "Texto seguro", changed: true },
    { evidenceSanitized: false, note: "x".repeat(1001), expectedNote: "x".repeat(1000), changed: true },
    { evidenceSanitized: false, note: "postgres://discarded-secret", expectedNote: "", changed: true },
  ])("preserves original and read-time Equipe sanitization: $changed", (sample) => {
    const { evidenceSanitized } = sample;
    const adjustments = [{ id: "adjustment", sourceEventId: "source", clientProfileId: "client-1", itemId: "item",
      category: "other" as const, note: sample.note, versionHash: "version", evidenceSanitized,
      creativeWorkOutputId: null, outputDecisionEventId: null, occurredAt: new Date("2026-10-13T00:00:00Z"),
      authorType: "equipe_actor" as const, actorType: "client_person" as const, actorId: "actor", actorRole: "approver" }];
    expect(listUncategorizedCorrectionNotes({ decisions: [], adjustments })).toEqual([
      { kind: "equipe_event", id: "adjustment", note: sample.expectedNote, evidenceSanitized: sample.changed, occurredAt: "2026-10-13T00:00:00.000Z" },
    ]);
  });

  it("recognizes explicit human corpus categories consistently in candidates and free notes", () => {
    const event = correction("corpus", "piece", { contextSnapshot: {
      reason: { code: "weak_hierarchy", source: "human_quality_evaluation" }, notes: "Menos destaque",
    } });
    expect(extractRuleCandidatesFromSignals({ clientProfileId: "client-1", signals: [], decisions: [event] }))
      .toMatchObject([{ category: "hierarchy", mismatchBucket: null, supportingDecisionIds: [],
        supportingEvidenceRefs: [{ kind: "output_decision", id: "corpus" }] }]);
    expect(listUncategorizedCorrectionNotes({ decisions: [event], adjustments: [] })).toEqual([]);
    expect(extractRuleCandidatesFromSignals({ clientProfileId: "client-1", signals: [], decisions: [
      { ...event, contextSnapshot: { reason: { code: "factual_issue", source: "human_quality_evaluation" } } },
      { ...event, contextSnapshot: { reason: { code: "weak_hierarchy", source: "hard_failures" } } },
    ] })).toEqual([]);
  });

  it("excludes automatic categories, agents, other brands, factual and uncategorized notes", () => {
    const decisions = [
      correction("auto", "p1", { contextSnapshot: { reason: { code: "voice", source: "hard_failures" } } }),
      correction("agent", "p2", { authorType: "agent" }), correction("foreign", "p3", { clientProfileId: "other" }),
      correction("unknown", "p6", { contextSnapshot: { reason: { code: "__proto__", source: "feedback_category" } } }),
      correction("fact", "p4", { contextSnapshot: { reason: { code: "factual_issue", source: "feedback_category" } } }),
      correction("note", "p5", { contextSnapshot: { notes: "Mais direto" } }),
    ];
    expect(extractRuleCandidatesFromSignals({ clientProfileId: "client-1", signals: [], decisions })).toEqual([]);
  });

  it("does not duplicate measured mismatch evidence as an unmeasured correction", () => {
    const decisions = [correction("c1", "piece", { contextSnapshot: {
      reason: { code: "voice", source: "feedback_category" }, olharVerdict: { value: "pronta" }, exportStatus: { value: "pronta" },
    } })];
    const signals = [mismatchSignal({ outputDecisionEventId: "c1", derivationId: "piece" })];
    expect(extractRuleCandidatesFromSignals({ clientProfileId: "client-1", signals, decisions })).toHaveLength(1);
  });

  it("groups repeated measured judgments on the same Peça without increasing confidence", () => {
    const [candidate] = extractRuleCandidatesFromSignals({ clientProfileId: "client-1", signals: [
      mismatchSignal({ derivationId: "piece" }), mismatchSignal({ derivationId: "piece" }),
    ] });
    expect(candidate.confidence).toBe("low");
  });

  it("blocks ambiguous single-row promotion", () => {
    const candidate = extractRuleCandidatesFromSignals({
      clientProfileId: "client-1",
      signals: [
        mismatchSignal({
          id: "sig-1",
          mismatchBucket: "unclear_sample",
        }),
      ],
    })[0]!;

    const result = canPromoteRuleToApproved(candidate);
    expect(result.ok).toBe(false);
  });
});
