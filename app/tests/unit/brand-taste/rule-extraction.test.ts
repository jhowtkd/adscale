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
      { kind: "output_decision", id: "note", note: "Reforçar hierarquia\nAbrir espaço", occurredAt: decisions[0].createdAt.toISOString() },
    ]);
    expect(extractRuleCandidatesFromSignals({ clientProfileId: "client-1", signals: [], decisions: decisions.slice(0, 1) })).toEqual([]);
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
