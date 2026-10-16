/** #470: manual maintenance, explicit disposable database, no provider access. */
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { z } from "zod";
import * as schema from "../src/server/db/schema";
import { collectSemanticReview } from "../src/server/creative-work/semantic-review-collector";
import { processSemanticReviewObservation } from "../src/server/creative-work/semantic-review-processor";
import { createSemanticReviewRepository, SEMANTIC_REVIEW_VERSIONS } from "../src/server/creative-work/semantic-review-repository";
import { requireJevTestDatabaseUrl } from "./jev-collect";
import { SYNTHETIC_CASES } from "./run-jev-offline";

const DAY = 86_400_000;
function argumentsFor(args: string[]) {
  const [command, ...rest] = args;
  if (command === "demo" && rest.length === 0) return { command, workspaceId: "", apply: false };
  if (command !== "expire" && command !== "cleanup") throw new Error("invalid_arguments");
  let workspaceId: string | undefined;
  let apply = false;
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === "--workspace" && workspaceId === undefined) workspaceId = rest[++i];
    else if (rest[i] === "--apply" && command === "cleanup" && !apply) apply = true;
    else throw new Error("invalid_arguments");
  }
  if (!z.string().uuid().safeParse(workspaceId).success) throw new Error("invalid_arguments");
  return { command, workspaceId: workspaceId!, apply };
}

