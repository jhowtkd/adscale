/**
 * Plan 04 T4: invariantes da reivindicação de refinamento de slides contra
 * Postgres REAL — uma tentativa por raiz+attempt, teto de duas revisões,
 * teto de créditos compartilhado com outputs, recusa de parent stale e a
 * reserva atômica anchor+dependentes (tudo-ou-nada na mesma transação).
 *
 * Requer o container adscale-test-postgres com a migração 0099 aplicada:
 *   DATABASE_URL=postgres://test:test@localhost:5433/adscale_test npm test -- src/server/repositories/creative-work-carousel-refinement.pg.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";

const TEST_DB_EXPLICITLY_CONFIGURED = Boolean(
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL,
);

import { db } from "@/server/db";
import {
  clientProfiles,
  creativeWorkCarouselSlides,
  creativeWorkItems,
  creativeWorkRefinementAttempts,
  user,
  workspaces,
} from "@/server/db/schema";
import { artRefinementParentHash } from "@/server/creative-work/art-refinement-parent-hash";
import {
  claimArtRefinementSlideAttempt,
  claimArtRefinementSlideUnits,
} from "./creative-work-carousel";

const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let seq = 0;
const createdWorkspaceIds: string[] = [];
const createdUserIds: string[] = [];

type Scope = { workspaceId: string; workItemId: string };

async function createScope(toolKind: "carousel" = "carousel"): Promise<Scope> {
  seq += 1;
  const tag = `sref-${RUN_ID}-${seq}`;
  const userId = `user-${tag}`;
  await db.insert(user).values({
    id: userId,
    name: "SRef",
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
      title: "SRef",
      request: "Carrossel com refinamento",
      toolKind,
      status: "ready",
      format: "4:5",
      settings: { targetFormats: [] },
    })
    .returning();
  createdUserIds.push(userId);
  createdWorkspaceIds.push(workspace.id);
  return { workspaceId: workspace.id, workItemId: work.id };
}

async function createSlide(
  scope: Scope,
  overrides: {
    position: number;
    parentSlideId?: string | null;
    lineageId?: string;
    versionNumber?: number;
    operationKey: string;
  },
) {
  const [row] = await db
    .insert(creativeWorkCarouselSlides)
    .values({
      workspaceId: scope.workspaceId,
      workItemId: scope.workItemId,
      lineageId: overrides.lineageId ?? crypto.randomUUID(),
      parentSlideId: overrides.parentSlideId ?? null,
      versionNumber: overrides.versionNumber ?? 1,
      deckRevision: "deck-r1",
      position: overrides.position,
      role: "context",
      primaryText: `Texto ${overrides.position}`,
      copyAuthority: "ai_proposal",
      layoutFamily: "development",
      status: "completed",
      outputKey: `creative-work/${overrides.operationKey}/final.png`,
      visualContractHash: "contract-1",
      generationOperationKey: overrides.operationKey,
    })
    .returning();
  return row;
}

async function slideHash(slideId: string, scope: Scope): Promise<string> {
  const [row] = await db
    .select({
      id: creativeWorkCarouselSlides.id,
      updatedAt: creativeWorkCarouselSlides.updatedAt,
      outputKey: creativeWorkCarouselSlides.outputKey,
    })
    .from(creativeWorkCarouselSlides)
    .where(
      and(
        eq(creativeWorkCarouselSlides.workspaceId, scope.workspaceId),
        eq(creativeWorkCarouselSlides.workItemId, scope.workItemId),
        eq(creativeWorkCarouselSlides.id, slideId),
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
      `[creative-work-carousel-refinement.pg] Postgres de teste INACESSÍVEL ou sem a 0099. ` +
        `Suba o container adscale-test-postgres e aplique drizzle/0099_creative_work_refinement.sql. ` +
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
      .delete(creativeWorkCarouselSlides)
      .where(inArray(creativeWorkCarouselSlides.workspaceId, createdWorkspaceIds));
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
  "carousel slide refinement claims (Postgres real)",
  () => {
    it("reivindica uma revisão por slide com replay idempotente e teto de duas", async () => {
      const s = await createScope();
      const root = await createSlide(s, { position: 2, operationKey: `sref-${RUN_ID}-a-root` });
      const base = {
        workspaceId: s.workspaceId,
        workItemId: s.workItemId,
        rootSlideId: root.id,
        parentSlideId: root.id,
        unitCredits: 10,
        remainingCreditCeiling: 60,
      };
      const hash = await slideHash(root.id, s);
      const [first, second] = await Promise.all([
        claimArtRefinementSlideAttempt({ ...base, expectedParentHash: hash }),
        claimArtRefinementSlideAttempt({ ...base, expectedParentHash: hash }),
      ]);
      expect(first).toMatchObject({ attempt: 1, replay: false });
      expect(second!.revisionKey).toBe(first!.revisionKey);

      // The parent leaves the current set before the descendant is written.
      await db
        .update(creativeWorkCarouselSlides)
        .set({ isCurrent: false })
        .where(eq(creativeWorkCarouselSlides.id, root.id));
      const rev = await createSlide(s, {
        position: 2,
        parentSlideId: root.id,
        lineageId: root.lineageId,
        versionNumber: 2,
        operationKey: `sref-${RUN_ID}-a-rev`,
      });
      const attempt2 = await claimArtRefinementSlideAttempt({
        ...base,
        parentSlideId: rev.id,
        expectedParentHash: await slideHash(rev.id, s),
      });
      expect(attempt2).toMatchObject({ attempt: 2, replay: false });
      expect(
        await claimArtRefinementSlideAttempt({
          ...base,
          parentSlideId: rev.id,
          expectedParentHash: await slideHash(rev.id, s),
        }),
      ).toMatchObject({ attempt: 2, replay: true });
      // A stale parent on a never-claimed root refuses (replay short-circuits
      // before the staleness check only for already-claimed parents).
      const fresh = await createSlide(s, { position: 4, operationKey: `sref-${RUN_ID}-a-fresh` });
      expect(
        await claimArtRefinementSlideAttempt({
          ...base,
          rootSlideId: fresh.id,
          parentSlideId: fresh.id,
          expectedParentHash: "stale",
        }),
      ).toBeNull();
    });

    it("reserva anchor+dependentes na mesma transação ou recusa tudo", async () => {
      const s = await createScope();
      const anchor = await createSlide(s, { position: 1, operationKey: `sref-${RUN_ID}-b-anchor` });
      const dep2 = await createSlide(s, { position: 2, operationKey: `sref-${RUN_ID}-b-d2` });
      const dep3 = await createSlide(s, { position: 3, operationKey: `sref-${RUN_ID}-b-d3` });
      const unit = async (slide: { id: string }) => ({
        rootSlideId: slide.id,
        parentSlideId: slide.id,
        expectedParentHash: await slideHash(slide.id, s),
      });
      const claimed = await claimArtRefinementSlideUnits({
        workspaceId: s.workspaceId,
        workItemId: s.workItemId,
        anchor: await unit(anchor),
        dependents: [await unit(dep2), await unit(dep3)],
        unitCredits: 10,
        remainingCreditCeiling: 60,
      });
      expect(claimed).toHaveLength(3);
      expect(new Set(claimed!.map((row) => row.revisionKey)).size).toBe(3);

      // One stale dependent rolls the whole batch back: no partial reservation.
      const s2 = await createScope();
      const anchor2 = await createSlide(s2, { position: 1, operationKey: `sref-${RUN_ID}-c-anchor` });
      const dep2b = await createSlide(s2, { position: 2, operationKey: `sref-${RUN_ID}-c-d2` });
      const refused = await claimArtRefinementSlideUnits({
        workspaceId: s2.workspaceId,
        workItemId: s2.workItemId,
        anchor: {
          rootSlideId: anchor2.id,
          parentSlideId: anchor2.id,
          expectedParentHash: await slideHash(anchor2.id, s2),
        },
        dependents: [{
          rootSlideId: dep2b.id,
          parentSlideId: dep2b.id,
          expectedParentHash: "stale-hash",
        }],
        unitCredits: 10,
        remainingCreditCeiling: 60,
      });
      expect(refused).toBeNull();
      const rows = await db
        .select()
        .from(creativeWorkRefinementAttempts)
        .where(eq(creativeWorkRefinementAttempts.workItemId, s2.workItemId));
      expect(rows).toHaveLength(0);
    });

    it("o teto é compartilhado: quatro dependentes sem saldo recusam", async () => {
      const s = await createScope();
      const anchor = await createSlide(s, { position: 1, operationKey: `sref-${RUN_ID}-d-anchor` });
      const dependents = [];
      for (let position = 2; position <= 5; position += 1) {
        const slide = await createSlide(s, { position, operationKey: `sref-${RUN_ID}-d-${position}` });
        dependents.push({
          rootSlideId: slide.id,
          parentSlideId: slide.id,
          expectedParentHash: await slideHash(slide.id, s),
        });
      }
      // 1 anchor + 4 dependents = 5 units × 10: a 40-credit ceiling refuses.
      expect(
        await claimArtRefinementSlideUnits({
          workspaceId: s.workspaceId,
          workItemId: s.workItemId,
          anchor: {
            rootSlideId: anchor.id,
            parentSlideId: anchor.id,
            expectedParentHash: await slideHash(anchor.id, s),
          },
          dependents,
          unitCredits: 10,
          remainingCreditCeiling: 40,
        }),
      ).toBeNull();
    });
  },
);
