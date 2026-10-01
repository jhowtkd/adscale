/**
 * The plan offer is posted once per thread, against REAL Postgres. The mocked
 * repository test proves the branches; this one proves the exclusion: turns
 * racing on one thread (two tabs, two devices) produce exactly one card,
 * because the lookup runs under the thread's row lock.
 *
 *   DATABASE_URL=postgres://… TEST_DATABASE_URL=postgres://… \
 *     npx vitest run --config config/vitest.config.ts src/server/repositories/assistant-message.pg.test.ts
 */
import { afterAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";

const TEST_DB_EXPLICITLY_CONFIGURED = Boolean(
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL,
);

import { db } from "@/server/db";
import { assistantMessages, assistantThreads, clientProfiles, workspaces } from "@/server/db/schema";
import { createAssistantMessage, createAssistantPlanOfferOnce } from "./assistant-message";

const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let seq = 0;
const createdWorkspaceIds: string[] = [];

async function createThread() {
  seq += 1;
  const tag = `offer-${RUN_ID}-${seq}`;
  const [workspace] = await db.insert(workspaces).values({ name: tag, slug: tag }).returning();
  const [profile] = await db.insert(clientProfiles).values({ workspaceId: workspace.id, name: tag }).returning();
  const [thread] = await db
    .insert(assistantThreads)
    .values({ workspaceId: workspace.id, clientProfileId: profile.id, name: "Equipe" })
    .returning();
  createdWorkspaceIds.push(workspace.id);
  return { workspaceId: workspace.id, threadId: thread.id, clientProfileId: profile.id };
}

function offer(threadId: string) {
  return {
    threadId,
    type: "equipe_card" as const,
    content: "ADScale para a sua marca",
    payload: {
      kind: "plan_offer" as const,
      accountId: "account-1",
      title: "ADScale para a sua marca",
      items: [],
      reason: "free_budget_exhausted" as const,
    },
  };
}

async function planOffers(threadId: string) {
  const rows = await db
    .select()
    .from(assistantMessages)
    .where(and(eq(assistantMessages.threadId, threadId), eq(assistantMessages.type, "equipe_card")));
  return rows.filter((row) => (row.payload as { kind?: string }).kind === "plan_offer");
}

afterAll(async () => {
  if (createdWorkspaceIds.length > 0) {
    await db.delete(assistantMessages).where(inArray(assistantMessages.workspaceId, createdWorkspaceIds));
    await db.delete(assistantThreads).where(inArray(assistantThreads.workspaceId, createdWorkspaceIds));
    await db.delete(clientProfiles).where(inArray(clientProfiles.workspaceId, createdWorkspaceIds));
    await db.delete(workspaces).where(inArray(workspaces.id, createdWorkspaceIds));
  }
});

describe.skipIf(!TEST_DB_EXPLICITLY_CONFIGURED)("createAssistantPlanOfferOnce (Postgres real)", () => {
  it("lets exactly one of eight concurrent offers through, and everyone gets that card", async () => {
    const { workspaceId, threadId } = await createThread();
    // Warm the pool: cold connections would let the first transaction finish before the others start.
    await Promise.all(Array.from({ length: 8 }, () => db.execute(sql`select pg_sleep(0.05)`)));

    const results = await Promise.all(
      Array.from({ length: 8 }, () => createAssistantPlanOfferOnce(workspaceId, offer(threadId))),
    );

    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(new Set(results.map((result) => result.row.id)).size).toBe(1);
    expect(await planOffers(threadId)).toHaveLength(1);
  });

  it("finds an offer posted earlier, behind any number of other messages", async () => {
    const { workspaceId, threadId } = await createThread();
    await createAssistantMessage(workspaceId, offer(threadId));
    for (let index = 0; index < 25; index += 1) {
      await createAssistantMessage(workspaceId, { threadId, type: "user", content: `conversa ${index}` });
    }

    const result = await createAssistantPlanOfferOnce(workspaceId, offer(threadId));

    expect(result.created).toBe(false);
    expect(await planOffers(threadId)).toHaveLength(1);
  });

  it("leaves other threads alone, and a plain post still adds the offer a person asked for", async () => {
    const first = await createThread();
    const second = await createThread();
    await createAssistantPlanOfferOnce(first.workspaceId, offer(first.threadId));

    const other = await createAssistantPlanOfferOnce(second.workspaceId, offer(second.threadId));
    await createAssistantMessage(first.workspaceId, offer(first.threadId));

    expect(other.created).toBe(true);
    expect(await planOffers(first.threadId)).toHaveLength(2);
    expect(await planOffers(second.threadId)).toHaveLength(1);
  });
});
