import {
  isDerivationApprovalOverride,
  isDerivationPackageBlockedByVerdict,
  isDerivationPackageEligibleByVerdict,
} from "@/server/ai/client-approval-package";
import type {
  ExportStatusPayload,
  ExportStatusValue,
  OlharVerdictPayload,
  OlharVerdictValue,
} from "@/server/ai/olhar/dual-verdict";
import {
  isBlockingExportStatus,
  normalizeExportStatusPayload,
  normalizeOlharVerdictPayload,
} from "@/server/ai/olhar/dual-verdict";
import type { OutputDecisionEvent } from "@/server/db/schema";
import type { OutputDecisionSnapshot } from "@/server/output-learning/output-decision-events";
import {
  computeAdditionalNeeded,
} from "@/server/human-quality/sampling/guidance";
import { SAMPLE_GLOBAL_MIN } from "@/server/human-quality/sampling/thresholds";
import type { SampleGuidance } from "@/server/human-quality/sampling/types";

export const CENBRAP_CALIBRATION_SCHEMA_VERSION = 1;
export const CENBRAP_CLIENT_LABEL = "Cenbrap";

export const CENBRAP_MISMATCH_BUCKETS = [
  "system_too_permissive",
  "system_too_harsh",
  "voice_nuance",
  "export_setup_issue",
  "acceptable_override",
  "unclear_sample",
] as const;

export type CenbrapMismatchBucket = (typeof CENBRAP_MISMATCH_BUCKETS)[number];

const MISMATCH_BUCKET_SET = new Set<string>(CENBRAP_MISMATCH_BUCKETS);

export type HumanCalibrationDecision = "entra" | "quase" | "nao_entra";
export type HumanDecisionSource =
  | "output_decision_event"
  | "manual_pending";
export type AgreementClassification =
  | "agree"
  | "mismatch"
  | "missing_dual_verdict"
  | "missing_human_decision";
export type CenbrapCalibrationStatus =
  | "ok"
  | "insufficient_sample"
  | "template"
  | "no_live_data";

export interface CenbrapCampaignInput {
  id: string;
  workspaceId: string;
  name: string;
  client?: string | null;
  clientProfileId?: string | null;
  status?: string | null;
}

export interface CenbrapCampaignRow {
  id: string;
  workspaceId: string;
  name: string;
  client: string | null;
  clientProfileId: string | null;
  clientProfileName: string | null;
  status: string | null;
  selectionSignals: string[];
}

export interface CenbrapDerivationInput {
  id: string;
  campaignId: string;
  workspaceId: string;
  status: string;
  format?: string | null;
  generationMode?: string | null;
  variantIndex?: number | null;
  outputKey?: string | null;
  isPreview?: boolean | null;
  olharVerdict?: unknown;
  exportStatus?: unknown;
}

export interface CenbrapDerivationRow {
  id: string;
  campaignId: string;
  workspaceId: string;
  status: string;
  format: string | null;
  generationMode: string | null;
  variantIndex: number | null;
  hasOutput: boolean;
  outputRef: string | null;
  olharVerdict: OlharVerdictPayload | null;
  exportStatus: ExportStatusPayload | null;
  olharVerdictValue: OlharVerdictValue | null;
  exportStatusValue: ExportStatusValue | null;
  dualVerdictState: "present" | "missing_dual_verdict";
  packageEligible: boolean;
  approvalOverride: boolean;
}

export interface CenbrapHumanDecisionRow {
  derivationId: string;
  humanDecision: HumanCalibrationDecision | null;
  humanDecisionSource: HumanDecisionSource;
  mismatchBucket: CenbrapMismatchBucket | null;
  mismatchReason: string | null;
  reviewer: string | null;
  reviewedAt: string | null;
  decisionEventId: string | null;
  overrideApproved: boolean;
}

export interface CenbrapCalibrationRow {
  derivation: CenbrapDerivationRow;
  human: CenbrapHumanDecisionRow;
  agreement: AgreementClassification;
  mismatchBucket: CenbrapMismatchBucket | null;
  mismatchReason: string | null;
}

