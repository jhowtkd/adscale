/**
 * Plan 04 T2: invariantes da reivindicação de refinamento contra Postgres REAL.
 *
 * O teste mockado prova o fluxo; ESTE teste prova a exclusão mútua no banco:
 * advisory lock + índices únicos (uma tentativa por raiz+attempt, no máximo
 * duas revisões por raiz), teto de créditos, vínculo de parent (stale recusa)
 * e o CHECK de um único tipo de raiz por linha.
 *
 * Requer o container adscale-test-postgres com a migração 0100 aplicada:
 *   TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test npm test -- src/server/repositories/creative-work-refinement.pg.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";

const TEST_DB_EXPLICITLY_CONFIGURED = Boolean(
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL,
);

import { db } from "@/server/db";
import {
  clientProfiles,
  creativeWorkItems,
  creativeWorkOutputs,
  creativeWorkRefinementAttempts,
  user,
  workspaces,
} from "@/server/db/schema";
import { artRefinementParentHash } from "@/server/creative-work/art-refinement-parent-hash";
import {
  claimArtRefinementAttempt,
  listArtRefinementAttempts,
  markArtRefinementAttempt,
  setArtRefinementState,
} from "./creative-work";

const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let seq = 0;
const createdWorkspaceIds: string[] = [];
const createdUserIds: string[] = [];

type Scope = { userId: string; workspaceId: string; workItemId: string };

async function createScope(): Promise<Scope> {
  seq += 1;
  const tag = `ref-${RUN_ID}-${seq}`;
  const userId = `user-${tag}`;
  await db.insert(user).values({
    id: userId,
    name: "Ref",
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
      title: "Ref",
      request: "Peca com refinamento",
      toolKind: "variations",
      status: "ready",
      format: "4:5",
      settings: { targetFormats: [] },
    })
    .returning();
  createdUserIds.push(userId);
  createdWorkspaceIds.push(workspace.id);
  return { userId, workspaceId: workspace.id, workItemId: work.id };
}

async function createOutput(
  scope: Scope,
  overrides: { parentOutputId?: string | null; operationKey: string; versionNumber?: number },
) {
  const [row] = await db
    .insert(creativeWorkOutputs)
    .values({
      workspaceId: scope.workspaceId,
      workItemId: scope.workItemId,
      creativeLevel: "balanced",
      targetFormat: "4:5",
      versionNumber: overrides.versionNumber ?? 1,
      parentOutputId: overrides.parentOutputId ?? null,
      operationKey: overrides.operationKey,
      status: "completed",
      outputKey: `creative-work/${overrides.operationKey}/original.png`,
    })
    .returning();
  return row;
}

async function parentHash(outputId: string, scope: Scope): Promise<string> {
  const [row] = await db
    .select({
      id: creativeWorkOutputs.id,
      updatedAt: creativeWorkOutputs.updatedAt,
      outputKey: creativeWorkOutputs.outputKey,
    })
    .from(creativeWorkOutputs)
    .where(
      and(
        eq(creativeWorkOutputs.workspaceId, scope.workspaceId),
        eq(creativeWorkOutputs.workItemId, scope.workItemId),
        eq(creativeWorkOutputs.id, outputId),
      ),
    )
    .limit(1);
  return artRefinementParentHash(row!);
}

beforeAll(async () => {
  try {
    await db.execute(sql`select 1 from adscale_app.creative_work_refinement_attempts limit 0`);
  } catch (err) {
    throw new Error(
      `[creative-work-refinement.pg] Postgres de teste INACESSÍVEL ou sem a 0100 ` +
        `(DATABASE_URL=${process.env.DATABASE_URL ?? "(não definida)"}). ` +
        `Suba o container adscale-test-postgres e aplique drizzle/0100_creative_work_refinement.sql. ` +
        `Causa: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}, 30_000);

afterAll(async () => {
  if (createdWorkspaceIds.length > 0) {
    await db
      .delete(creativeWorkRefinementAttempts)
      .where(inArray(creativeWorkRefinementAttempts.workspaceId, createdWorkspaceIds));
    await db
      .delete(creativeWorkOutputs)
      .where(inArray(creativeWorkOutputs.workspaceId, createdWorkspaceIds));
    await db
      .delete(creativeWorkItems)
      .where(inArray(creativeWorkItems.workspaceId, createdWorkspaceIds));
    await db.delete(clientProfiles).where(inArray(clientProfiles.workspaceId, createdWorkspaceIds));
    await db.delete(workspaces).where(inArray(workspaces.id, createdWorkspaceIds));
  }
  if (createdUserIds.length > 0) {
    await db.delete(user).where(inArray(user.id, createdUserIds));
  }
}, 30_000);

describe.skipIf(!TEST_DB_EXPLICITLY_CONFIGURED)(
  "art refinement claims (Postgres real)",
  () => {
    it("reivindicações concorrentes do mesmo parent retomam a mesma tentativa", async () => {
      const s = await createScope();
      const root = await createOutput(s, { operationKey: `ref-${RUN_ID}-a-root` });
      const hash = await parentHash(root.id, s);
      const input = {
        workspaceId: s.workspaceId,
        workItemId: s.workItemId,
        rootOutputId: root.id,
        parentOutputId: root.id,
        expectedParentHash: hash,
        unitCredits: 10,
        remainingCreditCeiling: 20,
      };
      const [first, second] = await Promise.all([
        claimArtRefinementAttempt(input),
        claimArtRefinementAttempt(input),
      ]);
      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      expect(second!.attempt).toBe(1);
      expect(second!.revisionKey).toBe(first!.revisionKey);
      const rows = await db
        .select()
        .from(creativeWorkRefinementAttempts)
        .where(eq(creativeWorkRefinementAttempts.revisionKey, first!.revisionKey));
      expect(rows).toHaveLength(1);
      expect(rows[0]!.status).toBe("claimed");
    });

    it("permite duas revisões por raiz e recusa a terceira", async () => {
      const s = await createScope();
      const root = await createOutput(s, { operationKey: `ref-${RUN_ID}-b-root` });
      const rev1 = await createOutput(s, {
        parentOutputId: root.id,
        operationKey: `ref-${RUN_ID}-b-rev1`,
        versionNumber: 2,
      });
      const rev2 = await createOutput(s, {
        parentOutputId: rev1.id,
        operationKey: `ref-${RUN_ID}-b-rev2`,
        versionNumber: 3,
      });
      const base = {
        workspaceId: s.workspaceId,
        workItemId: s.workItemId,
        rootOutputId: root.id,
        unitCredits: 10,
        remainingCreditCeiling: 20,
      };
      const first = await claimArtRefinementAttempt({
        ...base,
        parentOutputId: root.id,
        expectedParentHash: await parentHash(root.id, s),
      });
      expect(first).toMatchObject({ attempt: 1, replay: false });
      const second = await claimArtRefinementAttempt({
        ...base,
        parentOutputId: rev1.id,
        expectedParentHash: await parentHash(rev1.id, s),
      });
      expect(second).toMatchObject({ attempt: 2, replay: false });
      expect(second!.revisionKey).not.toBe(first!.revisionKey);
      const third = await claimArtRefinementAttempt({
        ...base,
        parentOutputId: rev2.id,
        expectedParentHash: await parentHash(rev2.id, s),
      });
      expect(third).toBeNull();
    });

    it("recusa parent stale, teto estourado e output de outra work", async () => {
      const s = await createScope();
      const other = await createScope();
      const root = await createOutput(s, { operationKey: `ref-${RUN_ID}-c-root` });
      const foreign = await createOutput(other, { operationKey: `ref-${RUN_ID}-c-foreign` });
      const base = {
        workspaceId: s.workspaceId,
        workItemId: s.workItemId,
        rootOutputId: root.id,
        parentOutputId: root.id,
        unitCredits: 10,
        remainingCreditCeiling: 20,
      };
      expect(await claimArtRefinementAttempt({ ...base, expectedParentHash: "deadbeef" })).toBeNull();
      expect(
        await claimArtRefinementAttempt({
          ...base,
          expectedParentHash: await parentHash(root.id, s),
          remainingCreditCeiling: 5,
        }),
      ).toBeNull();
      expect(
        await claimArtRefinementAttempt({
          ...base,
          parentOutputId: foreign.id,
          expectedParentHash: await parentHash(foreign.id, other),
        }),
      ).toBeNull();
    });

    it("marca transição, lista por work e persiste o estado de apresentação", async () => {
      const s = await createScope();
      const root = await createOutput(s, { operationKey: `ref-${RUN_ID}-d-root` });
      const claimed = await claimArtRefinementAttempt({
        workspaceId: s.workspaceId,
        workItemId: s.workItemId,
        rootOutputId: root.id,
        parentOutputId: root.id,
        expectedParentHash: await parentHash(root.id, s),
        unitCredits: 10,
        remainingCreditCeiling: 20,
      });
      const rev = await createOutput(s, {
        parentOutputId: root.id,
        operationKey: `ref-${RUN_ID}-d-rev`,
        versionNumber: 2,
      });
      const marked = await markArtRefinementAttempt(s.workspaceId, claimed!.revisionKey, {
        status: "dispatched",
        outputId: rev.id,
      });
      expect(marked).toMatchObject({ status: "dispatched", outputId: rev.id });
      expect(await listArtRefinementAttempts(s.workspaceId, s.workItemId)).toHaveLength(1);
      const work = await setArtRefinementState(s.workspaceId, s.workItemId, {
        recommendedOutputIds: [root.id],
        status: "ready",
        issues: [],
      });
      expect(work?.artRefinementState).toEqual({
        recommendedOutputIds: [root.id],
        status: "ready",
        issues: [],
      });
    });

    it("o CHECK exige exatamente um tipo de raiz por linha", async () => {
      const s = await createScope();
      const root = await createOutput(s, { operationKey: `ref-${RUN_ID}-e-root` });
      await expect(
        db.insert(creativeWorkRefinementAttempts).values({
          workspaceId: s.workspaceId,
          workItemId: s.workItemId,
          rootOutputId: root.id,
          parentOutputId: root.id,
          rootSlideId: root.id,
          parentSlideId: root.id,
          attempt: 1,
          revisionKey: `ref-${RUN_ID}-e-both`,
          status: "claimed",
          unitCredits: 10,
        }),
      ).rejects.toThrow();
    });
  },
);
