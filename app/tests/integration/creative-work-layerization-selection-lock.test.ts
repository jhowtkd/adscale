/**
 * Real-PostgreSQL regression for the selected-Peça Layerize lock.
 *
 * Both repository calls start behind the same in-process barrier. PostgreSQL
 * decides which row lock wins; the invariant is that claim and selection can
 * never both commit successfully.
 *
 * Requires:
 *   DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
 *   TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
 *   npm test -- --run tests/integration/creative-work-layerization-selection-lock.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";

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

function controlledStart() {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { wait, release };
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

    it("allows exactly one winner when Layerize claim races a new selection", async () => {
      for (let index = 0; index < 12; index += 1) {
        const race = await createRace(index);
        const start = controlledStart();

        const claimPromise = start.wait.then(() => claimCreativeWorkLayerization({
          workspaceId,
          workItemId: race.work.id,
          outputId: race.selected.id,
          state: queuedState(`attempt-${runId}-${index}`),
        }));
        const selectionPromise = start.wait.then(() => selectCreativeWorkOutput(
          workspaceId,
          race.work.id,
          race.candidate.id,
          { confirmObjective: true },
        ));

        start.release();
        const [claimed, newlySelected] = await Promise.all([claimPromise, selectionPromise]);
        expect([claimed, newlySelected].filter(Boolean)).toHaveLength(1);

        const rows = await db.select().from(creativeWorkOutputs)
          .where(eq(creativeWorkOutputs.workItemId, race.work.id));
        const original = rows.find((row) => row.id === race.selected.id);
        const candidate = rows.find((row) => row.id === race.candidate.id);
        expect(original).toBeDefined();
        expect(candidate).toBeDefined();

        if (claimed) {
          expect(newlySelected).toBeNull();
          expect(original?.isSelected).toBe(true);
          expect(candidate?.isSelected).toBe(false);
          expect(layerizationStateFromDatabase(original?.layerization)?.status).toBe("queued");
        } else {
          expect(newlySelected?.id).toBe(race.candidate.id);
          expect(original?.isSelected).toBe(false);
          expect(candidate?.isSelected).toBe(true);
          expect(original?.layerization).toBeNull();
        }
      }
    }, 30_000);
  },
);