export interface CenbrapCalibrationMetrics {
  evaluatedCampaignCount: number;
  evaluatedDerivationCount: number;
  decisionCount: number;
  comparableCount: number;
  agreementCount: number;
  mismatchCount: number;
  agreementRate: number | null;
  mismatchReasonCounts: Record<string, number>;
  approvedInvalidPreventedCount: number;
  semOpiniaoDetectionCount: number;
  exportBlockSeparationCount: number;
  missingDualVerdictCount: number;
  missingHumanDecisionCount: number;
}

export interface CenbrapCalibrationCampaignSection {
  campaign: CenbrapCampaignRow;
  rows: CenbrapCalibrationRow[];
}

export interface CenbrapCalibrationReport {
  schemaVersion: typeof CENBRAP_CALIBRATION_SCHEMA_VERSION;
  capturedAt: string;
  client: typeof CENBRAP_CLIENT_LABEL;
  mode: "live" | "template";
  status: CenbrapCalibrationStatus;
  campaigns: CenbrapCalibrationCampaignSection[];
  operatorDecisions: Array<{
    derivationId: string;
    campaignId: string;
    olharVerdict: OlharVerdictValue | null;
    exportStatus: ExportStatusValue | null;
    humanDecision: HumanCalibrationDecision | null;
    humanDecisionSource: HumanDecisionSource;
    mismatchBucket: CenbrapMismatchBucket | null;
    mismatchReason: string | null;
    overrideApproved: boolean;
    agreement: AgreementClassification;
    decisionEventId: string | null;
  }>;
  metrics: CenbrapCalibrationMetrics;
  sampleGuidance: SampleGuidance[];
  evidenceNotes: string[];
}

const CENBRAP_PRIMARY_PATTERN = /cenbrap/i;
const CENBRAP_SUPPORTING_NAME_TERMS = [
  "cenbrap",
  "nr1",
  "cenbrap em dobro",
] as const;

function hasDualVerdict(
  olharVerdict: OlharVerdictPayload | null,
  exportStatus: ExportStatusPayload | null
): boolean {
  return olharVerdict?.value != null && exportStatus?.value != null;
}

export function normalizeCampaignRow(input: {
  campaign: CenbrapCampaignInput;
  clientProfileName?: string | null;
  selectionSignals?: string[];
}): CenbrapCampaignRow {
  return {
    id: input.campaign.id,
    workspaceId: input.campaign.workspaceId,
    name: input.campaign.name,
    client: input.campaign.client ?? null,
    clientProfileId: input.campaign.clientProfileId ?? null,
    clientProfileName: input.clientProfileName ?? null,
    status: input.campaign.status ?? null,
    selectionSignals: input.selectionSignals ?? [],
  };
}

export function normalizeDerivationRow(
  input: CenbrapDerivationInput
): CenbrapDerivationRow {
  const olharVerdict = normalizeOlharVerdictPayload(input.olharVerdict);
  const exportStatus = normalizeExportStatusPayload(input.exportStatus);
  const hasOutput = Boolean(input.outputKey) && !input.isPreview;

  const derivationLike = {
    id: input.id,
    status: input.status,
    outputKey: input.outputKey ?? null,
    olharVerdict,
    exportStatus,
    isPreview: input.isPreview ?? false,
  };

  return {
    id: input.id,
    campaignId: input.campaignId,
    workspaceId: input.workspaceId,
    status: input.status,
    format: input.format ?? null,
    generationMode: input.generationMode ?? null,
    variantIndex: input.variantIndex ?? null,
    hasOutput,
    outputRef: hasOutput ? `derivation:${input.id}` : null,
    olharVerdict,
    exportStatus,
    olharVerdictValue: olharVerdict?.value ?? null,
    exportStatusValue: exportStatus?.value ?? null,
    dualVerdictState: hasDualVerdict(olharVerdict, exportStatus)
      ? "present"
      : "missing_dual_verdict",
    packageEligible: isDerivationPackageEligibleByVerdict(derivationLike),
    approvalOverride: isDerivationApprovalOverride(derivationLike),
  };
}

