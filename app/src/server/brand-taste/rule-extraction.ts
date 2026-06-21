import type { CalibrationSignal } from "@/server/db/schema";
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
}): CalibrationRuleCandidate[] {
  const mismatches = input.signals.filter((signal) => {
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

  return Array.from(grouped.entries()).map(([bucket, rows], index) => {
    const supportCount = rows.length;
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
