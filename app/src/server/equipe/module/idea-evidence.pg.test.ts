import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { workspaces, clientProfiles, outputDecisionEvents, calibrationSignals } from "@/server/db/schema";
import { createPostgresEquipeUnitOfWork } from "../data/postgres";
import type { EquipeUnitOfWork } from "../data";
import { resolveEquipeTestDatabaseUrl } from "../data/test-database";
import { executeCommand } from "./commands";
import { makeTestDeps } from "./testing/deps";
import { ideaVersionHash } from "./ideas-decide";
import { consumeIdeaRejectionEvidence, listIdeaRejectionEvidenceForBrand, IDEA_REJECTION_EVIDENCE_EVENT } from "./idea-evidence";

const testUrl = resolveEquipeTestDatabaseUrl();
if (testUrl) {
  const parsed = new URL(testUrl);
  if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || !parsed.pathname.endsWith("_test") || process.env.DATABASE_URL !== testUrl) {
    throw new Error("Idea evidence tests require matching local database URLs ending in _test");
  }
}
const workspaceIds: string[] = [];

async function fixture() {
  const [workspace] = await db.insert(workspaces).values({ name: "Ideia simulada", slug: randomUUID() }).returning();
  workspaceIds.push(workspace.id);
  const [brand] = await db.insert(clientProfiles).values({ workspaceId: workspace.id, name: "Marca simulada" }).returning();
  const uow = createPostgresEquipeUnitOfWork(db);
  const account = await uow.repos.accounts.create(workspace.id, { clientProfileId: brand.id, status: "active" });
  const scope = { workspaceId: workspace.id, accountId: account.id };
  const person = await uow.repos.people.create(scope, { name: "Pessoa sem usuário", role: "approver", active: true });
  const idea = await uow.repos.ideas.create(scope, { kind: "content", payload: { title: "Guia" } });
  const deps = { ...makeTestDeps().deps, uow };
  const outcome = await executeCommand(deps, { ...scope, actor: { kind: "client_person", personId: person.id, role: "approver" } }, {
    type: "decide_idea", payload: { ideaId: idea.id, decision: "reject", reason: "Menos formal", expectedVersionHash: ideaVersionHash(idea) },
  });
  if (!outcome.ok) throw new Error(outcome.error.code);
  const source = outcome.value.events.find(event => event.eventType === "idea.decided")!;
  return { deps, scope, idea, source, brandScope: { workspaceId: workspace.id, clientProfileId: brand.id } };
}

describe.skipIf(!testUrl)("content idea evidence (Postgres)", () => {
  afterAll(async () => {
    if (workspaceIds.length) await db.delete(workspaces).where(inArray(workspaces.id, workspaceIds));
  });

  it("preserves the committed hash under concurrent delivery without inserting Peça projections", async () => {
    const f = await fixture();
    expect(f.source.payload).toMatchObject({ versionHash: ideaVersionHash(f.idea), reason: "Menos formal" });
    await f.deps.uow.repos.ideas.update(f.scope, f.idea.id, { payload: { title: "Texto posterior" } });
    let releaseFirst!: () => void;
    let firstRead!: () => void;
    const holdFirst = new Promise<void>(resolve => { releaseFirst = resolve; });
    const firstReadReached = new Promise<void>(resolve => { firstRead = resolve; });
    const pids: number[] = [];
    const transaction = db.transaction.bind(db);
    const transactionProbe = vi.spyOn(db, "transaction").mockImplementation((fn, config) => transaction(async tx => {
      const result = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
      pids.push(result.rows[0].pid);
      return fn(tx);
    }, config));
    const run = f.deps.uow.run.bind(f.deps.uow);
    let calls = 0;
    const controlledUow: EquipeUnitOfWork = { ...f.deps.uow, run: fn => {
      const call = ++calls;
      return run((repos, internal) => fn({ ...repos, events: { ...repos.events, list: async (scope, filter) => {
        const rows = await repos.events.list(scope, filter);
        if (call === 1 && filter?.eventType === IDEA_REJECTION_EVIDENCE_EVENT) {
          firstRead();
          await holdFirst;
        }
        return rows;
      } } }, internal));
    } };
    const controlled = { ...f.deps, uow: controlledUow };
    const pending: Promise<unknown>[] = [];
    try {
      const first = consumeIdeaRejectionEvidence(controlled, f.scope, f.source.id);
      pending.push(first);
      await Promise.race([firstReadReached, first.then(() => { throw new Error("First consumer never reached evidence lookup"); })]);
      let secondFinished = false;
      const second = consumeIdeaRejectionEvidence(controlled, f.scope, f.source.id).finally(() => { secondFinished = true; });
      pending.push(second);
      // Release only after the second transaction waits on the first, or finishes without the lock.
      await expect.poll(async () => {
        if (secondFinished) return "finished";
        if (pids.length < 2) return "starting";
        const result = await db.execute<{ blockers: number[] }>(sql`select pg_blocking_pids(${pids[1]}) as blockers`);
        return result.rows[0].blockers.includes(pids[0]) ? "blocked" : "running";
      }, { timeout: 5000, interval: 10 }).toMatch(/^(blocked|finished)$/);
      releaseFirst();
      await Promise.all(pending);
    } finally {
      releaseFirst();
      await Promise.allSettled(pending);
      transactionProbe.mockRestore();
    }
    const evidence = await listIdeaRejectionEvidenceForBrand(f.deps, f.brandScope);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({ versionHash: ideaVersionHash(f.idea), reason: "Menos formal", actorId: f.source.actorId });
    expect(await db.select().from(outputDecisionEvents).where(eq(outputDecisionEvents.workspaceId, f.scope.workspaceId))).toEqual([]);
    expect(await db.select().from(calibrationSignals).where(eq(calibrationSignals.workspaceId, f.scope.workspaceId))).toEqual([]);
    expect(await f.deps.uow.repos.receipts.list(f.scope)).toEqual([]);
  });

  it("does not backfill a historical hash from the live idea", async () => {
    const f = await fixture();
    const historical = await f.deps.uow.repos.events.create(f.scope, {
      eventType: "idea.decided", objectType: "idea", objectId: f.idea.id,
      actorType: f.source.actorType, actorId: f.source.actorId, actorRole: f.source.actorRole,
      payload: { decision: "reject", kind: "content", reason: "Antigo" },
    });
    expect(await consumeIdeaRejectionEvidence(f.deps, f.scope, historical.id)).toBeNull();
    expect(await listIdeaRejectionEvidenceForBrand(f.deps, f.brandScope)).toEqual([]);
  });
});
