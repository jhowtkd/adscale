/** Reproducible #469 demonstration: explicit test DB and controlled HTTP only. */
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/server/db/schema";
import { collectSemanticReview } from "../src/server/creative-work/semantic-review-collector";
import { processSemanticReviewObservation } from "../src/server/creative-work/semantic-review-processor";
import { createSemanticReviewRepository, SEMANTIC_REVIEW_VERSIONS } from "../src/server/creative-work/semantic-review-repository";
import { SEMANTIC_MODEL, SEMANTIC_OPTIONS, SEMANTIC_QUESTIONS } from "../src/server/creative-work/semantic-review-offline";
import { SYNTHETIC_CASES } from "./run-jev-offline";
import { requireJevTestDatabaseUrl } from "./jev-collect";

export async function main(args: string[]) {
  if (args.length !== 1 || args[0] !== "demo") throw new Error("invalid_arguments");
  const connectionString = requireJevTestDatabaseUrl();
  const pool = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 5_000 });
  const database = drizzle(pool, { schema });
  const repository = createSemanticReviewRepository(database);
  const userId = `jev469-demo-${randomUUID()}`;
  let workspaceId: string | undefined;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("real_http_forbidden"); };
  let controlledCalls = 0;
  try {
    const target = await pool.query<{ name: string }>("select current_database() as name");
    if (`/${target.rows[0]?.name}` !== new URL(connectionString).pathname) throw new Error("unsafe_test_database");
    const now = new Date();
    await database.insert(schema.user).values({ id: userId, name: "Synthetic Jev 469", email: `${userId}@example.invalid` });
    const [workspace] = await database.insert(schema.workspaces).values({ name: "Synthetic Jev 469", slug: userId }).returning();
    workspaceId = workspace.id;
    const [brand] = await database.insert(schema.clientProfiles).values({ workspaceId, name: "Marca Exemplo" }).returning();
    const fixture = structuredClone(SYNTHETIC_CASES[0].work) as schema.NewCreativeWorkItem;
    Object.assign(fixture, { id: randomUUID(), workspaceId, clientProfileId: brand.id, createdByUserId: userId, title: "Demonstração sintética 469", updatedAt: now });
    fixture.inputSnapshot!.factPack!.identity.clientProfileId = brand.id;
    const [before] = await database.insert(schema.creativeWorkItems).values(fixture).returning();
    const policy = await repository.registerPolicy({
      workspaceId, clientProfileIds: [brand.id], ...SEMANTIC_REVIEW_VERSIONS,
      provider: "typesafe", purpose: "prepared_work_semantic_review", dataOrigin: "synthetic",
      authorizationReference: "https://example.invalid/jev469-controlled-demo", authorizedBy: "synthetic-demo",
      authorizedAt: now, expiresAt: new Date(now.getTime() + 3_600_000), samplePercent: 100, dailyAttemptLimit: 1,
    }, now);
    await repository.setPolicyEnabled({ workspaceId, policyId: policy.id, enabled: true }, now);
    const collected = await collectSemanticReview({ repository, enabled: true, now });
    const [observation] = await repository.listObservations({ workspaceId });
    if (!observation) throw new Error("demo_failed");
    const fetchImpl: typeof fetch = async () => {
      controlledCalls += 1;
      return new Response(JSON.stringify({ model: SEMANTIC_MODEL,
        answers: Object.fromEntries(SEMANTIC_QUESTIONS.map((question) => {
          const choices: readonly string[] = SEMANTIC_OPTIONS[question];
          return [question, { type: "choice", choice: choices[0], confidence: 1,
            probabilities: Object.fromEntries(choices.map((option, index) => [option, index === 0 ? 1 : 0])) }];
        })),
      }), { status: 200 });
    };
    const options = { repository, workspaceId, observationId: observation.id, enabled: true,
      credential: "controlled-demo-credential", fetchImpl, clock: () => now, diagnosticSink: () => {} };
    const processed = await processSemanticReviewObservation(options);
    const replay = await processSemanticReviewObservation(options);
    const [persisted] = await repository.listObservations({ workspaceId });
    const [day] = await database.select().from(schema.semanticReviewQuotaDays).where(eq(schema.semanticReviewQuotaDays.workspaceId, workspaceId));
    const [after] = await database.select().from(schema.creativeWorkItems).where(eq(schema.creativeWorkItems.id, before.id));
    const outputs = await database.select({ id: schema.creativeWorkOutputs.id }).from(schema.creativeWorkOutputs).where(eq(schema.creativeWorkOutputs.workItemId, before.id));
    const { rows: [effects] } = await pool.query<{ billing: number; selection: number; exports: number }>(`select
      (select count(*)::int from adscale_app.credit_transactions where workspace_id = $1) as billing,
      (select count(*)::int from adscale_app.creative_work_selection_decisions where workspace_id = $1) as selection,
      (select count(*)::int from adscale_app.exports where workspace_id = $1) as exports`, [workspaceId]);
    const [brandAfter] = await database.select().from(schema.clientProfiles).where(eq(schema.clientProfiles.id, brand.id));
    const workUnchanged = JSON.stringify(before) === JSON.stringify(after);
    const brandUnchanged = JSON.stringify(brand) === JSON.stringify(brandAfter);
    if (collected.unique !== 1 || processed.status !== "completed" || replay.status !== "no_observation" || controlledCalls !== 1
      || day?.attempts !== 1 || !workUnchanged || !brandUnchanged || outputs.length !== 0 || persisted.usage !== null
      || effects.billing !== 0 || effects.selection !== 0 || effects.exports !== 0) throw new Error("demo_failed");
    return { origin: "synthetic", execution: "controlled", database: target.rows[0].name,
      queued: collected.unique, processed: processed.status, persisted: persisted.state,
      currentAtCompletion: persisted.currentAtCompletion, usage: persisted.usage,
      replay: replay.status, attempts: day.attempts, controlledHttpCalls: controlledCalls,
      realHttpCalls: 0, workUnchanged, brandUnchanged, generatedOutputs: outputs.length, creativeEffects: effects, cleanup: "workspace_and_user_removed" };
  } finally {
    globalThis.fetch = originalFetch;
    try {
      if (workspaceId) await database.delete(schema.workspaces).where(eq(schema.workspaces.id, workspaceId));
      await database.delete(schema.user).where(eq(schema.user.id, userId));
    } finally { await pool.end(); }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error: unknown) => {
    const known = ["invalid_arguments", "explicit_test_database_required", "unsafe_test_database", "demo_failed"];
    console.error(error instanceof Error && known.includes(error.message) ? error.message : "jev_processing_failed");
    process.exitCode = 1;
  });
}
