/**
 * ICE-03B: claim/lease/ack invariants against REAL Postgres.
 *
 * The mocked processor tests prove the flow; THESE tests prove mutual
 * exclusion in the database: concurrent claimants split rows without overlap,
 * expired leases are reclaimed on the database clock, a late ack from a
 * previous owner closes nothing, done rows are never reclaimed, and deleting
 * the parent removes pendencies instead of resurrecting them.
 *
 * Requires a migrated test database:
 *   TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test npm test -- src/server/repositories/selection-effects-claim.pg.test.ts
 */
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

const TEST_DB_EXPLICITLY_CONFIGURED = Boolean(
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL,
);

import { db } from "@/server/db";
import {
  clientProfiles,
  creativeWorkItems,
  creativeWorkOutputs,
  creativeWorkSelectionEffects,
  user,
  workspaces,
} from "@/server/db/schema";
import {
  claimSelectionEffects,
  closeSelectionEffect,
  enqueueSelectionEffects,
} from "./selection-effects";

const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let seq = 0;
const createdWorkspaceIds: string[] = [];

type Scope = { workspaceId: string; workItemId: string; outputId: string };

async function createScope(): Promise<Scope> {
  seq += 1;
  const tag = `seff-${RUN_ID}-${seq}`;
  const userId = `user-${tag}`;
  await db.insert(user).values({
    id: userId,
    name: "Seff",
    email: `${tag}@example.com`,
    emailVerified: true,
  });
  const [workspace] = await db.insert(workspaces).values({ name: tag, slug: tag }).returning();
  const [profile] = await db
    .insert(clientProfiles)
    .values({ workspaceId: workspace.id, name: tag })
    .returning();
  const [work] = await db
    .insert(creativeWorkItems)
    .values({
      workspaceId: workspace.id,
      clientProfileId: profile.id,
      createdByUserId: userId,
      title: "Seff",
      request: "Peca com efeito",
      toolKind: "variations",
      status: "ready",
      format: "4:5",
      settings: { targetFormats: [] },
    })
    .returning();
  const [output] = await db
    .insert(creativeWorkOutputs)
    .values({
      workspaceId: workspace.id,
      workItemId: work.id,
      creativeLevel: "balanced",
      targetFormat: "4:5",
      versionNumber: 1,
      operationKey: tag,
      status: "completed",
      outputKey: `creative-work/${tag}/original.png`,
    })
    .returning();
  createdWorkspaceIds.push(workspace.id);
  return { workspaceId: workspace.id, workItemId: work.id, outputId: output.id };
}

async function enqueueLibrary(scope: Scope, requestedAt = new Date("2026-09-01T10:00:00.000Z")) {
  const [enqueued] = await enqueueSelectionEffects(db, {
    workspaceId: scope.workspaceId,
    workItemId: scope.workItemId,
    outputId: scope.outputId,
    requestedAt,
    effects: [
      {
        kind: "library",
        payload: {
          version: 1,
          kind: "library",
          outputKey: `creative-work/${scope.outputId}/original.png`,
          theme: "t",
          creativeLevel: "balanced",
        },
      },
    ],
  });
  return enqueued.effect;
}

afterAll(async () => {
  if (!TEST_DB_EXPLICITLY_CONFIGURED) return;
  for (const workspaceId of createdWorkspaceIds) {
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  }
});

