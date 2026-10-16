import { z } from "zod";
import { EVALUATION_VERSIONS, resolveSemanticReference, semanticDigest } from "../src/server/creative-work/semantic-review-evaluation";
import { semanticRatio, semanticWilson, validateSemanticFamilies } from "../src/server/creative-work/semantic-review-metrics";
import { validateSemanticExportApproval } from "../src/server/creative-work/semantic-review-export-authorization";
import { readSemanticEvaluationRoot, readSemanticPrivateJson } from "./jev-evaluate";
import { freezeSchema, G2_CRITERIA, operationalSchema } from "./jev-decision-evidence";

type Runs = ReturnType<typeof readSemanticEvaluationRoot>;
export function evaluateCorpus(root: string, approvalFiles: string[], now: Date, onIncident: (kind: string) => void) {
  const identities = new Map<string, { reviewId: string; sent: string }>();
  const incidents: string[] = [];
  const runs = readSemanticEvaluationRoot(root, now, (m) => {
    for (const row of m.rows) {
      if (!row.workItemId || !row.semanticHash || !row.sendStartedAt) continue;
      const key = semanticDigest({ workspaceId: m.plan.workspaceId, clientProfileId: row.clientProfileId, workItemId: row.workItemId, semanticHash: row.semanticHash, versions: row.versions });
      const prior = identities.get(key);
      if (prior && (prior.reviewId !== row.reviewId || prior.sent !== row.sendStartedAt)) { incidents.push("duplicate_send"); onIncident("duplicate_send"); }
      identities.set(key, { reviewId: row.reviewId, sent: row.sendStartedAt });
    }
  });
  if (!runs.length) throw new Error("empty_evaluation_root");
  const missing: string[] = [];
  const approvals = approvalFiles.map(readSemanticPrivateJson);
  validateSemanticFamilies(runs.flatMap(({ manifest: m }) => m.rows.map((r) => ({
    id: r.reviewId, family: `${m.plan.workspaceId}:${r.sourceFamilyId}`, split: r.split, primary: r.primary,
  }))));
  const works = new Map<string, string>();
  const authHashes = new Set<string>();
  const policies = new Map<string, Runs[number]["report"]["processing"]["byPolicy"][string]>();
  const snapshots = new Map<string, string>();
  for (const { manifest: m, report } of runs) {
    if (authHashes.has(m.authorizationHash)) missing.push("reused_export_authorization");
    authHashes.add(m.authorizationHash);
    const rawApproval = approvals.find((a) => semanticDigest(a) === m.authorizationHash);
    if (!rawApproval) missing.push("export_authorization_required");
    else {
      // Authorization must cover the export at its time; expiry today cannot erase historical evidence.
      const approval = validateSemanticExportApproval(rawApproval, m.plan.workspaceId, m.planHash, m.rows.map((r) => r.reviewId), new Date(m.createdAt));
      if (m.rows.some((r) => r.clientProfileId && !approval.clientProfileIds.includes(r.clientProfileId))) missing.push("export_brand_scope_mismatch");
    }
    if (report.humanReference !== "independent_human" && m.rows.some((r) => r.available)) missing.push("independent_human_reference_required");
    if (m.provenance.execution !== "live_authorized") missing.push("live_authorized_evaluation_required");
    for (const row of m.rows) {
      const unavailableObservation = !row.available && row.unavailableReason === "observation_unavailable" && row.policyId === null;
      if (row.dataOrigin !== "authorized" && !(row.dataOrigin === null && unavailableObservation)) missing.push("authorized_corpus_required");
      if (row.available && (!row.workItemId || !row.clientProfileId || !row.policyId || !row.semanticHash || !row.createdAt || !row.state)) missing.push("observation_identity_and_scope_required");
      if (semanticDigest(row.versions) !== semanticDigest(EVALUATION_VERSIONS)) missing.push("evaluation_versions_mismatch");
      if (row.workItemId) {
        const key = `${m.plan.workspaceId}:${row.workItemId}`;
        if (works.has(key) && works.get(key) !== row.sourceFamilyId) missing.push("work_family_mismatch");
        works.set(key, row.sourceFamilyId);
      }
      if (row.state === "completed" && (!row.sendStartedAt || !row.finishedAt)) missing.push("incoherent_completed_observation");
      if (row.createdAt && row.sendStartedAt && Date.parse(row.createdAt) > Date.parse(row.sendStartedAt)) missing.push("incoherent_observation_times");
      if (row.finishedAt && row.sendStartedAt && Date.parse(row.finishedAt) < Date.parse(row.sendStartedAt)) missing.push("incoherent_observation_times");
      if (row.finishedAt && Date.parse(row.finishedAt) > Date.parse(m.createdAt)) missing.push("incoherent_observation_times");
    }
    if (!report.collection.historyComplete || !report.processing.coverageComplete) missing.push("complete_operational_coverage_required");
    for (const [id, processing] of Object.entries(report.processing.byPolicy)) {
      const snapshot = semanticDigest({
        workspaceId: m.plan.workspaceId,
        runs: m.collectionRuns.filter((r) => r.policyId === id).map(semanticDigest).sort(),
        observations: m.processingObservations.filter((r) => r.policyId === id).map(semanticDigest).sort(),
      });
      if (snapshots.has(id) && snapshots.get(id) !== snapshot) missing.push("inconsistent_policy_snapshots");
      else { snapshots.set(id, snapshot); policies.set(id, processing); }
    }
    for (const observation of m.processingObservations) {
      if (observation.dataOrigin !== "authorized" || semanticDigest(observation.versions) !== semanticDigest(EVALUATION_VERSIONS)) missing.push("mixed_processing_cohorts");
      if (observation.state === "completed" && !observation.sendStartedAt) missing.push("incoherent_processing_counts");
    }
    const observationKey = (r: { policyId: string | null; dataOrigin: string | null; versions: unknown; state: string | null; createdAt: string | null; sendStartedAt: string | null; httpElapsedMs: number | null; usage: unknown; errorCode: string | null }) =>
      semanticDigest({ policyId: r.policyId, dataOrigin: r.dataOrigin, versions: r.versions, state: r.state, createdAt: r.createdAt, sendStartedAt: r.sendStartedAt, httpElapsedMs: r.httpElapsedMs, usage: r.usage, errorCode: r.errorCode });
    const available = new Map<string, number>();
    for (const r of m.processingObservations) { const key = observationKey(r); available.set(key, (available.get(key) ?? 0) + 1); }
    for (const r of m.rows.filter((r) => r.policyId !== null)) {
      const key = observationKey(r);
      if (!(available.get(key) ?? 0)) missing.push("selected_observations_must_match_processing_snapshot");
      else available.set(key, available.get(key)! - 1);
    }
  }
  if (new Set(runs.map(({ manifest: m }) => m.provenance.environment)).size !== 1) missing.push("mixed_environments");
  const cohorts = runs.flatMap(({ report }) => report.cohorts);
  const clearLabels = cohorts.reduce((s, c) => s + c.counts.clearLabels, 0);
  const families = cohorts.reduce((s, c) => s + c.counts.primaryFamilies, 0);
  const calibration = cohorts.reduce((s, c) => s + c.splits.calibration.counts.primaryFamilies, 0);
  const holdout = cohorts.reduce((s, c) => s + c.splits.holdout.counts.primaryFamilies, 0);
  const holdoutMetrics = cohorts.map((c) => c.splits.holdout.metrics);
  // Classification and denominators come only from #471. Reuse the shared arithmetic when pooling disjoint families.
  const poolMetric = (key: "precision" | "falseAlert" | "incrementalDetection" | "abstention") => {
    const numerator = holdoutMetrics.reduce((s, m) => s + (m[key]?.numerator ?? 0), 0);
    const denominator = holdoutMetrics.reduce((s, m) => s + (m[key]?.denominator ?? 0), 0);
    return { ...semanticRatio(numerator, denominator), wilson95: semanticWilson(numerator, denominator) };
  };
  const validResponseRate = semanticRatio([...policies.values()].reduce((s, p) => s + p.counts.validResponses, 0), [...policies.values()].reduce((s, p) => s + p.counts.sendsStarted, 0));
  const reconstructionRate = semanticRatio(runs.reduce((s, r) => s + r.report.reconstructionRate.numerator, 0), runs.reduce((s, r) => s + r.report.reconstructionRate.denominator, 0));
  const metrics = { precision: poolMetric("precision"), falseAlert: poolMetric("falseAlert"), incrementalDetection: poolMetric("incrementalDetection"), abstention: poolMetric("abstention"), validResponseRate, reconstructionRate };
  const g2: string[] = [];
  if (runs.some(({ manifest: m }) => m.rows.some((r) => r.primary && ["queued", "running"].includes(r.state ?? "")))) g2.push("selected_processing_must_be_terminal_before_evaluation");
  if (cohorts.some((c) => Object.entries(c.counts.referenceStates).some(([state, n]) => ["missing_reviews", "missing_second_review", "awaiting_adjudication"].includes(state) && n > 0))) g2.push("complete_two_reviewer_reference_and_adjudication_required");
  if (families < G2_CRITERIA.families || calibration < G2_CRITERIA.calibration || holdout < G2_CRITERIA.holdout) g2.push("300_families_100_calibration_200_holdout_required");
  if (metrics.falseAlert.denominator < G2_CRITERIA.falseAlertDenominator) g2.push("false_alert_denominator_100_required");
  if (metrics.precision.denominator < G2_CRITERIA.precisionDenominator) g2.push("precision_denominator_30_required");
  if (metrics.incrementalDetection.denominator < G2_CRITERIA.incrementalDenominator) g2.push("incremental_denominator_30_required");
  if (metrics.validResponseRate.value === null || metrics.validResponseRate.value < G2_CRITERIA.validResponses) g2.push("valid_responses_below_95_percent_or_unknown");
  if (metrics.falseAlert.value === null || metrics.falseAlert.value > G2_CRITERIA.falseAlert || !metrics.falseAlert.wilson95 || metrics.falseAlert.wilson95.upper > G2_CRITERIA.falseAlertWilsonUpper) g2.push("false_alert_point_or_wilson_limit");
  if (metrics.precision.value === null || metrics.precision.value < G2_CRITERIA.precision || !metrics.precision.wilson95 || metrics.precision.wilson95.lower < G2_CRITERIA.precisionWilsonLower) g2.push("precision_point_or_wilson_limit");
  if (metrics.incrementalDetection.value === null || metrics.incrementalDetection.value < G2_CRITERIA.incrementalDetection) g2.push("incremental_detection_below_50_percent_or_unknown");
  if (metrics.abstention.value === null || metrics.abstention.value > G2_CRITERIA.abstention) g2.push("abstention_above_20_percent_or_unknown");
  if (metrics.reconstructionRate.value === null || metrics.reconstructionRate.value < G2_CRITERIA.reconstruction) g2.push("reconstruction_below_90_percent_or_unknown");
  return { runs, missing: [...new Set(missing)], incidents, clearLabels, families, calibration, holdout, metrics, g2,
    clearFamilyIds: [...new Set(runs.flatMap(({ manifest: m, judgments }) => m.rows.filter((r) => r.primary && resolveSemanticReference(r, judgments).status === "clear")
      .map((r) => `${m.plan.workspaceId}:${r.sourceFamilyId}`)))],
    identity: { evaluationRoot: root, rootHash: semanticDigest(runs.map(({ report: r }) => ({ exportId: r.exportId, manifestHash: r.manifestHash, judgmentHashes: r.judgmentHashes, planHash: r.planHash, blindHash: r.blindHash }))),
      exports: runs.map(({ report: r }) => ({ exportId: r.exportId, manifestHash: r.manifestHash, judgmentHashes: r.judgmentHashes, planHash: r.planHash, blindHash: r.blindHash })) },
    generalizationBrands: [...new Set(runs.flatMap(({ manifest: m }) => m.rows.filter((r) => r.primary && r.split === "holdout" && r.clientProfileId).map((r) => r.clientProfileId!)))],
  };
}