function mapReviewCodeToHumanDecision(
  code: string | undefined
): HumanCalibrationDecision | null {
  switch (code) {
    case "entra":
      return "entra";
    case "quase_regenerar":
    case "quase":
      return "quase";
    case "nao_entra":
      return "nao_entra";
    default:
      return null;
  }
}

function humanDecisionFromApprovedAction(
  snapshot: OutputDecisionSnapshot
): HumanCalibrationDecision {
  if (snapshot.overrideApproved) {
    return "entra";
  }
  return "entra";
}

export function isCenbrapMismatchBucket(
  value: string
): value is CenbrapMismatchBucket {
  return MISMATCH_BUCKET_SET.has(value);
}

export function extractMismatchBucketFromReason(reason?: {
  code?: string;
  source?: string;
} | null): CenbrapMismatchBucket | null {
  if (!reason) {
    return null;
  }

  if (
    reason.source === "calibration_bucket" &&
    reason.code &&
    isCenbrapMismatchBucket(reason.code)
  ) {
    return reason.code;
  }

  if (
    reason.source &&
    reason.source !== "direction_reason" &&
    isCenbrapMismatchBucket(reason.source)
  ) {
    return reason.source;
  }

  if (reason.code && isCenbrapMismatchBucket(reason.code)) {
    return reason.code;
  }

  return null;
}

export function inferMismatchBucket(input: {
  olharVerdict: OlharVerdictValue | null;
  exportStatus: ExportStatusValue | null;
  humanDecision: HumanCalibrationDecision | null;
  overrideApproved?: boolean;
}): CenbrapMismatchBucket {
  if (input.overrideApproved) {
    return "acceptable_override";
  }

  const exportBlocked =
    input.exportStatus != null && isBlockingExportStatus(input.exportStatus);

  if (input.humanDecision === "entra" && exportBlocked) {
    return "export_setup_issue";
  }

  if (
    input.humanDecision === "entra" &&
    (input.olharVerdict === "confusa" || input.olharVerdict === "sem_opiniao")
  ) {
    return "system_too_permissive";
  }

  if (
    input.humanDecision === "nao_entra" &&
    (input.olharVerdict === "pronta" || input.olharVerdict === "quase")
  ) {
    return "system_too_harsh";
  }

  if (input.humanDecision === "quase") {
    return "voice_nuance";
  }

  return "unclear_sample";
}

export function normalizeHumanDecisionFromEvent(
  event: Pick<OutputDecisionEvent, "id" | "userId" | "createdAt" | "action" | "contextSnapshot"> | null
): CenbrapHumanDecisionRow {
  if (!event) {
    return {
      derivationId: "",
      humanDecision: null,
      humanDecisionSource: "manual_pending",
      mismatchBucket: null,
      mismatchReason: null,
      reviewer: null,
      reviewedAt: null,
      decisionEventId: null,
      overrideApproved: false,
    };
  }

  const snapshot = event.contextSnapshot ?? {};
  const overrideApproved = snapshot.overrideApproved === true;
  let humanDecision: HumanCalibrationDecision | null = null;
  let mismatchBucket: CenbrapMismatchBucket | null = null;
  let mismatchReason: string | null = null;

  if (event.action === "approved") {
    humanDecision = humanDecisionFromApprovedAction(snapshot);
    mismatchBucket = extractMismatchBucketFromReason(snapshot.reason);
  } else if (event.action === "rejected") {
    const mapped = mapReviewCodeToHumanDecision(snapshot.reason?.code);
    humanDecision = mapped ?? "nao_entra";
    mismatchBucket = extractMismatchBucketFromReason(snapshot.reason);
    mismatchReason = snapshot.reason?.text?.trim() ?? null;
  } else if (event.action === "regenerated") {
    humanDecision = "quase";
    mismatchBucket = extractMismatchBucketFromReason(snapshot.reason);
    mismatchReason = snapshot.reason?.text?.trim() ?? null;
  }

  return {
    derivationId: "",
    humanDecision,
    humanDecisionSource: "output_decision_event",
    mismatchBucket,
    mismatchReason,
    reviewer: event.userId,
    reviewedAt: event.createdAt.toISOString(),
    decisionEventId: event.id,
    overrideApproved,
  };
}

