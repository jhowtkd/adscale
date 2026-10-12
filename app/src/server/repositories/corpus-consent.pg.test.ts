import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { campaigns, clientCorpusConsentEvents, clientCorpusConsents, clientProfiles, derivations, humanQualityCorpusCandidates, humanQualityCorpusItems, user, workspaceMembers, workspaces } from "@/server/db/schema";
import { batchSelectDerivationsForCorpus, selectDerivationForCorpus } from "@/server/human-quality/service";
import { getCorpusConsent, grantCorpusConsent, revokeCorpusConsent } from "./assistant-goal";
import { captureCorpusCandidateFromDerivation } from "@/server/human-quality/candidate-capture";
import { promoteCorpusCandidateToQueue } from "@/server/human-quality/candidate-promotion";
import { autoPromoteCandidate } from "@/server/human-quality/auto-promote";
import { runCorpusBackfillBatch } from "@/server/human-quality/ingestion/backfill";
import { deleteEmptyClientProfile } from "./client-reference";
import { resolveEquipeTestDatabaseUrl } from "@/server/equipe/data/test-database";

const testUrl = process.env.TEST_DATABASE_URL ?? resolveEquipeTestDatabaseUrl();
if (testUrl) {
  const parsed = new URL(testUrl);
  if (!(["localhost", "127.0.0.1"].includes(parsed.hostname) && parsed.pathname.endsWith("_test") && process.env.DATABASE_URL === testUrl)) {
    throw new Error("Corpus consent tests require matching local TEST_DATABASE_URL and DATABASE_URL ending in _test");
  }
}

const createdWorkspaces: string[] = [];
const createdUsers: string[] = [];
const transact = db.transaction.bind(db);
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function scope() {
  const userId = `consent-${randomUUID()}`;
  await db.insert(user).values({ id: userId, name: "Responsável", email: `${userId}@example.com`, emailVerified: true });
  createdUsers.push(userId);
  const [workspace] = await db.insert(workspaces).values({ name: userId, slug: userId }).returning();
  createdWorkspaces.push(workspace.id);
  await db.insert(workspaceMembers).values({ workspaceId: workspace.id, userId, role: "owner" });
  const [profile] = await db.insert(clientProfiles).values({ workspaceId: workspace.id, name: "Marca simulada" }).returning();
  const [campaign] = await db.insert(campaigns).values({ workspaceId: workspace.id, clientProfileId: profile.id, name: "Campanha simulada" }).returning();
  const [derivation] = await db.insert(derivations).values({ workspaceId: workspace.id, campaignId: campaign.id, status: "completed", outputKey: `test-${randomUUID()}` }).returning();
  return { workspaceId: workspace.id, clientProfileId: profile.id, campaignId: campaign.id, derivationId: derivation.id, reviewedByUserId: userId, selectedByUserId: userId };
}