export function checkOperationalEvidence(raw: unknown, corpus: ReturnType<typeof evaluateCorpus> | null, codeSha: string, loadHash: string | null, now: Date) {
  const op = operationalSchema.parse(raw);
  const missing: string[] = [];
  const same = (a: unknown, b: unknown) => semanticDigest(a) === semanticDigest(b);
  if (op.codeSha !== codeSha || !same(op.versions, EVALUATION_VERSIONS)) missing.push("operational_sha_or_versions_mismatch");
  const times = [op.smoke, op.runtime, op.loadEnvironment, op.audit];
  if (times.some((a) => a.codeSha !== codeSha || !same(a.versions, EVALUATION_VERSIONS) || a.environment !== op.environment || Date.parse(a.recordedAt) > now.getTime())) missing.push("operational_attestation_mismatch");
  if (!loadHash || op.loadEnvironment.toolArtifactHash !== loadHash) missing.push("comparable_load_evidence_required");
  if (op.runtime.deploymentSha !== codeSha) missing.push("runtime_sha_mismatch");
  const smoke = op.smoke;
  if (smoke.requestedModel !== EVALUATION_VERSIONS.model || smoke.returnedModel !== EVALUATION_VERSIONS.model || smoke.sendsStarted !== 1 || smoke.validResponses !== 1
    || Date.parse(smoke.startedAt) > Date.parse(smoke.finishedAt) || Date.parse(smoke.finishedAt) > Date.parse(smoke.recordedAt)) missing.push("valid_real_smoke_required");
  for (const kind of ["data", "provider", "spend", "retention", "security", "limits", "tone"] as const) {
    const approvals = op.approvals.filter((a) => a.kind === kind);
    const limitedAuthorization = ["data", "provider", "spend"].includes(kind);
    const covers = (workspaceId: string, brandId: string, at: string) => approvals.some((a) => a.workspaceIds.includes(workspaceId) && a.clientProfileIds.includes(brandId)
      && Date.parse(a.approvedAt) <= Date.parse(at)
      && same(a.versions, EVALUATION_VERSIONS)
      && (!limitedAuthorization || (a.expiresAt !== undefined && Date.parse(a.expiresAt) > Date.parse(at) && Date.parse(a.expiresAt) - Date.parse(a.approvedAt) <= 14 * 86_400_000)));
    if (!covers(smoke.workspaceId, smoke.clientProfileId, smoke.startedAt) || !covers(smoke.workspaceId, smoke.clientProfileId, smoke.finishedAt)
      || corpus?.runs.some(({ manifest: m }) => m.rows.some((r) => r.clientProfileId && r.sendStartedAt && !covers(m.plan.workspaceId, r.clientProfileId, r.sendStartedAt)))) missing.push(`${kind}_approval_required`);
  }
  if (!op.approvals.some((a) => a.kind === "spend" && a.reference === smoke.authorizationReference)) missing.push("smoke_spend_authorization_mismatch");
  if (!corpus || op.audit.evaluationRoot !== corpus.identity.evaluationRoot || !same([...op.audit.manifestHashes].sort(), corpus.identity.exports.map((r) => r.manifestHash).sort())
    || corpus.runs.some(({ manifest: m }) => m.provenance.environment !== op.environment)) missing.push("runtime_corpus_provenance_required");
  const classified = [...op.audit.normalFamilies, ...op.audit.difficultFamilies];
  if (!corpus || new Set(classified).size !== classified.length || classified.some((id) => !corpus.clearFamilyIds.includes(id))) missing.push("normal_and_difficult_pt_br_families_required");
  return { missing, incidents: op.audit.incidents.map((i) => i.kind) };
}