export function classifyAgreement(input: {
  olharVerdict: OlharVerdictValue | null;
  exportStatus: ExportStatusValue | null;
  humanDecision: HumanCalibrationDecision | null;
  overrideApproved?: boolean;
}): AgreementClassification {
  if (input.olharVerdict == null || input.exportStatus == null) {
    return "missing_dual_verdict";
  }
  if (input.humanDecision == null) {
    return "missing_human_decision";
  }

  const exportBlocked = isBlockingExportStatus(input.exportStatus);
  const { humanDecision, olharVerdict, overrideApproved } = input;

  if (humanDecision === "entra") {
    if (overrideApproved) {
      return "agree";
    }
    if (exportBlocked) {
      return "mismatch";
    }
    if (olharVerdict === "pronta" || olharVerdict === "quase") {
      return "agree";
    }
    return "mismatch";
  }

  if (humanDecision === "nao_entra") {
    if (
      olharVerdict === "sem_opiniao" ||
      olharVerdict === "confusa" ||
      exportBlocked
    ) {
      return "agree";
    }
    return "mismatch";
  }

  if (humanDecision === "quase") {
    if (olharVerdict === "quase") {
      return "agree";
    }
    if (exportBlocked && olharVerdict === "pronta") {
      return "agree";
    }
    if (olharVerdict === "pronta" && input.exportStatus === "ajuste_menor") {
      return "agree";
    }
    return "mismatch";
  }

  return "mismatch";
}

export function buildCalibrationRow(input: {
  derivation: CenbrapDerivationRow;
  human: CenbrapHumanDecisionRow;
}): CenbrapCalibrationRow {
  const agreement = classifyAgreement({
    olharVerdict: input.derivation.olharVerdictValue,
    exportStatus: input.derivation.exportStatusValue,
    humanDecision: input.human.humanDecision,
    overrideApproved: input.human.overrideApproved,
  });

  const mismatchContext = {
    olharVerdict: input.derivation.olharVerdictValue,
    exportStatus: input.derivation.exportStatusValue,
    humanDecision: input.human.humanDecision,
    overrideApproved: input.human.overrideApproved,
  };

  const mismatchBucket =
    agreement === "mismatch"
      ? input.human.mismatchBucket ?? inferMismatchBucket(mismatchContext)
      : null;

  const mismatchReason =
    agreement === "mismatch"
      ? input.human.mismatchReason ?? describeMismatch(mismatchContext)
      : null;

  return {
    derivation: input.derivation,
    human: {
      ...input.human,
      derivationId: input.derivation.id,
      mismatchBucket,
    },
    agreement,
    mismatchBucket,
    mismatchReason,
  };
}

function describeMismatch(input: {
  olharVerdict: OlharVerdictValue | null;
  exportStatus: ExportStatusValue | null;
  humanDecision: HumanCalibrationDecision | null;
  overrideApproved?: boolean;
}): string {
  return [
    `human=${input.humanDecision ?? "none"}`,
    `olhar=${input.olharVerdict ?? "missing"}`,
    `export=${input.exportStatus ?? "missing"}`,
    input.overrideApproved ? "override=true" : null,
  ]
    .filter(Boolean)
    .join("; ");
}

export function aggregateMismatchReasons(
  rows: CenbrapCalibrationRow[]
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const row of rows) {
    if (row.agreement !== "mismatch") {
      continue;
    }
    const key =
      row.mismatchBucket ??
      inferMismatchBucket({
        olharVerdict: row.derivation.olharVerdictValue,
        exportStatus: row.derivation.exportStatusValue,
        humanDecision: row.human.humanDecision,
        overrideApproved: row.human.overrideApproved,
      });
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return counts;
}

