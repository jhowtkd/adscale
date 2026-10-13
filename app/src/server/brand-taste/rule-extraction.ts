import { sanitizeCalibrationNote } from "../output-learning/output-decision-events";
import { isHumanDecisionAuthor } from "@/server/output-learning/output-decision-author";
import { outputDecisionContexts, countIndependentDecisionContexts } from "./decision-evidence";
import type { listAdjustmentEvidenceForBrand } from "@/server/equipe/module/adjustment-evidence";
import type { ProposalEvidenceRef } from "./proposal-evidence-types";
import type { OutputDecisionEvent, CalibrationSignal } from "@/server/db/schema";
import {
  classifyAgreement,
  inferMismatchBucket,
  type HumanCalibrationDecision,
} from "@/server/olhar-calibration/cenbrap-calibration";
import type {
  ExportStatusValue,
  OlharVerdictValue,
} from "@/server/ai/olhar/dual-verdict";
import type {
  CalibrationMismatchBucket,
  CalibrationRuleCandidate,
  RuleCategory,
} from "./calibration-signal-types";

const BUCKET_TO_CATEGORY: Record<CalibrationMismatchBucket, RuleCategory> = {
  system_too_permissive: "gestalt",
  system_too_harsh: "figure",
  voice_nuance: "voice",
  export_setup_issue: "export_conflict",
  acceptable_override: "brand_nuance",
  unclear_sample: "brand_nuance",
};

function ruleRationale(input: {
  bucket: CalibrationMismatchBucket;
  supportCount: number;
  sampleNote: string | null;
}): string {
  const base = {
    system_too_permissive:
      "System was too permissive — tighten art-direction gate for this brand.",
    system_too_harsh:
      "System was too harsh — allow acceptable overrides for this brand.",
    voice_nuance:
      "Voice/gestalt nuance — quase decisions indicate refinement boundaries.",
    export_setup_issue:
      "Export setup conflicts with human judgment — separate Olhar from export.",
    acceptable_override:
      "Human override is acceptable for this brand context.",
    unclear_sample: "Ambiguous sample — rule needs more calibration data.",
  }[input.bucket];

  const note = input.sampleNote ? ` Sample note: ${input.sampleNote.slice(0, 200)}` : "";
  return `${base} (${input.supportCount} supporting decision(s)).${note}`;
}

function confidenceFromSupport(count: number): "low" | "medium" | "high" {
  if (count >= 3) return "high";
  if (count >= 2) return "medium";
  return "low";
}

