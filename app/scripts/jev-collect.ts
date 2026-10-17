/** Manual, test-database-only tooling for #468. No provider is imported. */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/server/db/schema";
import { collectSemanticReview } from "../src/server/creative-work/semantic-review-collector";
import { createSemanticReviewRepository, SEMANTIC_REVIEW_VERSIONS } from "../src/server/creative-work/semantic-review-repository";
import { SYNTHETIC_CASES } from "./run-jev-offline";

export function requireJevTestDatabaseUrl(value = process.env.TEST_DATABASE_URL): string {
  if (!value) throw new Error("explicit_test_database_required");
  try {
    const url = new URL(value);
    if (!["postgres:", "postgresql:"].includes(url.protocol)
      || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      || Boolean(url.search) || Boolean(url.hash)
      || !/^\/[a-zA-Z0-9_]+_test$/.test(url.pathname)) throw new Error();
  } catch { throw new Error("unsafe_test_database"); }
  return value;
}

function flags(args: string[]) {
  const result = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!["--input", "--workspace", "--policy"].includes(key) || !value || value.startsWith("--") || result.has(key)) throw new Error("invalid_arguments");
    result.set(key, value);
  }
  return result;
}

export async function main(args: string[]) {
  const [command, ...rest] = args;
  if (!["register", "enable", "disable", "revoke", "collect", "demo"].includes(command)) throw new Error("invalid_arguments");
  const options = flags(rest);
  const keys = [...options.keys()].sort().join(",");
  if ((command === "register" && keys !== "--input")
    || (["enable", "disable", "revoke"].includes(command) && keys !== "--policy,--workspace")
    || (["collect", "demo"].includes(command) && keys !== "")) throw new Error("invalid_arguments");
  const connectionString = requireJevTestDatabaseUrl();
  const pool = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 5_000 });
  const database = drizzle(pool, { schema });
  const repository = createSemanticReviewRepository(database);
  try {
    const target = await pool.query<{ name: string }>("select current_database() as name");
    if (`/${target.rows[0]?.name}` !== new URL(connectionString).pathname) throw new Error("unsafe_test_database");
    if (command === "register") {
      let input;
      try {
        const raw = JSON.parse(readFileSync(options.get("--input")!, "utf8"));
        input = { ...raw, authorizedAt: new Date(raw.authorizedAt), expiresAt: new Date(raw.expiresAt) };
      } catch { throw new Error("invalid_policy_file"); }
      const policy = await repository.registerPolicy(input);
      return { policyId: policy.id, workspaceId: policy.workspaceId, state: policy.state };
    }
    const scope = { workspaceId: options.get("--workspace")!, policyId: options.get("--policy")! };
    if (command === "enable" || command === "disable") {
      const policy = await repository.setPolicyEnabled({ ...scope, enabled: command === "enable" });
      return { policyId: policy.id, workspaceId: policy.workspaceId, state: policy.state };
    }
    if (command === "revoke") {
      const policy = await repository.revokePolicy(scope);
      return { policyId: policy.id, workspaceId: policy.workspaceId, state: policy.state };
    }
    if (command === "collect") return await collectSemanticReview({ repository });

    const userId = `jev-demo-${randomUUID()}`;
    let workspaceId: string | undefined;
    const previousFetch = globalThis.fetch;
    let httpCalls = 0;
    globalThis.fetch = async () => { httpCalls += 1; throw new Error("demo_http_forbidden"); };
    try {
      const now = new Date();
      await database.insert(schema.user).values({ id: userId, name: "Synthetic Jev", email: `${userId}@example.invalid` });
      const [workspace] = await database.insert(schema.workspaces).values({ name: "Synthetic Jev", slug: userId }).returning();
      workspaceId = workspace.id;
      const [brand] = await database.insert(schema.clientProfiles).values({ workspaceId, name: "Marca Exemplo" }).returning();
      const fixture = structuredClone(SYNTHETIC_CASES[0].work) as schema.NewCreativeWorkItem;
      fixture.id = randomUUID();
      fixture.workspaceId = workspaceId;
      fixture.clientProfileId = brand.id;
      fixture.createdByUserId = userId;
      fixture.title = "Demonstração sintética";
      fixture.updatedAt = now;
      fixture.inputSnapshot!.factPack!.identity.clientProfileId = brand.id;
      const [work] = await database.insert(schema.creativeWorkItems).values(fixture).returning();
      const policy = await repository.registerPolicy({
        workspaceId, clientProfileIds: [brand.id], ...SEMANTIC_REVIEW_VERSIONS,
        provider: "typesafe", purpose: "prepared_work_semantic_review", dataOrigin: "synthetic",
        authorizationReference: "https://example.invalid/jev-synthetic-demo", authorizedBy: "synthetic-demo",
        authorizedAt: new Date(now.getTime() - 1_000), expiresAt: new Date(now.getTime() + 3_600_000),
        samplePercent: 100, dailyAttemptLimit: 100,
      }, now);
      const disabled = await collectSemanticReview({ repository, enabled: true, now });
      await repository.setPolicyEnabled({ workspaceId, policyId: policy.id, enabled: true }, now);
      const collected = await collectSemanticReview({ repository, enabled: true, now });
      const repeated = await collectSemanticReview({ repository, enabled: true, now });
      await repository.revokePolicy({ workspaceId, policyId: policy.id }, now);
      const revoked = await collectSemanticReview({ repository, enabled: true, now });
      const observations = await repository.listObservations({ workspaceId });
      const [after] = await database.select().from(schema.creativeWorkItems).where(and(eq(schema.creativeWorkItems.id, work.id), eq(schema.creativeWorkItems.workspaceId, workspaceId)));
      const unchanged = JSON.stringify(work) === JSON.stringify(after);
      if (collected.unique !== 1 || observations.length !== 1 || repeated.duplicates !== 1 || revoked.status !== "no_policy" || !unchanged || httpCalls !== 0) throw new Error("demo_failed", { cause: { disabled, collected, repeated, revoked, observations: observations.length, unchanged, httpCalls } });
      return { origin: "synthetic", database: target.rows[0].name, registered: policy.state, disabled, collected, repeated, revoked, observations: observations.length, workUnchanged: unchanged, httpCalls, cleanup: "workspace_and_user_removed" };
    } finally {
      globalThis.fetch = previousFetch;
      if (workspaceId) await database.delete(schema.workspaces).where(eq(schema.workspaces.id, workspaceId));
      await database.delete(schema.user).where(eq(schema.user.id, userId));
    }
  } finally { await pool.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error: unknown) => {
    const known = ["invalid_arguments", "explicit_test_database_required", "unsafe_test_database", "invalid_policy_file", "invalid_policy", "invalid_policy_scope", "policy_not_found", "policy_not_valid", "policy_already_active", "demo_failed"];
    console.error(error instanceof Error && known.includes(error.message) ? error.message : "jev_collection_failed");
    process.exitCode = 1;
  });
}