export function buildCenbrapSampleGuidance(input: {
  decisionCount: number;
  campaignCount: number;
}): SampleGuidance[] {
  const guidance: SampleGuidance[] = [];

  if (input.decisionCount < SAMPLE_GLOBAL_MIN) {
    guidance.push({
      gate: "calibration_global",
      currentCount: input.decisionCount,
      requiredCount: SAMPLE_GLOBAL_MIN,
      additionalNeeded: computeAdditionalNeeded(
        input.decisionCount,
        SAMPLE_GLOBAL_MIN
      ),
      blockedClaim: "Cenbrap art-direction agreement rate",
    });
  }

  if (input.campaignCount < 2) {
    guidance.push({
      gate: "calibration_slice",
      sliceKey: "cenbrap_campaigns",
      currentCount: input.campaignCount,
      requiredCount: 2,
      additionalNeeded: computeAdditionalNeeded(input.campaignCount, 2),
      blockedClaim: "multi-campaign Cenbrap calibration coverage",
    });
  }

  return guidance;
}

export function buildCenbrapMetrics(
  campaigns: CenbrapCalibrationCampaignSection[]
): CenbrapCalibrationMetrics {
  const rows = campaigns.flatMap((section) => section.rows);
  const decisionRows = rows.filter(
    (row) => row.human.humanDecisionSource === "output_decision_event"
  );
  const comparableRows = rows.filter(
    (row) =>
      row.agreement === "agree" || row.agreement === "mismatch"
  );
  const agreementCount = comparableRows.filter(
    (row) => row.agreement === "agree"
  ).length;

  let approvedInvalidPreventedCount = 0;
  let semOpiniaoDetectionCount = 0;
  let exportBlockSeparationCount = 0;
  let missingDualVerdictCount = 0;
  let missingHumanDecisionCount = 0;

  for (const row of rows) {
    if (row.agreement === "missing_dual_verdict") {
      missingDualVerdictCount += 1;
    }
    if (row.agreement === "missing_human_decision") {
      missingHumanDecisionCount += 1;
    }

    const blocked = isDerivationPackageBlockedByVerdict(row.derivation);
    if (blocked && row.derivation.status !== "approved") {
      approvedInvalidPreventedCount += 1;
    }

    if (
      row.derivation.olharVerdictValue === "sem_opiniao" &&
      row.human.humanDecision !== "entra" &&
      !row.human.overrideApproved
    ) {
      semOpiniaoDetectionCount += 1;
    }

    if (
      row.derivation.exportStatusValue === "bloqueado" &&
      (row.derivation.olharVerdictValue === "pronta" ||
        row.derivation.olharVerdictValue === "quase")
    ) {
      exportBlockSeparationCount += 1;
    }
  }

  return {
    evaluatedCampaignCount: campaigns.length,
    evaluatedDerivationCount: rows.length,
    decisionCount: decisionRows.length,
    comparableCount: comparableRows.length,
    agreementCount,
    mismatchCount: comparableRows.length - agreementCount,
    agreementRate:
      comparableRows.length > 0
        ? agreementCount / comparableRows.length
        : null,
    mismatchReasonCounts: aggregateMismatchReasons(rows),
    approvedInvalidPreventedCount,
    semOpiniaoDetectionCount,
    exportBlockSeparationCount,
    missingDualVerdictCount,
    missingHumanDecisionCount,
  };
}

export function resolveCenbrapCalibrationStatus(input: {
  mode: "live" | "template";
  metrics: CenbrapCalibrationMetrics;
  sampleGuidance: SampleGuidance[];
}): CenbrapCalibrationStatus {
  if (input.mode === "template") {
    return "template";
  }
  if (input.metrics.evaluatedCampaignCount === 0) {
    return "no_live_data";
  }
  if (input.sampleGuidance.length > 0) {
    return "insufficient_sample";
  }
  return "ok";
}