export function extractRuleCandidatesFromSignals(input: {
  clientProfileId: string;
  signals: CalibrationSignal[];
  decisions?: OutputDecisionEvent[];
  adjustments?: Awaited<ReturnType<typeof listAdjustmentEvidenceForBrand>>;
}): CalibrationRuleCandidate[] {
  const mismatches = input.signals.filter((signal) => {
    if (!isHumanDecisionAuthor(signal)) return false;
    const agreement = classifyAgreement({
      olharVerdict: signal.systemOlharVerdict as OlharVerdictValue | null,
      exportStatus: signal.systemExportStatus as ExportStatusValue | null,
      humanDecision: signal.humanVerdict as HumanCalibrationDecision,
    });
    return agreement === "mismatch";
  });

  const grouped = new Map<CalibrationMismatchBucket, CalibrationSignal[]>();

  for (const signal of mismatches) {
    const bucket =
      (signal.mismatchBucket as CalibrationMismatchBucket | null) ??
      inferMismatchBucket({
        olharVerdict: signal.systemOlharVerdict as OlharVerdictValue | null,
        exportStatus: signal.systemExportStatus as ExportStatusValue | null,
        humanDecision: signal.humanVerdict as HumanCalibrationDecision,
      });
    const list = grouped.get(bucket) ?? [];
    list.push(signal);
    grouped.set(bucket, list);
  }

  const now = new Date().toISOString();

  const candidates: CalibrationRuleCandidate[] = Array.from(grouped.entries()).map(([bucket, rows], index) => {
    const supportCount = countIndependentDecisionContexts(rows.map(row => {
      const event = input.decisions?.find(event => event.id === row.outputDecisionEventId);
      return event ? outputDecisionContexts(event) : [row.creativeWorkOutputId ? `output:${row.creativeWorkOutputId}`
        : row.derivationId ? `derivation:${row.derivationId}` : `signal:${row.id}`];
    }));
    const confidence = confidenceFromSupport(supportCount);
    const caveats: string[] = [];

    if (supportCount === 1) {
      caveats.push("Single-row evidence — cannot promote without explicit caveat.");
    }
    if (bucket === "unclear_sample") {
      caveats.push("Ambiguous mismatch bucket — requires human review before approval.");
    }

    return {
      id: `candidate-${input.clientProfileId}-${bucket}-${index}`,
      clientProfileId: input.clientProfileId,
      category: BUCKET_TO_CATEGORY[bucket],
      status: "candidate",
      rationale: ruleRationale({
        bucket,
        supportCount,
        sampleNote: rows[0]?.sanitizedNote ?? null,
      }),
      supportingDecisionIds: rows.map((r) => r.id),
      confidence,
      caveats,
      version: 1,
      mismatchBucket: bucket,
      createdAt: now,
      approvedAt: null,
      approvedBy: null,
    };
  });

  const decisions = (input.decisions ?? []).filter(event => event.clientProfileId === input.clientProfileId && isHumanDecisionAuthor(event));
  const corrections = new Map<string, { category: RuleCategory; layer: boolean; refs: ProposalEvidenceRef[]; sources: string[][] }>();
  const add = (category: RuleCategory | null, context: string | null, ref: ProposalEvidenceRef, layer = false, source: string[] = [context!]) => {
    if (!category || !context) return;
    const key = `${category}:${layer ? "layer" : "piece"}`;
    const group = corrections.get(key) ?? { category, layer, refs: [], sources: [] };
    if (!group.refs.some(existing => existing.kind === ref.kind && existing.id === ref.id)) group.refs.push(ref);
    group.sources.push(source);
    corrections.set(key, group);
  };
  const projectedAdjustments = new Set((input.adjustments ?? []).map(row => row.outputDecisionEventId).filter(Boolean));
  for (const event of decisions) {
    if (!["regenerated", "layer_regenerated"].includes(event.action) || event.strength !== "strong" || projectedAdjustments.has(event.id)) continue;
    const snapshot = event.contextSnapshot;
    const signal = input.signals.find(row => row.outputDecisionEventId === event.id);
    // Comparable Peça judgments stay in the existing mismatch path; a layer never judges the whole Peça.
    if (event.action !== "layer_regenerated"
      && (signal?.systemOlharVerdict ?? snapshot.olharVerdict?.value) != null
      && (signal?.systemExportStatus ?? snapshot.exportStatus?.value) != null) continue;
    if (event.action === "layer_regenerated" && !snapshot.layerId) continue;
    const category = explicitCorrectionCategory(event);
    add(category, event.creativeWorkOutputId ? `output:${event.creativeWorkOutputId}` : event.derivationId ? `derivation:${event.derivationId}` : null,
      { kind: "output_decision", id: event.id }, event.action === "layer_regenerated", outputDecisionContexts(event));
  }
  for (const row of input.adjustments ?? []) {
    if (row.clientProfileId !== input.clientProfileId) continue;
    add(correctionCategory(row.category), row.creativeWorkOutputId ? `output:${row.creativeWorkOutputId}` : `item:${row.itemId}`,
      { kind: "equipe_event", id: row.id }, false,
      [`item:${row.itemId}`, `equipe_event:${row.sourceEventId}`, ...(row.creativeWorkOutputId ? [`output:${row.creativeWorkOutputId}`] : [])]);
  }
  for (const [key, group] of corrections) {
    // Weak evidence is complementary only; it never enters the independent explicit support count.
    const refs = [...group.refs];
    for (const event of decisions) {
      if (!outputDecisionContexts(event).some(key => group.sources.some(source => source.includes(key))) || !["favorited", "alternative_not_selected"].includes(event.action)) continue;
      const ref: ProposalEvidenceRef = { kind: "output_decision", id: event.id };
      if (!refs.some(existing => existing.kind === ref.kind && existing.id === ref.id)) refs.push(ref);
    }
    const count = countIndependentDecisionContexts(group.sources);
    candidates.push({
      id: `candidate-${input.clientProfileId}-correction-${key}`, clientProfileId: input.clientProfileId,
      category: group.category, status: "candidate",
      rationale: `Correções humanas categorizadas (${count} fonte(s) explícita(s) independente(s)). Revisar a orientação a partir dos eventos de apoio.`,
      supportingDecisionIds: [], supportingEvidenceRefs: refs,
      confidence: confidenceFromSupport(count), caveats: [
        "Não é divergência medida do Olhar; correção categorizada sem duplo veredito comparável.",
        "Categoria sugerida; o revisor deve confirmar conteúdo, natureza e papéis de destino.",
        ...(count === 1 ? ["Fonte explícita única; repetições e sinais fracos não aumentam o quórum."] : []),
        ...(group.layer ? ["Correção restrita à camada; não é veredito da Peça inteira."] : []),
      ], version: 1, mismatchBucket: null, createdAt: now, approvedAt: null, approvedBy: null,
    });
  }
  return candidates;
}