describe.skipIf(!testUrl)("Corpus consent public commands (Postgres)", () => {
  vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });
  beforeAll(async () => { await db.execute(sql`select 1`); });
  afterAll(async () => {
    if (createdWorkspaces.length) await db.delete(workspaces).where(inArray(workspaces.id, createdWorkspaces));
    if (createdUsers.length) await db.delete(user).where(inArray(user.id, createdUsers));
  });

  it("refuses direct selection without consent from the same brand/workspace", async () => {
    const own = await scope();
    await expect(selectDerivationForCorpus(own)).rejects.toMatchObject({ code: "client_consent_required" });
    const [otherBrand] = await db.insert(clientProfiles).values({ workspaceId: own.workspaceId, name: "Outra marca simulada" }).returning();
    await grantCorpusConsent({ ...own, clientProfileId: otherBrand.id });
    await expect(selectDerivationForCorpus(own)).rejects.toMatchObject({ code: "client_consent_required" });
  });

  it("keeps durable authorship, original replay result and distinct grant/revoke/grant decisions", async () => {
    const own = await scope();
    const key = randomUUID();
    const [granted, replay] = await Promise.all([
      grantCorpusConsent({ ...own, idempotencyKey: key }),
      grantCorpusConsent({ ...own, idempotencyKey: key }),
    ]);
    expect(replay).toEqual(granted);
    const item = await selectDerivationForCorpus(own);
    expect(item).toMatchObject({ status: "pending", workspaceId: own.workspaceId, clientProfileId: own.clientProfileId, derivationId: own.derivationId, cohort: "baseline" });
    expect(item.consentEventId).toBe(granted.currentEventId);
    const revoked = await revokeCorpusConsent(own);
    expect(revoked.currentEventId).not.toBe(granted.currentEventId);
    expect(await grantCorpusConsent({ ...own, idempotencyKey: key })).toEqual(granted);
    expect((await getCorpusConsent(own.workspaceId, own.clientProfileId))?.status).toBe("revoked");
    await expect(revokeCorpusConsent({ ...own, idempotencyKey: key })).rejects.toMatchObject({ code: "idempotency_conflict" });
    const regranted = await grantCorpusConsent(own);
    expect(new Set([granted.currentEventId, revoked.currentEventId, regranted.currentEventId]).size).toBe(3);
    const events = await db.select().from(clientCorpusConsentEvents).where(eq(clientCorpusConsentEvents.clientProfileId, own.clientProfileId));
    expect(events).toHaveLength(3);
    expect(events.every((event) => event.reviewedByUserId === own.reviewedByUserId)).toBe(true);
    expect((await db.select().from(humanQualityCorpusItems).where(eq(humanQualityCorpusItems.id, item.id)))[0].consentEventId).toBe(granted.currentEventId);
  });

  it("refuses member decisions, foreign scope and incompatible author/scope reuse", async () => {
    const own = await scope();
    const other = await scope();
    const memberId = `member-${randomUUID()}`;
    await db.insert(user).values({ id: memberId, name: "Membro", email: `${memberId}@example.com` });
    createdUsers.push(memberId);
    await db.insert(workspaceMembers).values({ userId: memberId, workspaceId: own.workspaceId, role: "member" });
    await expect(grantCorpusConsent({ ...own, reviewedByUserId: memberId })).rejects.toMatchObject({ code: "forbidden" });
    await expect(grantCorpusConsent({ ...own, clientProfileId: other.clientProfileId })).rejects.toMatchObject({ code: "clientProfileNotFound" });
    const key = randomUUID();
    await grantCorpusConsent({ ...own, idempotencyKey: key });
    await db.update(workspaceMembers).set({ role: "admin" }).where(eq(workspaceMembers.userId, memberId));
    await expect(grantCorpusConsent({ ...own, reviewedByUserId: memberId, idempotencyKey: key })).rejects.toMatchObject({ code: "idempotency_conflict" });
    expect((await grantCorpusConsent({ ...own, reviewedByUserId: memberId })).reviewedByUserId).toBe(memberId);
    await expect(db.delete(user).where(eq(user.id, own.reviewedByUserId))).rejects.toMatchObject({ cause: { code: "23503" } });
    expect((await getCorpusConsent(own.workspaceId, own.clientProfileId))?.reviewedByUserId).toBe(memberId);
    await expect(grantCorpusConsent({ ...other, idempotencyKey: key })).rejects.toMatchObject({ code: "idempotency_conflict" });
    await expect(selectDerivationForCorpus(other)).rejects.toMatchObject({ code: "client_consent_required" });
    expect(await getCorpusConsent(own.workspaceId, other.clientProfileId)).toBeNull();
  });

  it("returns per-item consent outcomes and preserves ingress after revocation", async () => {
    const own = await scope();
    const [sibling] = await db.insert(derivations).values({ workspaceId: own.workspaceId, campaignId: own.campaignId, status: "completed" }).returning();
    const input = { ...own, derivationIds: [own.derivationId, sibling.id] };
    const refused = await batchSelectDerivationsForCorpus(input);
    expect(refused.results.map((result) => result.outcome)).toEqual(["client_consent_required", "client_consent_required"]);
    expect(refused.summary.consentRequired).toBe(2);
    const grant = await grantCorpusConsent(own);
    const selected = await batchSelectDerivationsForCorpus(input);
    expect(selected.results.map((result) => result.outcome)).toEqual(["selected", "selected"]);
    expect(selected.results.every((result) => result.item?.consentEventId === grant.currentEventId)).toBe(true);
    await revokeCorpusConsent(own);
    await expect(selectDerivationForCorpus({ ...own, corpusVersion: 2 })).rejects.toMatchObject({ code: "client_consent_required" });
    expect((await db.select().from(humanQualityCorpusItems).where(eq(humanQualityCorpusItems.clientProfileId, own.clientProfileId)))).toHaveLength(2);
  });

  it("blocks author deletion and cascades the history with its workspace", async () => {
    const own = await scope();
    await grantCorpusConsent(own);
    await revokeCorpusConsent(own);
    await expect(db.delete(user).where(eq(user.id, own.reviewedByUserId))).rejects.toMatchObject({ cause: { code: "23503" } });
    expect((await getCorpusConsent(own.workspaceId, own.clientProfileId))?.status).toBe("revoked");
    await db.delete(workspaces).where(eq(workspaces.id, own.workspaceId));
    expect(await db.select().from(clientCorpusConsentEvents).where(eq(clientCorpusConsentEvents.workspaceId, own.workspaceId))).toEqual([]);
    expect(await db.select().from(clientCorpusConsents).where(and(eq(clientCorpusConsents.workspaceId, own.workspaceId), eq(clientCorpusConsents.clientProfileId, own.clientProfileId)))).toEqual([]);
  });

  it("keeps empty-brand deletion results and cascades both consent records", async () => {
    const own = await scope();
    await grantCorpusConsent(own);
    expect(await deleteEmptyClientProfile(own.workspaceId, own.clientProfileId)).toEqual({ status: "in_use" });
    await db.delete(campaigns).where(eq(campaigns.id, own.campaignId));
    expect(await deleteEmptyClientProfile(own.workspaceId, own.clientProfileId)).toEqual({ status: "deleted" });
    expect(await getCorpusConsent(own.workspaceId, own.clientProfileId)).toBeNull();
    expect(await db.select().from(clientCorpusConsentEvents).where(eq(clientCorpusConsentEvents.clientProfileId, own.clientProfileId))).toEqual([]);
    expect(await deleteEmptyClientProfile(own.workspaceId, own.clientProfileId)).toEqual({ status: "not_found" });
  });

  it("requires the same current grant for manual/automatic promotion and backfill without losing candidates", async () => {
    const own = await scope();
    const other = await scope();
    const candidate = (await captureCorpusCandidateFromDerivation(own))!;
    await grantCorpusConsent(other);
    const promote = () => promoteCorpusCandidateToQueue({ candidateId: candidate.id, cohort: "baseline", selectedByUserId: other.selectedByUserId });
    await expect(promote()).rejects.toMatchObject({ code: "client_consent_required" });
    await expect(autoPromoteCandidate({ candidateId: candidate.id })).rejects.toMatchObject({ code: "client_consent_required" });
    expect(await runCorpusBackfillBatch({ workspaceId: own.workspaceId })).toMatchObject({ processed: 1, created: 1, promoted: 0, blocked: 1, skipped: 0 });
    const grant = await grantCorpusConsent(own);
    await revokeCorpusConsent(own);
    await expect(promote()).rejects.toMatchObject({ code: "client_consent_required" });
    await expect(autoPromoteCandidate({ candidateId: candidate.id })).rejects.toMatchObject({ code: "client_consent_required" });
    expect(await runCorpusBackfillBatch({ workspaceId: own.workspaceId })).toMatchObject({ promoted: 0, blocked: 1 });
    expect((await db.select().from(humanQualityCorpusCandidates).where(eq(humanQualityCorpusCandidates.id, candidate.id)))[0].promotedCorpusItemId).toBeNull();
    const regrant = await grantCorpusConsent(own);
    const manual = await promote();
    expect(manual.item.consentEventId).toBe(regrant.currentEventId);
    expect(manual.item.consentEventId).not.toBe(grant.currentEventId);
    const [sibling] = await db.insert(derivations).values({ workspaceId: own.workspaceId, campaignId: own.campaignId, status: "completed", outputKey: `test-${randomUUID()}` }).returning();
    const automaticCandidate = (await captureCorpusCandidateFromDerivation({ ...own, derivationId: sibling.id }))!;
    expect((await autoPromoteCandidate({ candidateId: automaticCandidate.id })).item.consentEventId).toBe(regrant.currentEventId);
    await db.insert(derivations).values({ workspaceId: own.workspaceId, campaignId: own.campaignId, status: "completed", outputKey: `test-${randomUUID()}` });
    expect(await runCorpusBackfillBatch({ workspaceId: own.workspaceId })).toMatchObject({ processed: 3, promoted: 1, blocked: 0 });
  });

  it("rolls back history/projection and ingress together on database failure", async () => {
    const own = await scope();
    const fault = new Error("simulated database failure before commit");
    let spy = vi.spyOn(db, "transaction").mockImplementationOnce((callback, config) => transact(async (tx) => {
      await callback(tx);
      throw fault;
    }, config));
    try { await expect(grantCorpusConsent(own)).rejects.toBe(fault); }
    finally { spy.mockRestore(); }
    expect(await getCorpusConsent(own.workspaceId, own.clientProfileId)).toBeNull();
    expect(await db.select().from(clientCorpusConsentEvents).where(eq(clientCorpusConsentEvents.clientProfileId, own.clientProfileId))).toEqual([]);
    const grant = await grantCorpusConsent(own);
    spy = vi.spyOn(db, "transaction").mockImplementationOnce((callback, config) => transact(async (tx) => {
      await callback(tx);
      throw fault;
    }, config));
    try { await expect(selectDerivationForCorpus(own)).rejects.toBe(fault); }
    finally { spy.mockRestore(); }
    expect(await db.select().from(humanQualityCorpusItems).where(eq(humanQualityCorpusItems.clientProfileId, own.clientProfileId))).toEqual([]);
    expect((await getCorpusConsent(own.workspaceId, own.clientProfileId))?.currentEventId).toBe(grant.currentEventId);
    expect((await selectDerivationForCorpus(own)).consentEventId).toBe(grant.currentEventId);
  });

  it.each(["ingress", "revocation"] as const)("serializes the real lock dispute when %s commits first", async (first) => {
    const own = await scope();
    const grant = await grantCorpusConsent(own);
    const ready = deferred();
    const release = deferred();
    const waiting = deferred();
    let waitingPid = 0;
    const spy = vi.spyOn(db, "transaction")
      .mockImplementationOnce((callback, config) => transact(async (tx) => {
        const result = await callback(tx);
        ready.resolve();
        await release.promise;
        return result;
      }, config))
      .mockImplementationOnce((callback, config) => transact(async (tx) => {
        waitingPid = (await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)).rows[0].pid;
        waiting.resolve();
        return callback(tx);
      }, config));
    const firstCommand = first === "ingress" ? selectDerivationForCorpus(own) : revokeCorpusConsent(own);
    let secondCommand: Promise<unknown> | undefined;
    try {
      await ready.promise;
      secondCommand = (first === "ingress" ? revokeCorpusConsent(own) : selectDerivationForCorpus(own))
        .then((value) => ({ value }), (error: unknown) => ({ error }));
      await waiting.promise;
      await vi.waitFor(async () => {
        const activity = await db.execute<{ wait_event_type: string | null }>(sql`select wait_event_type from pg_stat_activity where pid = ${waitingPid}`);
        expect(activity.rows[0].wait_event_type).toBe("Lock");
      }, { timeout: 20_000 });
      release.resolve();
      await firstCommand;
      const result = await secondCommand;
      if (first === "ingress") expect(result).toMatchObject({ value: { status: "revoked" } });
      else expect(result).toMatchObject({ error: { code: "client_consent_required" } });
      const items = await db.select().from(humanQualityCorpusItems).where(eq(humanQualityCorpusItems.clientProfileId, own.clientProfileId));
      expect(items.map((item) => item.consentEventId)).toEqual(first === "ingress" ? [grant.currentEventId] : []);
    } finally {
      release.resolve();
      await Promise.allSettled([firstCommand, ...(secondCommand ? [secondCommand] : [])]);
      spy.mockRestore();
    }
  });

  it("rechecks a grant revoked while automatic backfill is already in progress", async () => {
    const own = await scope();
    await grantCorpusConsent(own);
    const ready = deferred();
    const release = deferred();
    const spy = vi.spyOn(db, "transaction").mockImplementationOnce((callback, config) => transact(async (tx) => {
      ready.resolve();
      await release.promise;
      return callback(tx);
    }, config));
    const backfill = runCorpusBackfillBatch({ workspaceId: own.workspaceId });
    try {
      await ready.promise;
      await revokeCorpusConsent(own);
      release.resolve();
      expect(await backfill).toMatchObject({ processed: 1, promoted: 0, blocked: 1 });
      expect(await db.select().from(humanQualityCorpusItems).where(eq(humanQualityCorpusItems.clientProfileId, own.clientProfileId))).toEqual([]);
      expect((await db.select().from(humanQualityCorpusCandidates).where(eq(humanQualityCorpusCandidates.clientProfileId, own.clientProfileId)))[0].promotedCorpusItemId).toBeNull();
    } finally {
      release.resolve();
      await Promise.allSettled([backfill]);
      spy.mockRestore();
    }
  });

  it("migrates only the known state/author as an initial observation and never backfills historic ingress", async () => {
    const schema = `consent_migration_${randomUUID().replaceAll("-", "")}`;
    const workspaceId = randomUUID();
    const profileId = randomUUID();
    const oldDate = "2026-09-01 12:00:00";
    const migration = (await readFile("drizzle/0140_corpus_consent_history.sql", "utf8")).replaceAll('"adscale_app"', `"${schema}"`);
    expect((await readdir("drizzle")).filter((name) => name.endsWith("_corpus_consent_history.sql")))
      .toEqual(["0140_corpus_consent_history.sql"]);
    const journal: { entries: { idx: number; tag: string }[] } = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
    expect(new Set(journal.entries.map((entry) => entry.idx)).size).toBe(journal.entries.length);
    expect(journal.entries.filter((entry) => entry.tag.endsWith("_corpus_consent_history")))
      .toEqual([expect.objectContaining({ idx: 140, tag: "0140_corpus_consent_history" })]);
    const previous = JSON.parse(await readFile("drizzle/meta/0139_snapshot.json", "utf8"));
    const current = JSON.parse(await readFile("drizzle/meta/0140_snapshot.json", "utf8"));
    expect(current.prevId).toBe(previous.id);
    try {
      await db.execute(sql.raw(`
        CREATE SCHEMA "${schema}";
        CREATE TABLE "${schema}"."user" (id text PRIMARY KEY);
        CREATE TABLE "${schema}".workspaces (id uuid PRIMARY KEY);
        CREATE TABLE "${schema}".client_profiles (id uuid PRIMARY KEY);
        CREATE TABLE "${schema}".client_corpus_consents (
          client_profile_id uuid PRIMARY KEY REFERENCES "${schema}".client_profiles(id) ON DELETE CASCADE,
          workspace_id uuid NOT NULL REFERENCES "${schema}".workspaces(id) ON DELETE CASCADE,
          status text NOT NULL, reviewed_by_user_id text NOT NULL REFERENCES "${schema}"."user"(id) ON DELETE CASCADE,
          granted_at timestamp, revoked_at timestamp, updated_at timestamp NOT NULL
        );
        CREATE TABLE "${schema}".human_quality_corpus_items (id uuid PRIMARY KEY);
        INSERT INTO "${schema}"."user" VALUES ('historic-author');
        INSERT INTO "${schema}".workspaces VALUES ('${workspaceId}');
        INSERT INTO "${schema}".client_profiles VALUES ('${profileId}');
        INSERT INTO "${schema}".client_corpus_consents VALUES ('${profileId}', '${workspaceId}', 'granted', 'historic-author', '${oldDate}', NULL, '${oldDate}');
        INSERT INTO "${schema}".human_quality_corpus_items VALUES ('${randomUUID()}');
      `));
      for (let round = 0; round < 2; round++) {
        for (const statement of migration.split("--> statement-breakpoint")) {
          if (!statement.trim()) continue;
          try { await db.execute(sql.raw(statement)); }
          catch (error) {
            const cause = (error as { cause?: { message?: string } }).cause;
            if (!/already exists|duplicate key|duplicate_object/i.test(cause?.message ?? "")) throw error;
          }
        }
      }
      const history = await db.execute(sql.raw(`SELECT kind, status, reviewed_by_user_id, granted_at::text, occurred_at::text FROM "${schema}".client_corpus_consent_events`));
      expect(history.rows).toEqual([{ kind: "initial_observation", status: "granted", reviewed_by_user_id: "historic-author", granted_at: oldDate, occurred_at: oldDate }]);
      const projection = await db.execute(sql.raw(`SELECT current_event_id FROM "${schema}".client_corpus_consents`));
      expect(projection.rows[0].current_event_id).toEqual(expect.any(String));
      const historical = await db.execute(sql.raw(`SELECT consent_event_id FROM "${schema}".human_quality_corpus_items`));
      expect(historical.rows).toEqual([{ consent_event_id: null }]);
      await expect(db.execute(sql.raw(`DELETE FROM "${schema}"."user" WHERE id = 'historic-author'`))).rejects.toMatchObject({ cause: { code: "23503" } });
    } finally {
      await db.execute(sql.raw(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`));
    }
  });
});