export function buildCenbrapCalibrationReport(input: {
  capturedAt: string;
  mode: "live" | "template";
  campaigns: CenbrapCalibrationCampaignSection[];
  evidenceNotes?: string[];
}): CenbrapCalibrationReport {
  const metrics = buildCenbrapMetrics(input.campaigns);
  const sampleGuidance = buildCenbrapSampleGuidance({
    decisionCount: metrics.decisionCount,
    campaignCount: metrics.evaluatedCampaignCount,
  });
  const status = resolveCenbrapCalibrationStatus({
    mode: input.mode,
    metrics,
    sampleGuidance,
  });

  const operatorDecisions = input.campaigns.flatMap((section) =>
    section.rows.map((row) => ({
      derivationId: row.derivation.id,
      campaignId: section.campaign.id,
      olharVerdict: row.derivation.olharVerdictValue,
      exportStatus: row.derivation.exportStatusValue,
      humanDecision: row.human.humanDecision,
      humanDecisionSource: row.human.humanDecisionSource,
      mismatchBucket: row.mismatchBucket,
      mismatchReason: row.mismatchReason,
      overrideApproved: row.human.overrideApproved,
      agreement: row.agreement,
      decisionEventId: row.human.decisionEventId,
    }))
  );

  return {
    schemaVersion: CENBRAP_CALIBRATION_SCHEMA_VERSION,
    capturedAt: input.capturedAt,
    client: CENBRAP_CLIENT_LABEL,
    mode: input.mode,
    status,
    campaigns: input.campaigns,
    operatorDecisions,
    metrics,
    sampleGuidance,
    evidenceNotes: input.evidenceNotes ?? [],
  };
}

export interface CenbrapCampaignMatchResult {
  isMatch: boolean;
  signals: string[];
  score: number;
}

export function matchCenbrapCampaign(input: {
  campaign: Pick<CenbrapCampaignInput, "name" | "client" | "clientProfileId">;
  clientProfileName?: string | null;
}): CenbrapCampaignMatchResult {
  const signals: string[] = [];
  let score = 0;

  const client = input.campaign.client?.trim() ?? "";
  const profileName = input.clientProfileName?.trim() ?? "";
  const campaignName = input.campaign.name.trim().toLowerCase();

  if (CENBRAP_PRIMARY_PATTERN.test(client)) {
    signals.push("client_contains_cenbrap");
    score += 3;
  }
  if (CENBRAP_PRIMARY_PATTERN.test(profileName)) {
    signals.push("client_profile_contains_cenbrap");
    score += 3;
  }

  for (const term of CENBRAP_SUPPORTING_NAME_TERMS) {
    if (campaignName.includes(term)) {
      signals.push(`campaign_name_${term.replace(/\s+/g, "_")}`);
      score += 1;
    }
  }

  const isMatch = score >= 3;

  return { isMatch, signals, score };
}

export function buildTemplateCalibrationReport(
  capturedAt: string
): CenbrapCalibrationReport {
  return buildCenbrapCalibrationReport({
    capturedAt,
    mode: "template",
    campaigns: [],
    evidenceNotes: [
      "Template artifact — live DATABASE_URL or Cenbrap campaigns were unavailable.",
      "Do not infer agreement or quality claims from this file.",
      "Jhonatan's manual decisions in the contact sheet are the calibration authority.",
    ],
  });
}

function formatNullable(value: string | null | undefined): string {
  return value ?? "—";
}