function explicitCorrectionCategory(event: OutputDecisionEvent): RuleCategory | null {
  const reason = event.contextSnapshot.reason;
  return ["feedback_category", "human_quality_evaluation"].includes(reason?.source ?? "") || event.authorType === "equipe_actor"
    ? correctionCategory(reason?.code) : null;
}

/** Explicit human categories only: free text and factual corrections never become taste. */
export function correctionCategory(code: string | undefined): RuleCategory | null {
  const categories: Record<string, RuleCategory> = {
    voice: "voice", brand: "brand_nuance", visual: "gestalt", figure: "figure", gestalt: "gestalt",
    hierarchy: "hierarchy", invite: "invite", brand_nuance: "brand_nuance",
    visual_overload: "gestalt", weak_hierarchy: "hierarchy", generic_template_feel: "brand_nuance",
    illegible_cta: "invite", unfocused_composition: "gestalt",
  };
  return code && Object.hasOwn(categories, code) ? categories[code] : null;
}

export interface CorrectionNote extends ProposalEvidenceRef { note: string; occurredAt: string; evidenceSanitized: boolean }

export function listUncategorizedCorrectionNotes(input: {
  decisions: OutputDecisionEvent[];
  adjustments: Awaited<ReturnType<typeof listAdjustmentEvidenceForBrand>>;
}): CorrectionNote[] {
  const notes: CorrectionNote[] = [];
  for (const event of input.decisions) {
    if (!isHumanDecisionAuthor(event) || !["regenerated", "layer_regenerated"].includes(event.action)) continue;
    const snapshot = event.contextSnapshot;
    if (explicitCorrectionCategory(event)) continue;
    const originals = [snapshot.reason?.text, snapshot.notes, snapshot.otherReasonText, snapshot.userFeedback];
    const sanitized = originals.map(text => sanitizeCalibrationNote(text));
    const evidenceSanitized = snapshot.evidenceSanitized === true
      || originals.some((text, index) => typeof text === "string" && text !== sanitized[index]);
    const note = [...new Set(sanitized.filter((text): text is string => text !== null))].join("\n");
    if (note || evidenceSanitized) notes.push({ kind: "output_decision", id: event.id, note, evidenceSanitized,
      occurredAt: event.createdAt.toISOString() });
  }
  for (const row of input.adjustments) {
    const note = sanitizeCalibrationNote(row.note);
    const evidenceSanitized = row.evidenceSanitized || note !== row.note;
    if (!correctionCategory(row.category) && (note || evidenceSanitized) && !row.outputDecisionEventId) {
      notes.push({ kind: "equipe_event", id: row.id, note: note ?? "", evidenceSanitized, occurredAt: row.occurredAt.toISOString() });
    }
  }
  return notes;
}

export function canPromoteRuleToApproved(rule: CalibrationRuleCandidate): {
  ok: boolean;
  reason?: string;
} {
  if (rule.status !== "candidate") {
    return { ok: false, reason: "Only candidate rules can be approved." };
  }
  if (rule.confidence === "low" && rule.caveats.length > 0) {
    return {
      ok: false,
      reason: "Low-confidence rule with caveats requires explicit operator acknowledgment.",
    };
  }
  if (
    rule.supportingDecisionIds.length === 1 &&
    rule.mismatchBucket === "unclear_sample"
  ) {
    return {
      ok: false,
      reason: "Ambiguous single-row evidence cannot become an active rule.",
    };
  }
  return { ok: true };
}

export function ruleConstraintText(rule: Pick<CalibrationRuleCandidate, "category" | "rationale" | "id">): string {
  if (rule.category === "corpus_quality") {
    return `[corpus-quality:${rule.id}] ${rule.rationale}`;
  }
  return `[brand-taste:${rule.id}] ${rule.category}: ${rule.rationale}`;
}