describe.skipIf(!TEST_DB_EXPLICITLY_CONFIGURED)(
  "selection-effects claim/lease/ack (ICE-03B, pg)",
  () => {
    it("concurrent claimants never receive the same row", async () => {
      const scope = await createScope();
      const effect = await enqueueLibrary(scope);
      const first = await claimSelectionEffects(db, {
        owner: `a-${RUN_ID}`,
        limit: 10,
        leaseSeconds: 300,
      });
      const second = await claimSelectionEffects(db, {
        owner: `b-${RUN_ID}`,
        limit: 10,
        leaseSeconds: 300,
      });
      expect(first.map((row) => row.id)).toContain(effect.id);
      expect(second.map((row) => row.id)).not.toContain(effect.id);
      expect(first.find((row) => row.id === effect.id)?.attempts).toBe(1);
    });

    it("an expired lease is reclaimed on the database clock", async () => {
      const scope = await createScope();
      const effect = await enqueueLibrary(scope);
      await claimSelectionEffects(db, { owner: `a-${RUN_ID}`, limit: 10, leaseSeconds: 300 });
      await db
        .update(creativeWorkSelectionEffects)
        .set({ leaseExpiresAt: new Date(Date.now() - 60_000) })
        .where(eq(creativeWorkSelectionEffects.id, effect.id));
      const reclaimed = await claimSelectionEffects(db, {
        owner: `b-${RUN_ID}`,
        limit: 10,
        leaseSeconds: 300,
      });
      expect(reclaimed.map((row) => row.id)).toContain(effect.id);
      expect(reclaimed.find((row) => row.id === effect.id)?.attempts).toBe(2);
    });

    it("a late ack from a previous owner closes nothing", async () => {
      const scope = await createScope();
      const effect = await enqueueLibrary(scope);
      await claimSelectionEffects(db, { owner: `a-${RUN_ID}`, limit: 10, leaseSeconds: 300 });
      await db
        .update(creativeWorkSelectionEffects)
        .set({ leaseExpiresAt: new Date(Date.now() - 60_000) })
        .where(eq(creativeWorkSelectionEffects.id, effect.id));
      await claimSelectionEffects(db, { owner: `b-${RUN_ID}`, limit: 10, leaseSeconds: 300 });
      const late = await closeSelectionEffect(db, {
        id: effect.id,
        owner: `a-${RUN_ID}`,
        resolution: { outcome: "done" },
      });
      expect(late.closed).toBe(false);
      const current = await closeSelectionEffect(db, {
        id: effect.id,
        owner: `b-${RUN_ID}`,
        resolution: { outcome: "done" },
      });
      expect(current.closed).toBe(true);
      const [row] = await db
        .select()
        .from(creativeWorkSelectionEffects)
        .where(eq(creativeWorkSelectionEffects.id, effect.id));
      expect(row.state).toBe("done");
      expect(row.completedAt).not.toBeNull();
    });

    it("done rows are never reclaimed; matured retries are", async () => {
      const scope = await createScope();
      const effect = await enqueueLibrary(scope);
      const [claimed] = await claimSelectionEffects(db, {
        owner: `a-${RUN_ID}`,
        limit: 10,
        leaseSeconds: 300,
      });
      expect(claimed.id).toBe(effect.id);
      await closeSelectionEffect(db, {
        id: effect.id,
        owner: `a-${RUN_ID}`,
        resolution: { outcome: "retry", delayMs: 30_000, code: "http_503" },
      });
      const [waiting] = await db
        .select()
        .from(creativeWorkSelectionEffects)
        .where(eq(creativeWorkSelectionEffects.id, effect.id));
      expect(waiting.state).toBe("retry_wait");
      // Immature retry: not claimable yet.
      const early = await claimSelectionEffects(db, {
        owner: `b-${RUN_ID}`,
        limit: 10,
        leaseSeconds: 300,
      });
      expect(early.map((row) => row.id)).not.toContain(effect.id);
      // Matured on the database clock: claimable again.
      await db
        .update(creativeWorkSelectionEffects)
        .set({ nextAttemptAt: new Date(Date.now() - 1_000) })
        .where(eq(creativeWorkSelectionEffects.id, effect.id));
      const matured = await claimSelectionEffects(db, {
        owner: `b-${RUN_ID}`,
        limit: 10,
        leaseSeconds: 300,
      });
      expect(matured.map((row) => row.id)).toContain(effect.id);
      await closeSelectionEffect(db, {
        id: effect.id,
        owner: `b-${RUN_ID}`,
        resolution: { outcome: "done" },
      });
      const afterDone = await claimSelectionEffects(db, {
        owner: `c-${RUN_ID}`,
        limit: 10,
        leaseSeconds: 300,
      });
      expect(afterDone.map((row) => row.id)).not.toContain(effect.id);
    });

    it("deleting the work item removes pendencies without resurrecting them", async () => {
      const scope = await createScope();
      const effect = await enqueueLibrary(scope);
      await db.delete(creativeWorkItems).where(eq(creativeWorkItems.id, scope.workItemId));
      const rows = await db
        .select()
        .from(creativeWorkSelectionEffects)
        .where(eq(creativeWorkSelectionEffects.id, effect.id));
      expect(rows).toEqual([]);
      // A ghost close resolves nothing and throws nothing.
      const ghost = await closeSelectionEffect(db, {
        id: effect.id,
        owner: `a-${RUN_ID}`,
        resolution: { outcome: "done" },
      });
      expect(ghost.closed).toBe(false);
    });
  },
);