export function renderContactSheetMarkdown(
  report: CenbrapCalibrationReport
): string {
  const lines: string[] = [
    "# Phase 142 — Cenbrap Calibration Contact Sheet",
    "",
    `Captured: ${report.capturedAt}`,
    `Status: ${report.status}`,
    `Mode: ${report.mode}`,
    "",
    "## Calibration authority",
    "",
    "Jhonatan's `entra`, `quase`, and `nao_entra` decisions are the calibration authority in Phase 142.",
    "System `olharVerdict` and `exportStatus` values are evidence being calibrated — not the final truth.",
    "Rows without operator decisions stay `manual_pending` until entered below.",
    "",
    "## Sample guidance",
    "",
  ];

  if (report.sampleGuidance.length === 0) {
    lines.push("- No blocked claims from sample guidance.");
  } else {
    for (const guidance of report.sampleGuidance) {
      lines.push(
        `- **${guidance.blockedClaim}**: ${guidance.currentCount}/${guidance.requiredCount} (need ${guidance.additionalNeeded} more)`
      );
    }
  }

  lines.push("", "## Metrics snapshot", "");
  lines.push(`- Campaigns: ${report.metrics.evaluatedCampaignCount}`);
  lines.push(`- Derivations: ${report.metrics.evaluatedDerivationCount}`);
  lines.push(`- Operator decisions: ${report.metrics.decisionCount}`);
  lines.push(
    `- Agreement rate: ${
      report.metrics.agreementRate == null
        ? "withheld (insufficient comparable decisions)"
        : `${(report.metrics.agreementRate * 100).toFixed(1)}%`
    }`
  );
  lines.push(
    `- Missing dual verdict rows: ${report.metrics.missingDualVerdictCount}`
  );
  lines.push(
    `- Missing human decision rows: ${report.metrics.missingHumanDecisionCount}`
  );
  lines.push("");

  if (report.campaigns.length === 0) {
    lines.push(
      "## Campaigns",
      "",
      "_No live Cenbrap campaigns selected. Use this template to record manual review when data becomes available._",
      "",
      "### Manual decision table (template)",
      "",
      "| derivationId | olharVerdict | exportStatus | packageEligible | override | humanDecision | mismatchReason | reviewer | reviewedAt |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      "| _pending_ | — | — | — | — | manual_pending | — | Jhonatan | — |",
      ""
    );
    return lines.join("\n");
  }

  for (const section of report.campaigns) {
    lines.push(`## Campaign: ${section.campaign.name}`);
    lines.push("");
    lines.push(`- Campaign ID: \`${section.campaign.id}\``);
    lines.push(`- Client: ${formatNullable(section.campaign.client)}`);
    lines.push(
      `- Client profile: ${formatNullable(section.campaign.clientProfileName)}`
    );
    lines.push(`- Selection signals: ${section.campaign.selectionSignals.join(", ") || "—"}`);
    lines.push("");
    lines.push(
      "| derivation | outputRef | olharVerdict | exportStatus | packageEligible | override | humanDecision | mismatchBucket | mismatchNote | reviewer | reviewedAt |"
    );
    lines.push(
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"
    );

    for (const row of section.rows) {
      lines.push(
        [
          `\`${row.derivation.id.slice(0, 8)}\``,
          formatNullable(row.derivation.outputRef),
          formatNullable(row.derivation.olharVerdictValue),
          formatNullable(row.derivation.exportStatusValue),
          row.derivation.packageEligible ? "yes" : "no",
          row.derivation.approvalOverride ? "yes" : "no",
          row.human.humanDecision ?? "manual_pending",
          formatNullable(row.mismatchBucket),
          formatNullable(row.mismatchReason),
          formatNullable(row.human.reviewer),
          formatNullable(row.human.reviewedAt),
        ].join(" | ")
      );
    }

    lines.push("", "### Manual decision capture", "");
    lines.push(
      "For rows still marked `manual_pending`, record Jhonatan's decision and mismatch reason here before closing Phase 142:"
    );
    lines.push("");

    for (const row of section.rows) {
      if (row.human.humanDecisionSource === "output_decision_event") {
        continue;
      }
      lines.push(`#### Derivation \`${row.derivation.id}\``);
      lines.push(`- humanDecision: manual_pending`);
      lines.push(`- mismatchBucket: `);
      lines.push(`- mismatchNote: `);
      lines.push(`- reviewer: Jhonatan`);
      lines.push(`- reviewedAt: `);
      lines.push("");
    }
  }

  return lines.join("\n");
}
