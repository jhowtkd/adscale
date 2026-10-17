/** End-to-end fixture evidence only; the two reference files are synthetic. */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSemanticReviewRepository, SEMANTIC_REVIEW_VERSIONS } from "../src/server/creative-work/semantic-review-repository";
import { createSemanticReviewExportRepository } from "../src/server/creative-work/semantic-review-export-repository";
import { processSemanticReviewObservation } from "../src/server/creative-work/semantic-review-processor";
import { SEMANTIC_MODEL, SEMANTIC_OPTIONS, SEMANTIC_QUESTIONS } from "../src/server/creative-work/semantic-review-offline";
import { LABEL_VERSIONS, semanticDigest, type SemanticEvaluationManifest } from "../src/server/creative-work/semantic-review-evaluation";
import { claimHermeticClock, createScope, deleteScopes, openTestDatabase, policyInput, T0, workRow, type Scope } from "../src/server/creative-work/semantic-review-collection.pg-helpers";
import { creativeWorkItems } from "../src/server/db/schema";
import { exportSemanticReviewCases, importSemanticReviewJudgment, writeSemanticEvaluationReport } from "./jev-evaluate";
import { requireJevTestDatabaseUrl } from "./jev-collect";
import { SYNTHETIC_CASES } from "./run-jev-offline";

export async function runSemanticEvaluationDemo() {
  const { db, pool } = await openTestDatabase(requireJevTestDatabaseUrl());
  const scopes: Scope[] = [];
  const directory = mkdtempSync(join(tmpdir(), "jev471-synthetic-"));
  const outputDir = join(directory, "run");
  const originalFetch = globalThis.fetch;
  const environment: Record<string, string | undefined> = process.env;
  const originalNodeEnv = environment.NODE_ENV;
  globalThis.fetch = async () => { throw new Error("real_http_forbidden"); };
  environment.NODE_ENV = "test";
  let release: (() => Promise<void>) | undefined;
  try {
    release = await claimHermeticClock(pool);
    const scope = await createScope(db); scopes.push(scope);
    const rows = SYNTHETIC_CASES.map((_, caseIndex) => workRow(scope, { caseIndex, updatedAt: T0 }));
    await db.insert(creativeWorkItems).values(rows);
    const repository = createSemanticReviewRepository(db);
    const policy = await repository.registerPolicy(policyInput(scope, SEMANTIC_REVIEW_VERSIONS) as Parameters<typeof repository.registerPolicy>[0], T0);
    await repository.setPolicyEnabled({ workspaceId: scope.workspaceId, policyId: policy.id, enabled: true }, T0);
    const collected = await repository.collectNextPage({ enabled: true, now: T0 });
    const observations = await repository.listObservations({ workspaceId: scope.workspaceId });
    const plan = { version: 1 as const, workspaceId: scope.workspaceId, selectedAt: T0.toISOString(), selectedBy: "synthetic-fixture-author", selectedBeforeResults: true as const,
      entries: observations.map((o) => { const fixture = SYNTHETIC_CASES[rows.findIndex((r) => r.id === o.workItemId)]; return { reviewId: o.id, familyId: fixture.family, split: fixture.split, primary: true }; }) };
    let controlledCalls = 0;
    for (const observation of observations) {
      const index = rows.findIndex((row) => row.id === observation.workItemId);
      const controlled = SYNTHETIC_CASES[index].controlled as { decisions: Record<string, string> };
      const fetchImpl: typeof fetch = async () => {
        controlledCalls += 1;
        return new Response(JSON.stringify({ model: SEMANTIC_MODEL, answers: Object.fromEntries(SEMANTIC_QUESTIONS.map((q) => [q, {
          type: "choice", choice: controlled.decisions[q], confidence: 1,
          probabilities: Object.fromEntries(SEMANTIC_OPTIONS[q].map((option) => [option, Number(option === controlled.decisions[q])])),
        }])) }));
      };
      const result = await processSemanticReviewObservation({ repository, workspaceId: scope.workspaceId, observationId: observation.id,
        enabled: true, credential: "controlled-fixture", fetchImpl, clock: () => T0, diagnosticSink: () => {} });
      if (result.status !== "completed") throw new Error("demo_processing_failed");
    }
    const exported = await exportSemanticReviewCases({ repository: createSemanticReviewExportRepository(db), outputDir, evaluationRoot: directory, plan, clock: () => T0,
      authorization: { reference: "https://example.invalid/jev471-synthetic-approval", authorizedBy: "synthetic-fixture-author",
        approvedAt: T0.toISOString(), expiresAt: new Date(T0.getTime() + 3_600_000).toISOString(), purpose: "blind_semantic_review_export",
        workspaceId: scope.workspaceId, clientProfileIds: scope.brandIds, reviewIds: observations.map((o) => o.id), planHash: semanticDigest(plan) } });
    const manifest = JSON.parse(readFileSync(join(outputDir, "private-map.json"), "utf8")) as SemanticEvaluationManifest;
    const judgmentAt = new Date(T0.getTime() + 1_000);
    for (const reviewerId of ["synthetic-reference-a", "synthetic-reference-b"]) {
      importSemanticReviewJudgment({ directory: outputDir, now: judgmentAt, judgment: {
        version: 1, kind: "review", exportId: exported.exportId, planHash: exported.planHash, blindHash: exported.blindHash,
        reviewerId, createdAt: judgmentAt.toISOString(), referenceKind: "synthetic_fixture",
        cases: manifest.rows.map((row) => ({ caseId: row.caseId, familyId: row.familyId, caseHash: row.caseHash, versions: LABEL_VERSIONS, ambiguous: false,
          labels: SYNTHETIC_CASES.find((fixture) => fixture.family === row.sourceFamilyId)!.expected })),
      } });
    }
    const { report } = writeSemanticEvaluationReport({ directory: outputDir, now: judgmentAt });
    const cohort = report.cohorts[0];
    if (exported.exported !== SYNTHETIC_CASES.length || report.recoverable !== SYNTHETIC_CASES.length || cohort.counts.clearLabels !== SYNTHETIC_CASES.length) throw new Error("demo_evaluation_failed");
    return { dataOrigin: "synthetic", execution: "controlled", humanReference: report.humanReference,
      collected: collected.unique, controlledCalls, realHttpCalls: 0, exported: exported.exported,
      judgments: 2, families: cohort.counts.primaryFamilies, matrix: cohort.matrix,
      metrics: cohort.metrics, collection: report.collection, httpElapsedMs: cohort.httpElapsedMs, usage: cohort.usage, cost: cohort.cost,
      cleanup: "private_files_workspace_and_user_removed" };
  } finally {
    globalThis.fetch = originalFetch;
    if (originalNodeEnv === undefined) delete environment.NODE_ENV; else environment.NODE_ENV = originalNodeEnv;
    try { await deleteScopes(db, scopes); }
    finally {
      try { if (release) await release(); }
      finally { await pool.end(); rmSync(directory, { recursive: true, force: true }); }
    }
  }
}
