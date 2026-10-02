/**
 * The time of a message does not depend on the database's time zone (ticket 13, D-3), against REAL Postgres in a Brazilian zone.
 *
 * `assistant_messages.created_at` has no time zone. Filled by the database's now(), it holds the SERVER's wall clock, and Drizzle reads it back
 * as UTC: on a Postgres in America/Sao_Paulo every message looked 3 hours old, the 15-minute window of the diagnosis polling dropped the
 * "building" marker at once, and the card of the diagnosis only appeared after a reload (real test of 01/10).
 *
 * The session zone is forced with PGOPTIONS before the pool opens its first connection, so the test means the same thing on a CI database in UTC.
 *
 *   DATABASE_URL=postgres://… TEST_DATABASE_URL=postgres://… \
 *     npx vitest run --config config/vitest.config.ts src/server/repositories/assistant-message-timezone.pg.test.ts
 */
import { afterAll, describe, expect, it } from "vitest";
import { inArray, sql } from "drizzle-orm";

const TEST_DB_EXPLICITLY_CONFIGURED = Boolean(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL);
const previousOptions = process.env.PGOPTIONS;
process.env.PGOPTIONS = "-c timezone=America/Sao_Paulo";

import { db } from "@/server/db";
import { assistantMessages, assistantThreads, clientProfiles, workspaces } from "@/server/db/schema";
import { threadAwaitsDiagnosis } from "@/lib/equipe/diagnosis-pending";
import { createAssistantAction } from "./assistant-action";
import { createAssistantMessage, listAssistantMessages } from "./assistant-message";

const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const createdWorkspaceIds: string[] = [];
const SAO_PAULO_OFFSET_MS = 3 * 3_600_000;

async function createThread(tag: string) {
  const name = `tz-${RUN_ID}-${tag}`;
  const [workspace] = await db.insert(workspaces).values({ name, slug: name }).returning();
  const [profile] = await db.insert(clientProfiles).values({ workspaceId: workspace!.id, name }).returning();
  const [thread] = await db.insert(assistantThreads).values({ workspaceId: workspace!.id, clientProfileId: profile!.id, name: "Conversa principal" }).returning();
  createdWorkspaceIds.push(workspace!.id);
  return { workspaceId: workspace!.id, threadId: thread!.id };
}
const ageMs = (message: { createdAt: Date }) => Date.now() - message.createdAt.getTime();

afterAll(async () => {
  if (previousOptions === undefined) delete process.env.PGOPTIONS; else process.env.PGOPTIONS = previousOptions;
  if (createdWorkspaceIds.length > 0) {
    await db.delete(assistantMessages).where(inArray(assistantMessages.workspaceId, createdWorkspaceIds));
    await db.delete(assistantThreads).where(inArray(assistantThreads.workspaceId, createdWorkspaceIds));
    await db.delete(clientProfiles).where(inArray(clientProfiles.workspaceId, createdWorkspaceIds));
    await db.delete(workspaces).where(inArray(workspaces.id, createdWorkspaceIds));
  }
});

describe.skipIf(!TEST_DB_EXPLICITLY_CONFIGURED)("assistant message time (Postgres real, America/Sao_Paulo)", () => {
  it("runs in a Brazilian session zone, or it would prove nothing", async () => {
    const result = await db.execute(sql`show timezone`);
    expect((result.rows[0] as { TimeZone: string }).TimeZone).toBe("America/Sao_Paulo");
  });

  it("CONTROL: a row stamped by the database's own now() reads 3 hours in the past here, which is the symptom of D-3", async () => {
    const { workspaceId, threadId } = await createThread("control");
    // No createdAt: Drizzle sends DEFAULT, so the column takes the database's now() in the session zone (what the repository did before).
    await db.insert(assistantMessages).values({ workspaceId, threadId, sequence: 1, type: "assistant", content: "carimbada pelo banco", payload: {} });
    const [message] = await listAssistantMessages(workspaceId, threadId);
    expect(ageMs(message!)).toBeGreaterThan(SAO_PAULO_OFFSET_MS - 60_000);
    expect(ageMs(message!)).toBeLessThan(SAO_PAULO_OFFSET_MS + 60_000);
  });

  it("a message written by the app is stamped with the app's clock: its age is seconds, not 3 hours", async () => {
    const { workspaceId, threadId } = await createThread("message");
    const created = await createAssistantMessage(workspaceId, { threadId, type: "assistant", content: "Marca confirmada", payload: {} });
    expect(Math.abs(ageMs(created))).toBeLessThan(10_000);
    const [listed] = await listAssistantMessages(workspaceId, threadId);
    expect(Math.abs(ageMs(listed!))).toBeLessThan(10_000);
  });

  it("an action card (the other place that inserts a message) is stamped the same way", async () => {
    const { workspaceId, threadId } = await createThread("action");
    const { message } = await createAssistantAction(workspaceId, { threadId, content: "Criar a peça?", inputSnapshot: { brief: "x" } });
    expect(Math.abs(ageMs(message))).toBeLessThan(10_000);
  });

  it("so the diagnosis polling sees a pending marker as recent, and keeps polling until the card arrives", async () => {
    const { workspaceId, threadId } = await createThread("polling");
    await createAssistantMessage(workspaceId, { threadId, type: "equipe_event", content: "Montando o diagnóstico", payload: { kind: "diagnosis.started", text: "Montando o diagnóstico da sua marca…" } });
    const messages = await listAssistantMessages(workspaceId, threadId);
    expect(threadAwaitsDiagnosis(messages)).toBe(true);
  });
});
