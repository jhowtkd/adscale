/**
 * Real-PostgreSQL regression for Layerize claim racing a new selection.
 *
 * A test transaction holds the currently selected output with FOR UPDATE
 * before both repository calls start. PostgreSQL must show both public
 * queries waiting on that real lock before the transaction is released.
 * After the lock is released both operations may succeed: Layerize stays
 * attached to its source output and the other Piece may become selected.
 *
 * Requires:
 *   DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
 *   TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
 *   npm test -- --run tests/integration/creative-work-layerization-selection-lock.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  clientProfiles,
  creativeWorkItems,
  creativeWorkOutputs,
  user,
  workspaces,
} from "@/server/db/schema";
import { layerizationStateFromDatabase, type LayerizationState } from "@/server/layerize/contracts";
import { claimCreativeWorkLayerization } from "@/server/repositories/creative-work-layerization";
import { selectCreativeWorkOutput } from "@/server/repositories/creative-work";

const TEST_DB_EXPLICITLY_CONFIGURED = Boolean(
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL,
);
const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const userId = `layerize-lock-${runId}`;
const createdWorkspaceIds: string[] = [];

let workspaceId = "";
let clientProfileId = "";
const LOCK_WAITER_TIMEOUT_MS = 5_000;

type LockWaiter = {
  pid: number;
  query: string;
  wait_event_type: string | null;
  wait_event: string | null;
  locktype: string;
  mode: string;
  relation: string | null;
  transactionid: string | null;
};

function queuedState(attemptId: string): LayerizationState {
  const now = new Date();
  return {
    status: "queued",
    attemptId,
    callbackTokenHash: "a".repeat(64),
    callbackConsumedAt: null,
    requestedByUserId: userId,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    callbackDeadlineAt: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
    latencyMs: null,
    providerRequestId: null,
    providerModel: "bytedance/seedream/v5/pro/layerize",
    providerEndpoint: "https://queue.fal.run/bytedance/seedream/v5/pro/layerize",
    estimatedCostUsd: null,
    baseWidth: null,
    baseHeight: null,
    layers: [],
    psdKey: null,
    diagnosticZipKey: null,
    fidelity: null,
    failureCode: null,
  };
}

function deferred() {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function holdSelectedOutputLock(
  workspaceId: string,
  workItemId: string,
  outputId: string,
) {
  const acquired = deferred();
  const release = deferred();
  const transaction = db.transaction(async (tx) => {
    const [selected] = await tx
      .select({ id: creativeWorkOutputs.id })
      .from(creativeWorkOutputs)
      .where(and(
        eq(creativeWorkOutputs.workspaceId, workspaceId),
        eq(creativeWorkOutputs.workItemId, workItemId),
        eq(creativeWorkOutputs.id, outputId),
        eq(creativeWorkOutputs.isSelected, true),
      ))
      .for("update");
    if (!selected) {
      throw new Error(`Selected output ${outputId} was not found for lock holder`);
    }
    acquired.resolve();
    await release.promise;
  });
  void transaction.catch((error: unknown) => acquired.reject(error));

  try {
    await acquired.promise;
  } catch (error) {
    release.resolve();
    await transaction.catch(() => undefined);
    throw error;
  }

  return { transaction, release: release.resolve };
}

async function findCreativeWorkLockWaiters(): Promise<LockWaiter[]> {
  const result = await db.execute<LockWaiter>(sql`
    select distinct on (activity.pid)
      activity.pid,
      activity.query,
      activity.wait_event_type,
      activity.wait_event,
      locks.locktype,
      locks.mode,
      locks.relation::regclass::text as relation,
      locks.transactionid::text as transactionid
    from pg_stat_activity as activity
    join pg_locks as locks on locks.pid = activity.pid
    where activity.pid <> pg_backend_pid()
      and activity.wait_event_type = 'Lock'
      and locks.granted = false
      and activity.query ilike ${"%creative_work_outputs%"}
    order by activity.pid, locks.locktype
  `);
  return Array.from(new Map(
    result.rows.map((waiter) => [waiter.pid, waiter]),
  ).values());
}

async function captureExistingCreativeWorkLockWaiterPids(): Promise<Set<number>> {
  const waiters = await findCreativeWorkLockWaiters();
  return new Set(waiters.map(({ pid }) => pid));
}

async function waitForCreativeWorkLockWaiters(
  existingPids: ReadonlySet<number>,
): Promise<LockWaiter[]> {
  const deadline = Date.now() + LOCK_WAITER_TIMEOUT_MS;
  let lastWaiters: LockWaiter[] = [];

  while (Date.now() < deadline) {
    const waiters = (await findCreativeWorkLockWaiters())
      .filter(({ pid }) => !existingPids.has(pid));
    lastWaiters = waiters;

    const hasSelectionWaiter = waiters.some(({ query }) =>
      /select[\s\S]*for update/i.test(query),
    );
    const hasClaimWaiter = waiters.some(({ query }) =>
      /update[\s\S]*creative_work_outputs/i.test(query),
    );
    if (waiters.length >= 2 && hasSelectionWaiter && hasClaimWaiter) {
      return waiters;
    }

    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  throw new Error(
    `Timed out after ${LOCK_WAITER_TIMEOUT_MS}ms waiting for two creative_work_outputs lock waiters: ${
      JSON.stringify(lastWaiters)
    }`,
  );
}

async function createRace(index: number) {
  const [work] = await db.insert(creativeWorkItems).values({
    workspaceId,
    clientProfileId,
    createdByUserId: userId,
    toolKind: "social_post",
    title: `Layerize lock ${runId}-${index}`,
    request: "Synthetic transaction race",
    format: "4:5",
    settings: { targetFormats: [] },
    status: "completed",
  }).returning();

  const [selected] = await db.insert(creativeWorkOutputs).values({
    workspaceId,
    workItemId: work.id,
    creativeLevel: "conservative",
    targetFormat: "4:5",
    operationKey: `selected-${index}`,
    status: "completed",
    outputKey: `creative-work/${work.id}/selected.png`,
    quality: { schemaVersion: 1, objectiveVerdict: "pass" },
    isSelected: true,
  }).returning();
  const [candidate] = await db.insert(creativeWorkOutputs).values({
    workspaceId,
    workItemId: work.id,
    creativeLevel: "balanced",
    targetFormat: "4:5",
    operationKey: `candidate-${index}`,
    status: "completed",
    outputKey: `creative-work/${work.id}/candidate.png`,
    quality: { schemaVersion: 1, objectiveVerdict: "pass" },
    isSelected: false,
  }).returning();

  return { work, selected, candidate };
}

describe.skipIf(!TEST_DB_EXPLICITLY_CONFIGURED)(
  "creative-work Layerize selection lock (PostgreSQL real)",
  () => {
    beforeAll(async () => {
      await db.execute(sql`select 1`);
      const migration = await db.execute(sql`
        select column_name
        from information_schema.columns
        where table_schema = 'adscale_app'
          and table_name = 'creative_work_outputs'
          and column_name = 'layerization'
      `);
      if (migration.rows.length === 0) {
        throw new Error("Migration 0085 is not applied to the integration database");
      }

      await db.insert(user).values({
        id: userId,
        name: "Layerize Lock Test",
        email: `${userId}@example.com`,
        emailVerified: true,
      });
      const [workspace] = await db.insert(workspaces).values({
        name: `Layerize Lock ${runId}`,
        slug: `layerize-lock-${runId}`,
      }).returning();
      const [profile] = await db.insert(clientProfiles).values({
        workspaceId: workspace.id,
        name: "Synthetic lock brand",
      }).returning();
      workspaceId = workspace.id;
      clientProfileId = profile.id;
      createdWorkspaceIds.push(workspace.id);
    }, 30_000);

    afterAll(async () => {
      if (createdWorkspaceIds.length > 0) {
        await db.delete(creativeWorkOutputs).where(inArray(creativeWorkOutputs.workspaceId, createdWorkspaceIds));
        await db.delete(creativeWorkItems).where(inArray(creativeWorkItems.workspaceId, createdWorkspaceIds));
        await db.delete(clientProfiles).where(inArray(clientProfiles.workspaceId, createdWorkspaceIds));
        await db.delete(workspaces).where(inArray(workspaces.id, createdWorkspaceIds));
      }
      await db.delete(user).where(eq(user.id, userId));
    }, 30_000);

    it("lets Layerize claim and a new selection both complete after the row lock is released", async () => {
      for (let index = 0; index < 12; index += 1) {
        const race = await createRace(index);
        const existingPids = await captureExistingCreativeWorkLockWaiterPids();
        const lock = await holdSelectedOutputLock(
          workspaceId,
          race.work.id,
          race.selected.id,
        );
        const pending: Promise<unknown>[] = [];

        try {
          const claimPromise = claimCreativeWorkLayerization({
            workspaceId,
            workItemId: race.work.id,
            outputId: race.selected.id,
            state: queuedState(`attempt-${runId}-${index}`),
          });
          const selectionPromise = selectCreativeWorkOutput(
            workspaceId,
            race.work.id,
            race.candidate.id,
            { confirmObjective: true },
          );
          pending.push(claimPromise, selectionPromise);

          const waiters = await waitForCreativeWorkLockWaiters(existingPids);
          expect(new Set(waiters.map(({ pid }) => pid)).size).toBeGreaterThanOrEqual(2);
          expect(waiters.some(({ query }) => /select[\s\S]*for update/i.test(query))).toBe(true);
          expect(waiters.some(({ query }) => /update[\s\S]*creative_work_outputs/i.test(query))).toBe(true);
          expect(waiters.every(({ wait_event_type, locktype }) => (
            wait_event_type === "Lock" && Boolean(locktype)
          ))).toBe(true);

          lock.release();
          const [claimed, newlySelected] = await Promise.all([claimPromise, selectionPromise]);
          await lock.transaction;

          expect(claimed).toBeTruthy();
          expect(newlySelected?.id).toBe(race.candidate.id);

          const rows = await db.select().from(creativeWorkOutputs)
            .where(eq(creativeWorkOutputs.workItemId, race.work.id));
          const original = rows.find((row) => row.id === race.selected.id);
          const candidate = rows.find((row) => row.id === race.candidate.id);
          expect(original).toBeDefined();
          expect(candidate).toBeDefined();
          expect(original?.isSelected).toBe(false);
          expect(candidate?.isSelected).toBe(true);
          expect(layerizationStateFromDatabase(original?.layerization)?.status).toBe("queued");
        } finally {
          lock.release();
          await Promise.allSettled([lock.transaction, ...pending]);
        }
      }
    }, 30_000);
  },
);
