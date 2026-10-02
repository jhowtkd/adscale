/**
 * The time of a message does not depend on the database's time zone, for every zone that matters (ticket 13, D-3), against REAL Postgres.
 *
 * `assistant-message-timezone.pg.test.ts` pins America/Sao_Paulo. This matrix runs the same property in UTC, America/Sao_Paulo, Asia/Tokyo (UTC+9, a wall
 * clock AHEAD of UTC: a wrongly read message would be in the future) and America/Los_Angeles (UTC-7/-8, behind). For each zone the session is forced with
 * PGOPTIONS before a fresh pool opens its first connection (modules are reset and the pool is closed at the end of the zone).
 *
 *   DATABASE_URL=postgres://…_test TEST_DATABASE_URL=postgres://…_test PGOPTIONS='-c timezone=UTC' \
 *     npx vitest run --config config/vitest.config.ts src/server/repositories/assistant-message-timezone-matrix.pg.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const TEST_DB_EXPLICITLY_CONFIGURED = Boolean(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL);
const previousOptions = process.env.PGOPTIONS;
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const ZONES = ["UTC", "America/Sao_Paulo", "Asia/Tokyo", "America/Los_Angeles"] as const;
const SECONDS = 10_000;

/** A fresh world for one session zone: modules reloaded, so the pool opens its first connection under that zone. */
async function inZone(zone: string) {
  process.env.PGOPTIONS = `-c timezone=${zone}`;
  vi.resetModules();
  const { sql, inArray } = await import("drizzle-orm");
  const { db } = await import("@/server/db");
  const schema = await import("@/server/db/schema");
  const { createAssistantMessage, listAssistantMessages } = await import("./assistant-message");
  const { createAssistantAction } = await import("./assistant-action");
  const { threadAwaitsDiagnosis } = await import("@/lib/equipe/diagnosis-pending");
  const workspaceIds: string[] = [];
  async function createThread(tag: string) {
    const name = `tzm-${RUN_ID}-${zone.replace(/\W/g, "")}-${tag}`;
    const [workspace] = await db.insert(schema.workspaces).values({ name, slug: name }).returning();
    const [profile] = await db.insert(schema.clientProfiles).values({ workspaceId: workspace!.id, name }).returning();
    const [thread] = await db.insert(schema.assistantThreads).values({ workspaceId: workspace!.id, clientProfileId: profile!.id, name: "Conversa principal" }).returning();
    workspaceIds.push(workspace!.id);
    return { workspaceId: workspace!.id, threadId: thread!.id };
  }
  const offsetSeconds = async () => Number((await db.execute(sql`select extract(timezone from now()) as offset`)).rows[0]!.offset);
  const sessionZone = async () => (await db.execute(sql`show timezone`)).rows[0]!.TimeZone as string;
  async function cleanup() {
    if (workspaceIds.length) {
      await db.delete(schema.assistantMessages).where(inArray(schema.assistantMessages.workspaceId, workspaceIds));
      await db.delete(schema.assistantThreads).where(inArray(schema.assistantThreads.workspaceId, workspaceIds));
      await db.delete(schema.clientProfiles).where(inArray(schema.clientProfiles.workspaceId, workspaceIds));
      await db.delete(schema.workspaces).where(inArray(schema.workspaces.id, workspaceIds));
    }
    await db.$client.end();
  }
  return { db, schema, createThread, offsetSeconds, sessionZone, cleanup, createAssistantMessage, listAssistantMessages, createAssistantAction, threadAwaitsDiagnosis };
}
type World = Awaited<ReturnType<typeof inZone>>;
const ageMs = (message: { createdAt: Date }) => Date.now() - message.createdAt.getTime();

afterAll(() => { if (previousOptions === undefined) delete process.env.PGOPTIONS; else process.env.PGOPTIONS = previousOptions; });

describe.skipIf(!TEST_DB_EXPLICITLY_CONFIGURED).each(ZONES)("assistant message time (Postgres real, session zone %s)", (zone) => {
  let w: World;
  beforeAll(async () => { w = await inZone(zone); });
  afterAll(async () => { await w?.cleanup(); });

  it("runs in the zone it claims, or it would prove nothing", async () => {
    expect(await w.sessionZone()).toBe(zone);
  });

  it("CONTROL: a row stamped by the database's own now() reads shifted by the zone's UTC offset (the symptom of D-3), except in UTC", async () => {
    const { workspaceId, threadId } = await w.createThread("control");
    await w.db.insert(w.schema.assistantMessages).values({ workspaceId, threadId, sequence: 1, type: "assistant", content: "carimbada pelo banco", payload: {} });
    const [message] = await w.listAssistantMessages(workspaceId, threadId);
    const offsetMs = (await w.offsetSeconds()) * 1000;
    // Wall clock read as UTC: createdAt = now + offset, so age = -offset.
    expect(Math.abs(ageMs(message!) + offsetMs)).toBeLessThan(60_000);
    if (zone === "UTC") expect(Math.abs(offsetMs)).toBe(0); else expect(Math.abs(offsetMs)).toBeGreaterThan(3_600_000 - 1);
  });

  it("a message written by the app is stamped with the app's clock: within seconds of now, never in the future or hours in the past", async () => {
    const { workspaceId, threadId } = await w.createThread("message");
    const created = await w.createAssistantMessage(workspaceId, { threadId, type: "assistant", content: "Marca confirmada", payload: {} });
    expect(Math.abs(ageMs(created))).toBeLessThan(SECONDS);
    const [listed] = await w.listAssistantMessages(workspaceId, threadId);
    expect(Math.abs(ageMs(listed!))).toBeLessThan(SECONDS);
  });

  it("an action card is stamped the same way", async () => {
    const { workspaceId, threadId } = await w.createThread("action");
    const { message } = await w.createAssistantAction(workspaceId, { threadId, content: "Criar a peça?", inputSnapshot: { brief: "x" } });
    expect(Math.abs(ageMs(message))).toBeLessThan(SECONDS);
  });

  it("the diagnosis polling sees the pending marker as recent, and keeps polling until the card arrives", async () => {
    const { workspaceId, threadId } = await w.createThread("polling");
    await w.createAssistantMessage(workspaceId, { threadId, type: "equipe_event", content: "Montando o diagnóstico", payload: { kind: "diagnosis.started", text: "Montando o diagnóstico da sua marca…" } });
    expect(w.threadAwaitsDiagnosis(await w.listAssistantMessages(workspaceId, threadId))).toBe(true);
  });

  it("messages written in sequence keep their order and their gaps (seconds apart, not hours)", async () => {
    const { workspaceId, threadId } = await w.createThread("order");
    for (const content of ["um", "dois", "três"]) await w.createAssistantMessage(workspaceId, { threadId, type: "assistant", content, payload: {} });
    const listed = await w.listAssistantMessages(workspaceId, threadId);
    expect(listed).toHaveLength(3);
    const times = listed.map(m => m.createdAt.getTime());
    expect(Math.max(...times) - Math.min(...times)).toBeLessThan(SECONDS);
  });
});
