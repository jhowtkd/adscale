/**
 * diagnosis_* commands against a REAL Postgres, with two independent
 * connections and deterministic barriers (never a sleep) — same pattern as
 * handoff.pg.test.ts. Proves what the memory store cannot: the single
 * transaction of document + diagnostic.recorded, concurrency on the account
 * lock, the immutability trigger and the (account, kind, version) index.
 *
 *   TEST_DATABASE_URL=postgresql://jhonatan@localhost:5432/fluxo0_ticket08b_test npm test -- src/server/equipe/module/diagnosis.pg.test.ts
 */
import { afterEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { EquipeUnitOfWork } from "../data";
import { resolveEquipeTestDatabaseUrl } from "../data/test-database";
import { HANDOFF_DIAGNOSE_EVENT } from "../handoff/contract";

const TEST_DATABASE_URL = resolveEquipeTestDatabaseUrl();
if (TEST_DATABASE_URL) process.env.DATABASE_URL = TEST_DATABASE_URL;

const JOB = { kind: "system", job: HANDOFF_DIAGNOSE_EVENT } as const;
const SYSTEM_OPEN = { kind: "system", job: "free-open" } as const;
const QUOTE = "Torramos café especial de origem única";
const OUTPUT = {
  summary: { text: "Torrefação.", evidence: [{ source: "site", quote: QUOTE }] }, channels: [],
  opportunities: [{ title: "Mostrar a origem", evidence: [{ source: "site", quote: QUOTE }] }], notFound: [],
};

type Fixture = Awaited<ReturnType<typeof createFixture>>;
let activeFixture: Fixture | null = null;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function createFixture() {
  if (!TEST_DATABASE_URL) throw new Error("Equipe Postgres test database is not configured");
  const [{ Pool }, { drizzle }, schema, equipeSchema, { createPostgresEquipeUnitOfWork },
    { makeTestDeps }, { executeCommand }, diagnosisFixture] = await Promise.all([
    import("pg"), import("drizzle-orm/node-postgres"), import("@/server/db/schema"),
    import("@/server/db/equipe-schema"), import("../data/postgres"),
    import("./testing/deps"), import("./commands"), import("./testing/diagnosis"),
  ]);
  const poolA = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
  const poolB = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
  const clientA = await poolA.connect();
  const clientB = await poolB.connect();
  const dbA = drizzle(clientA, { schema: { ...schema, ...equipeSchema } });
  const dbB = drizzle(clientB, { schema: { ...schema, ...equipeSchema } });
  const uowA = createPostgresEquipeUnitOfWork(dbA);
  const uowB = createPostgresEquipeUnitOfWork(dbB);
  const t = makeTestDeps();
  t.deps.uow = uowA;
  const workspaceId = crypto.randomUUID();
  const tag = `diagnosis-pg-${workspaceId}`;
  const userId = `diagnosis-${workspaceId}`;
  await dbA.insert(schema.user).values({ id: userId, name: tag, email: `${userId}@example.test`, emailVerified: true });
  await dbA.insert(schema.workspaces).values({ id: workspaceId, name: tag, slug: tag });
  await dbA.insert(schema.workspaceMembers).values({ workspaceId, userId, role: "owner" });
  const opened = await executeCommand(t.deps, { actor: SYSTEM_OPEN, workspaceId }, { type: "open_free_account", payload: { userId } });
  if (!opened.ok) throw new Error(`open_free_account failed: ${opened.error.code}`);
  const accountId = opened.value.accountId!;
  const scope = { workspaceId, accountId };
  const [person] = await uowA.repos.people.list(scope);
  if (!person) throw new Error("missing approver person");
  const approver = { kind: "client_person" as const, role: "approver" as const, personId: person.id };
  const second = { ...t, deps: { ...t.deps, uow: uowB } };
  const [pidA, pidB] = await Promise.all([
    clientA.query<{ pid: number }>("select pg_backend_pid() as pid"),
    clientB.query<{ pid: number }>("select pg_backend_pid() as pid"),
  ]);
  return {
    poolA, poolB, clientA, clientB, dbA, dbB, schema, equipeSchema, t, second, executeCommand, diagnosisFixture,
    workspaceId, accountId, scope, approver, userId, uowA, uowB,
    pidA: pidA.rows[0]!.pid, pidB: pidB.rows[0]!.pid,
  };
}

afterEach(async () => {
  const f = activeFixture;
  activeFixture = null;
  if (!f) return;
  try {
    await f.dbA.delete(f.schema.workspaces).where(eq(f.schema.workspaces.id, f.workspaceId));
    await f.dbA.delete(f.schema.user).where(eq(f.schema.user.id, f.userId));
  } finally {
    f.clientA.release();
    f.clientB.release();
    await Promise.all([f.poolA.end(), f.poolB.end()]);
  }
});

/** Pauses the command right after it takes `for no key update` on the account row. */
function pauseAfterLockedAccount(uow: EquipeUnitOfWork, accountId: string) {
  const entered = deferred();
  const proceed = deferred();
  let paused = false;
  const wrapped: EquipeUnitOfWork = {
    ...uow,
    run: (fn) => uow.run((repos, internal) => {
      const get = repos.accounts.get.bind(repos.accounts);
      const accounts = {
        ...repos.accounts,
        get: async (...args: Parameters<typeof get>) => {
          const row = await get(...args);
          if (!paused && args[1] === accountId && args[2]?.forUpdate) {
            paused = true;
            entered.resolve();
            await proceed.promise;
          }
          return row;
        },
      };
      return fn({ ...repos, accounts }, internal);
    }),
  };
  return { uow: wrapped, entered: entered.promise, proceed: proceed.resolve };
}

/** Pauses (or fails) the diagnosis_record transaction right before it writes `diagnostic.recorded`,
 * i.e. AFTER the document insert and BEFORE the commit. */
function interceptRecordedEvent(uow: EquipeUnitOfWork, mode: "pause" | "throw", eventType = "diagnostic.recorded") {
  const entered = deferred();
  const proceed = deferred();
  const wrapped: EquipeUnitOfWork = {
    ...uow,
    run: (fn) => uow.run((repos, internal) => {
      const create = repos.events.create.bind(repos.events);
      const events = {
        ...repos.events,
        create: async (...args: Parameters<typeof create>) => {
          if (args[1].eventType === eventType) {
            if (mode === "throw") throw new Error("injected_event_failure");
            entered.resolve();
            await proceed.promise;
          }
          return create(...args);
        },
      };
      return fn({ ...repos, events }, internal);
    }),
  };
  return { uow: wrapped, entered: entered.promise, proceed: proceed.resolve };
}

async function waitUntilBlocked(client: Fixture["clientA"], pid: number) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const result = await client.query<{ wait_event_type: string | null; blockers: number[] }>(
      "select wait_event_type, pg_blocking_pids(pid) as blockers from pg_stat_activity where pid = $1", [pid]);
    const row = result.rows[0];
    if (row?.wait_event_type === "Lock" && row.blockers.length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("command did not wait on the other PostgreSQL connection's account lock");
}

describe.skipIf(!TEST_DATABASE_URL)("diagnosis commands, two independent Postgres connections (ticket 08)", () => {
  async function setup(options: { site?: string | null } = {}) {
    const f = await createFixture();
    activeFixture = f;
    return { f, ...(await confirm(f, options)) };
  }

  /** Lands the free account on the confirmed handoff of a NEW reading, with the public content the reading would have left. */
  async function confirm(f: Fixture, options: { site?: string | null } = {}) {
    const { SITE_TEXT } = f.diagnosisFixture;
    const site = options.site === undefined ? SITE_TEXT : options.site;
    const [row] = await f.t.deps.uow.repos.handoffs.list(f.scope);
    const readingId = crypto.randomUUID();
    const item = (value: string) => ({ id: crypto.randomUUID(), value, origin: "site" as const });
    await f.t.deps.uow.repos.handoffs.update(f.scope, row!.id, {
      step: "done", readingId, source: { kind: "site", value: "https://cafeaurora.com.br", normalized: "https://cafeaurora.com.br/" },
      captured: { publicContent: site ? [item(site)] : [], images: [] },
      decisions: {
        identity: { name: item("Café Aurora"), logo: null, colors: [], fonts: [], paletteChoice: "site" },
        networks: [], images: { kept: [], removed: [], uploaded: [] },
      },
    });
    const taskIntentId = await f.diagnosisFixture.requestDiagnosis(f.t, f.scope, row!.id, readingId);
    return { handoffId: row!.id, readingId, taskIntentId };
  }

  const record = (f: Fixture, deps: Fixture["t"]["deps"], taskIntentId: string, output: unknown = OUTPUT) =>
    f.executeCommand(deps, { actor: JOB, workspaceId: f.workspaceId, accountId: f.accountId },
      { type: "diagnosis_record", payload: { taskIntentId, output, model: output ? "muse-spark-1.3-contributor" : null, promptVersion: output ? "v1" : null } } as never);
  const claim = (f: Fixture, taskIntentId: string) =>
    f.executeCommand(f.t.deps, { actor: JOB, workspaceId: f.workspaceId, accountId: f.accountId }, { type: "diagnosis_claim", payload: { taskIntentId } });

  const documents = (f: Fixture, db: "dbA" | "dbB" = "dbA") => f[db].select().from(f.equipeSchema.equipeBrandDocuments)
    .where(and(eq(f.equipeSchema.equipeBrandDocuments.accountId, f.accountId), eq(f.equipeSchema.equipeBrandDocuments.kind, "diagnosis")));
  const recordedEvents = (f: Fixture, db: "dbA" | "dbB" = "dbA") => f[db].select().from(f.equipeSchema.equipeEvents)
    .where(and(eq(f.equipeSchema.equipeEvents.accountId, f.accountId), eq(f.equipeSchema.equipeEvents.eventType, "diagnostic.recorded")));

  it("concurrent diagnosis_record of the SAME intent from two connections → exactly one document and one diagnostic.recorded", async () => {
    const { f, taskIntentId } = await setup();
    await claim(f, taskIntentId);
    const barrier = pauseAfterLockedAccount(f.uowA, f.accountId);
    const firstDeps = { ...f.t.deps, uow: barrier.uow };
    const first = record(f, firstDeps, taskIntentId);
    await barrier.entered;
    const second = record(f, f.second.deps, taskIntentId);
    try {
      await waitUntilBlocked(f.clientA, f.pidB);
      barrier.proceed();
    } finally { barrier.proceed(); }
    const [a, b] = await Promise.all([first, second]);
    expect(a.ok && b.ok).toBe(true);
    const results = [a, b].map(outcome => (outcome.ok ? outcome.value.data : {}) as Record<string, unknown>);
    expect(results.filter(result => result.duplicate === true)).toHaveLength(1);
    expect(results.filter(result => typeof result.version === "number")).toHaveLength(1);
    const docs = await documents(f);
    expect(docs).toHaveLength(1);
    const events = await recordedEvents(f);
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toEqual({ documentId: docs[0]!.id });
  });

  it("two intents of the same reading recorded concurrently → still one document and one event", async () => {
    const { f, taskIntentId, handoffId, readingId } = await setup();
    const other = await f.diagnosisFixture.requestDiagnosis(f.t, f.scope, handoffId, readingId);
    const barrier = pauseAfterLockedAccount(f.uowA, f.accountId);
    const first = record(f, { ...f.t.deps, uow: barrier.uow }, taskIntentId);
    await barrier.entered;
    const second = record(f, f.second.deps, other);
    try { await waitUntilBlocked(f.clientA, f.pidB); barrier.proceed(); } finally { barrier.proceed(); }
    await Promise.all([first, second]);
    expect(await documents(f)).toHaveLength(1);
    expect(await recordedEvents(f)).toHaveLength(1);
  });

  it("document and diagnostic.recorded become visible to another connection TOGETHER, only at commit", async () => {
    const { f, taskIntentId } = await setup();
    const intercept = interceptRecordedEvent(f.uowA, "pause");
    const running = record(f, { ...f.t.deps, uow: intercept.uow }, taskIntentId);
    await intercept.entered;
    // The document is already inserted in A's open transaction; B must see NOTHING yet.
    expect(await documents(f, "dbB")).toHaveLength(0);
    expect(await recordedEvents(f, "dbB")).toHaveLength(0);
    intercept.proceed();
    const outcome = await running;
    expect(outcome.ok).toBe(true);
    const docs = await documents(f, "dbB");
    const events = await recordedEvents(f, "dbB");
    expect(docs).toHaveLength(1);
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toEqual({ documentId: docs[0]!.id });
    expect(docs[0]).toMatchObject({ kind: "diagnosis", version: 1, createdByRole: "research" });
  });

  it("a failure after the document insert rolls the document back: no document, no event", async () => {
    const { f, taskIntentId } = await setup();
    const intercept = interceptRecordedEvent(f.uowA, "throw");
    await expect(record(f, { ...f.t.deps, uow: intercept.uow }, taskIntentId)).rejects.toThrow("injected_event_failure");
    expect(await documents(f, "dbB")).toHaveLength(0);
    expect(await recordedEvents(f, "dbB")).toHaveLength(0);
    const notifications = (await f.uowB.repos.events.list(f.scope, { eventType: "notification.requested" }))
      .filter(event => (event.payload as { templateKey?: string }).templateKey?.startsWith("diagnosis."));
    expect(notifications).toHaveLength(0);
    // and the run can still record afterwards
    expect((await record(f, f.second.deps, taskIntentId)).ok).toBe(true);
    expect(await documents(f, "dbB")).toHaveLength(1);
  });

  it("writes the notification in the same commit (ready, or insufficient)", async () => {
    const { f, taskIntentId } = await setup();
    await record(f, f.second.deps, taskIntentId);
    const templates = async () => (await f.uowB.repos.events.list(f.scope, { eventType: "notification.requested" }))
      .map(event => (event.payload as { recipientRole?: string; templateKey?: string })).filter(p => p.templateKey?.startsWith("diagnosis."));
    expect(await templates()).toEqual([{ recipientRole: "approver", templateKey: "diagnosis.ready" }]);

    const short = await setup({ site: "Café Aurora. Torra própria." });
    await record(short.f, short.f.second.deps, short.taskIntentId, null);
    const events = await short.f.uowB.repos.events.list(short.f.scope, { eventType: "notification.requested" });
    expect(events.map(event => (event.payload as { templateKey?: string }).templateKey)).toContain("diagnosis.insufficient");
  });

  it("the document is immutable at the database and versions are unique per account and kind", async () => {
    const { f, taskIntentId } = await setup();
    await record(f, f.second.deps, taskIntentId);
    const [doc] = await documents(f);
    // drizzle wraps the driver error: the database message lives in `cause`
    const reason = async (run: () => Promise<unknown>) => {
      try { await run(); } catch (error) { return String((error as { cause?: Error }).cause?.message ?? error); }
      throw new Error("expected the statement to be rejected");
    };
    expect(await reason(() => f.dbA.update(f.equipeSchema.equipeBrandDocuments).set({ content: { tampered: true } })
      .where(eq(f.equipeSchema.equipeBrandDocuments.id, doc!.id)))).toContain("brand_document_versions_are_immutable");
    expect(await reason(() => f.dbA.insert(f.equipeSchema.equipeBrandDocuments).values({
      id: crypto.randomUUID(), workspaceId: f.workspaceId, accountId: f.accountId, clientProfileId: doc!.clientProfileId,
      kind: "diagnosis", version: 1, content: {}, createdByRole: "research",
    }))).toContain("equipe_brand_documents_version_uq");
    expect(await documents(f)).toHaveLength(1);
    const [unchanged] = await documents(f);
    expect(unchanged!.content).toEqual(doc!.content);
  });

  it("correct_source then a new confirmed reading and record → version 2, history intact", async () => {
    const { f, taskIntentId } = await setup({ site: "Café Aurora. Torra própria." });
    await claim(f, taskIntentId);
    expect((await record(f, f.t.deps, taskIntentId, null)).ok).toBe(true);
    f.t.deps.freeBudget = { remainingUsdCents: async () => 100 }; // the request deps wire the real reader; the PG harness has none
    const corrected = await f.executeCommand(f.t.deps, { actor: f.approver, workspaceId: f.workspaceId, accountId: f.accountId }, { type: "diagnosis_correct_source", payload: {} });
    expect(corrected.ok).toBe(true);
    const [row] = await f.uowB.repos.handoffs.list(f.scope);
    expect(row!.step).toBe("source");
    const set = await f.executeCommand(f.t.deps, { actor: f.approver, workspaceId: f.workspaceId, accountId: f.accountId }, {
      type: "handoff_set_source", payload: { expectedStep: row!.step, expectedVersion: row!.version, kind: "site", value: "https://cafenovo.com.br" } });
    expect(set.ok).toBe(true);

    const again = await confirm(f);
    expect((await claim(f, again.taskIntentId)).ok).toBe(true);
    const second = await record(f, f.second.deps, again.taskIntentId);
    expect(second.ok && second.value.data).toMatchObject({ version: 2, status: "complete" });
    const docs = (await documents(f, "dbB")).sort((a, b) => a.version - b.version);
    expect(docs.map(doc => doc.version)).toEqual([1, 2]);
    expect((docs[0]!.content as { status: string }).status).toBe("insufficient");
    expect((docs[1]!.content as { status: string }).status).toBe("complete");
    expect(await recordedEvents(f, "dbB")).toHaveLength(2);
  });

  it("reopening: the step change and diagnosis.reopened become visible together at commit, and the diagnosis stops counting", async () => {
    const { f, taskIntentId } = await setup({ site: "Café Aurora. Torra própria." });
    const { hasRecordedDiagnostic } = await import("../agents/free-budget");
    await claim(f, taskIntentId);
    expect((await record(f, f.t.deps, taskIntentId, null)).ok).toBe(true);
    expect(await hasRecordedDiagnostic(f.uowB.repos, f.scope)).toBe(true);
    const [doc] = await documents(f);
    const reopenedRows = (db: "dbA" | "dbB" = "dbB") => f[db].select().from(f.equipeSchema.equipeEvents)
      .where(and(eq(f.equipeSchema.equipeEvents.accountId, f.accountId), eq(f.equipeSchema.equipeEvents.eventType, "diagnosis.reopened")));

    // paused right before the last write of the transaction (handoff.card): step + reopened event are written, not committed
    const intercept = interceptRecordedEvent(f.uowA, "pause", "handoff.card");
    const deps = { ...f.t.deps, uow: intercept.uow, freeBudget: { remainingUsdCents: async () => 100 } };
    const running = f.executeCommand(deps, { actor: f.approver, workspaceId: f.workspaceId, accountId: f.accountId }, { type: "diagnosis_correct_source", payload: {} });
    await intercept.entered;
    expect((await f.uowB.repos.handoffs.list(f.scope))[0]!.step).toBe("done");
    expect(await reopenedRows()).toHaveLength(0);
    expect(await hasRecordedDiagnostic(f.uowB.repos, f.scope)).toBe(true);
    intercept.proceed();
    expect((await running).ok).toBe(true);

    expect((await f.uowB.repos.handoffs.list(f.scope))[0]!.step).toBe("source");
    const reopened = await reopenedRows();
    expect(reopened).toHaveLength(1);
    expect(reopened[0]!.payload).toEqual({ documentId: doc!.id });
    expect(await hasRecordedDiagnostic(f.uowB.repos, f.scope)).toBe(false);
  });

  it("a balance below the requirement leaves no trace on the database", async () => {
    const { f, taskIntentId } = await setup({ site: "Café Aurora. Torra própria." });
    await claim(f, taskIntentId);
    await record(f, f.t.deps, taskIntentId, null);
    const deps = { ...f.t.deps, freeBudget: { remainingUsdCents: async () => 0 } };
    const outcome = await f.executeCommand(deps, { actor: f.approver, workspaceId: f.workspaceId, accountId: f.accountId }, { type: "diagnosis_correct_source", payload: {} });
    expect(!outcome.ok && outcome.error.code).toBe("insufficient_balance");
    expect((await f.uowB.repos.handoffs.list(f.scope))[0]!.step).toBe("done");
    expect(await f.uowB.repos.events.list(f.scope, { eventType: "diagnosis.reopened" })).toHaveLength(0);
  });
});