export function checkFreeze(raw: unknown, corpus: ReturnType<typeof evaluateCorpus>, verifyCode: (sha: string) => boolean) {
  const f = freezeSchema.parse(raw);
  const missing: string[] = [];
  if (!verifyCode(f.codeSha)) missing.push("frozen_metric_code_changed_or_unreachable");
  if (f.evaluationRoot !== corpus.identity.evaluationRoot || f.criteriaHash !== semanticDigest({ criteria: G2_CRITERIA, codeSha: f.codeSha, versions: f.versions })
    || semanticDigest([...f.planHashes].sort()) !== semanticDigest(corpus.runs.map((r) => r.manifest.planHash).sort())) missing.push("frozen_criteria_or_plan_mismatch");
  if (Date.parse(f.frozenAt) >= Date.parse(f.holdoutOpenedAt)
    || corpus.runs.some(({ manifest: m, judgments }) => {
      const held = m.rows.filter((r) => r.split === "holdout");
      return (held.length > 0 && Date.parse(f.frozenAt) > Date.parse(m.plan.selectedAt))
        || held.some((r) => r.finishedAt && Date.parse(r.finishedAt) <= Date.parse(f.frozenAt))
        || judgments.some((j) => j.cases.some((c) => held.some((r) => r.caseId === c.caseId)) && Date.parse(j.createdAt) < Date.parse(f.holdoutOpenedAt));
    })) missing.push("criteria_must_precede_holdout");
  if (f.previousHoldout && f.previousHoldout.versionsHash !== semanticDigest(f.versions)) {
    if (f.previousHoldout.evaluationRoot === f.evaluationRoot || corpus.runs.some(({ manifest: m }) => m.rows.some((r) => r.split === "holdout" && f.previousHoldout!.familyIds.includes(`${m.plan.workspaceId}:${r.sourceFamilyId}`)))) missing.push("new_holdout_required_after_model_or_rubric_change");
  }
  return missing;
}
export const safeEvidenceCode = (error: unknown) => error instanceof z.ZodError ? "invalid_evidence_format" : "invalid_or_inconsistent_evaluation_evidence";