export async function main(args: string[]) {
  const options = argumentsFor(args);
  const connectionString = requireJevTestDatabaseUrl();
  const pool = new Pool({ connectionString, max: 3, connectionTimeoutMillis: 5_000 });
  const database = drizzle(pool, { schema });
  const repository = createSemanticReviewRepository(database);
  try {
    const target = await pool.query<{ name: string }>("select current_database() as name");
    if (`/${target.rows[0]?.name}` !== new URL(connectionString).pathname) throw new Error("unsafe_test_database");
    if (options.command === "expire") return await repository.expireObservations({ workspaceId: options.workspaceId, now: new Date() });
    if (options.command === "cleanup") {
      const scope = { workspaceId: options.workspaceId, now: new Date(), apply: options.apply };
      const observations = await repository.cleanObservations(scope);
      const quota = observations.status === "ready" ? await repository.cleanQuotaDays(scope) : null;
      return { observations, quota };
    }
    // Same suite lock and isolated clock as the PostgreSQL tests. Never lets a
    // global collection query choose a different synthetic suite's active policy.
    const lock = await pool.connect();
    const userId = `jev470-demo-${randomUUID()}`;
    let workspaceId: string | undefined;
    const originalFetch = globalThis.fetch;
    let httpCalls = 0;
    globalThis.fetch = async () => { httpCalls += 1; throw new Error("demo_http_forbidden"); };
    try {
      await lock.query("select pg_advisory_lock($1)", [468_000_001]);
      const { rows: [residual] } = await lock.query<{ latest: string | null }>(`select
        to_char(max(expires_at), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as latest from adscale_app.semantic_review_policies`);
      const now = new Date(Math.max(Date.now() + 31 * DAY, residual.latest ? new Date(residual.latest).getTime() + DAY : 0));
      await database.insert(schema.user).values({ id: userId, name: "Synthetic Jev 470", email: `${userId}@example.invalid` });
      const [workspace] = await database.insert(schema.workspaces).values({ name: "Synthetic Jev 470", slug: userId }).returning();
      workspaceId = workspace.id;
      const [brand] = await database.insert(schema.clientProfiles).values({ workspaceId, name: "Marca Exemplo" }).returning();
      const fixtures = Array.from({ length: 3 }, () => {
        const fixture = structuredClone(SYNTHETIC_CASES[0].work) as schema.NewCreativeWorkItem;
        Object.assign(fixture, { id: randomUUID(), workspaceId, clientProfileId: brand.id,
          createdByUserId: userId, title: "Demonstração sintética 470", updatedAt: now });
        fixture.inputSnapshot!.factPack!.identity.clientProfileId = brand.id;
        return fixture;
      });
      const works = await database.insert(schema.creativeWorkItems).values(fixtures).returning();
      const policy = await repository.registerPolicy({ workspaceId, clientProfileIds: [brand.id], ...SEMANTIC_REVIEW_VERSIONS,
        provider: "typesafe", purpose: "prepared_work_semantic_review", dataOrigin: "synthetic",
        authorizationReference: "https://example.invalid/jev470-controlled-demo", authorizedBy: "synthetic-demo",
        authorizedAt: now, expiresAt: new Date(now.getTime() + DAY), samplePercent: 100, dailyAttemptLimit: 100 }, now);
      await repository.setPolicyEnabled({ workspaceId, policyId: policy.id, enabled: true }, now);
      const collected = await collectSemanticReview({ repository, enabled: true, now });
      const rows = await repository.listObservations({ workspaceId });
      const scope = { workspaceId, observationId: rows[0].id, ownerToken: randomUUID(), now };
      await repository.claimObservation(scope);
      const reserved = await repository.reserveObservationAttempt({ ...scope, deadline: new Date(now.getTime() + 20_000) });
      if (!reserved.ok) throw new Error("demo_failed");
      await repository.revokePolicy({ workspaceId, policyId: policy.id }, now);
      const stopped = await processSemanticReviewObservation({ repository, workspaceId, observationId: rows[1].id,
        enabled: true, credential: "synthetic-controlled-credential", clock: () => now, diagnosticSink: () => {} });
      const expired = await repository.expireObservations({ workspaceId, now: new Date(now.getTime() + DAY + 1) });
      const afterStop = await repository.listObservations({ workspaceId });
      const sendMarkersAfterRevocation = afterStop.filter((row) => row.sendStartedAt && row.id !== rows[0].id).length;
      const cleanupAt = new Date(now.getTime() + 31 * DAY);
      const preview = await repository.cleanObservations({ workspaceId, now: cleanupAt });
      const beforeApply = await repository.listObservations({ workspaceId });
      const applied = await repository.cleanObservations({ workspaceId, now: cleanupAt, apply: true });
      const quotaPreview = await repository.cleanQuotaDays({ workspaceId, now: cleanupAt });
      const quotaApplied = await repository.cleanQuotaDays({ workspaceId, now: cleanupAt, apply: true });
      const afterWorks = await database.select().from(schema.creativeWorkItems).where(eq(schema.creativeWorkItems.workspaceId, workspaceId));
      const workUnchanged = works.every((work) => JSON.stringify(work) === JSON.stringify(afterWorks.find((row) => row.id === work.id)));
      if (collected.unique !== 3 || stopped.status !== "skipped" || stopped.sent || expired.expired !== 1
        || expired.outcomeUnknown !== 1 || sendMarkersAfterRevocation !== 0 || preview.eligible !== 3
        || preview.deleted !== 0 || beforeApply.length !== 3 || applied.deleted !== 3
        || quotaPreview.deleted !== 0 || quotaApplied.deleted !== 1 || !workUnchanged || httpCalls !== 0) throw new Error("demo_failed");
      return { origin: "synthetic", execution: "controlled", database: target.rows[0].name,
        collected: collected.unique, revoked: "revoked", stopped: stopped.status,
        newSendMarkersAfterRevocation: sendMarkersAfterRevocation, expired, preview, applied,
        quotaPreview, quotaApplied, workUnchanged, httpCalls, cleanup: "workspace_and_user_removed" };
    } finally {
      globalThis.fetch = originalFetch;
      try {
        if (workspaceId) await database.delete(schema.workspaces).where(eq(schema.workspaces.id, workspaceId));
        await database.delete(schema.user).where(eq(schema.user.id, userId));
      } finally {
        try { await lock.query("select pg_advisory_unlock($1)", [468_000_001]); } finally { lock.release(); }
      }
    }
  } finally { await pool.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error: unknown) => {
    const known = ["invalid_arguments", "explicit_test_database_required", "unsafe_test_database", "invalid_retention_scope", "invalid_clock", "demo_failed"];
    console.error(error instanceof Error && known.includes(error.message) ? error.message : "jev_retention_failed");
    process.exitCode = 1;
  });
}
