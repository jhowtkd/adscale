/**
 * Etapa 1 T1: invariantes da sessão de calibração contra Postgres REAL.
 *
 * O teste mockado prova o fluxo; ESTE teste prova a exclusão mútua no banco:
 * advisory lock + índice único parcial (uma sessão aberta por perfil),
 * CAS por revisão (uma mutação vence, a outra recebe stale_session) e
 * unicidade do vínculo (sessão, rodada, slot) com CHECK todos-ou-nenhum.
 *
 * Requer o container adscale-test-postgres com a migração 0098 aplicada:
 *   DATABASE_URL=postgres://test:test@localhost:5433/adscale_test npm test -- src/server/repositories/brand-training-sessions.pg.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";

const TEST_DB_EXPLICITLY_CONFIGURED = Boolean(
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL,
);

import { db } from "@/server/db";
import {
  brandTrainingSessions,
  clientProfiles,
  creativeWorkItems,
  user,
  workspaces,
} from "@/server/db/schema";
import { freezeCandidate, type CalibrationRound } from "@/server/brand-training/calibration";
import {
  createTrainingSession,
  getTrainingSession,
  loadCalibrationCandidateForWork,
  mutateTrainingSession,
} from "./brand-training-sessions";

const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let seq = 0;
const createdWorkspaceIds: string[] = [];
const createdUserIds: string[] = [];

type Scope = { userId: string; workspaceId: string; clientProfileId: string };

async function createScope(): Promise<Scope> {
  seq += 1;
  const tag = `cal-${RUN_ID}-${seq}`;
  const userId = `user-${tag}`;
  await db.insert(user).values({
    id: userId,
    name: "Cal",
    email: `${tag}@example.com`,
    emailVerified: true,
  });
  const [workspace] = await db.insert(workspaces).values({ name: tag, slug: tag }).returning();
  const [profile] = await db
    .insert(clientProfiles)
    .values({ workspaceId: workspace.id, name: tag })
    .returning();
  createdUserIds.push(userId);
  createdWorkspaceIds.push(workspace.id);
  return { userId, workspaceId: workspace.id, clientProfileId: profile.id };
}

/** Drizzle envolve o erro do Postgres; o nome da constraint vive em `cause`. */
async function expectConstraint(promise: Promise<unknown>, constraint: RegExp) {
  const error = await promise.then(
    () => null,
    (err: unknown) => err,
  );
  expect(error).not.toBeNull();
  const detail = String(
    (error as { cause?: unknown })?.cause ?? error,
  );
  expect(detail).toMatch(constraint);
}

function testCandidate(profileId: string) {
  return freezeCandidate({
    knowledge: {
      schemaVersion: 1 as const,
      profileId,
      compiledAt: "2026-09-13T12:00:00.000Z",
      claims: [],
      excluded: [],
    },
    identity: {
      clientProfileId: profileId,
      confirmedAt: "2026-09-13T12:00:00.000Z",
      assets: [],
      brandKit: {
        colors: [],
        fonts: [],
        toneOfVoice: null,
        prohibitedElements: null,
        requiredElements: null,
      },
    },
    evidenceHashes: {},
  });
}

async function createWork(scope: Scope, link: { sessionId: string; round: number; slot: number } | null) {
  const [work] = await db
    .insert(creativeWorkItems)
    .values({
      workspaceId: scope.workspaceId,
      clientProfileId: scope.clientProfileId,
      createdByUserId: scope.userId,
      title: "Cal",
      request: "Exemplo de calibracao",
      toolKind: "variations",
      status: "draft",
      format: "4:5",
      settings: { targetFormats: [] },
      ...(link
        ? { trainingSessionId: link.sessionId, trainingRound: link.round, trainingSlot: link.slot }
        : {}),
    })
    .returning();
  return work;
}

beforeAll(async () => {
  try {
    await db.execute(sql`select 1 from adscale_app.brand_training_sessions limit 0`);
  } catch (err) {
    throw new Error(
      `[brand-training-sessions.pg] Postgres de teste INACESSÍVEL ou sem a 0098 ` +
        `(DATABASE_URL=${process.env.DATABASE_URL ?? "(não definida)"}). ` +
        `Suba o container adscale-test-postgres e aplique drizzle/0098_brand_training_sessions.sql. ` +
        `Causa: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}, 30_000);

afterAll(async () => {
  if (createdWorkspaceIds.length > 0) {
    await db
      .delete(creativeWorkItems)
      .where(inArray(creativeWorkItems.workspaceId, createdWorkspaceIds));
    await db
      .delete(brandTrainingSessions)
      .where(inArray(brandTrainingSessions.workspaceId, createdWorkspaceIds));
    await db.delete(clientProfiles).where(inArray(clientProfiles.workspaceId, createdWorkspaceIds));
    await db.delete(workspaces).where(inArray(workspaces.id, createdWorkspaceIds));
  }
  if (createdUserIds.length > 0) {
    await db.delete(user).where(inArray(user.id, createdUserIds));
  }
}, 30_000);

describe.skipIf(!TEST_DB_EXPLICITLY_CONFIGURED)(
  "brand training sessions (Postgres real)",
  () => {
    it("criações concorrentes retomam a mesma sessão, nunca duplicam", async () => {
      const s = await createScope();
      const candidate = testCandidate(s.clientProfileId);
      const [first, second] = await Promise.all([
        createTrainingSession({
          workspaceId: s.workspaceId,
          profileId: s.clientProfileId,
          userId: s.userId,
          candidate,
          baseVersionId: null,
        }),
        createTrainingSession({
          workspaceId: s.workspaceId,
          profileId: s.clientProfileId,
          userId: s.userId,
          candidate,
          baseVersionId: null,
        }),
      ]);
      expect(second.id).toBe(first.id);
      const rows = await db
        .select()
        .from(brandTrainingSessions)
        .where(
          and(
            eq(brandTrainingSessions.workspaceId, s.workspaceId),
            eq(brandTrainingSessions.clientProfileId, s.clientProfileId),
          ),
        );
      expect(rows).toHaveLength(1);
      await expect(
        getTrainingSession(s.workspaceId, s.clientProfileId),
      ).resolves.toMatchObject({ id: first.id });
    });

    it("índice único parcial barra segunda sessão aberta no SQL", async () => {
      const s = await createScope();
      const candidate = testCandidate(s.clientProfileId);
      await createTrainingSession({
        workspaceId: s.workspaceId,
        profileId: s.clientProfileId,
        userId: s.userId,
        candidate,
        baseVersionId: null,
      });
      await expectConstraint(
        db.insert(brandTrainingSessions).values({
          workspaceId: s.workspaceId,
          clientProfileId: s.clientProfileId,
          createdByUserId: s.userId,
          status: "review",
          candidate,
          rounds: [],
          extensionCount: 0,
        }),
        /brand_training_sessions_open_uq/i,
      );
    });

    it("mutações concorrentes com mesma revisão: uma vence, outra recebe stale_session", async () => {
      const s = await createScope();
      const session = await createTrainingSession({
        workspaceId: s.workspaceId,
        profileId: s.clientProfileId,
        userId: s.userId,
        candidate: testCandidate(s.clientProfileId),
        baseVersionId: null,
      });
      const results = await Promise.allSettled([
        mutateTrainingSession({
          workspaceId: s.workspaceId,
          profileId: s.clientProfileId,
          sessionId: session.id,
          expectedRevision: session.revision,
          command: { type: "extend" },
        }),
        mutateTrainingSession({
          workspaceId: s.workspaceId,
          profileId: s.clientProfileId,
          sessionId: session.id,
          expectedRevision: session.revision,
          command: { type: "extend" },
        }),
      ]);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]).toMatchObject({
        status: "rejected",
        reason: expect.objectContaining({ code: "stale_session" }),
      });
    });

    it("vínculo (sessão, rodada, slot) é único e todos-ou-nenhum", async () => {
      const s = await createScope();
      const session = await createTrainingSession({
        workspaceId: s.workspaceId,
        profileId: s.clientProfileId,
        userId: s.userId,
        candidate: testCandidate(s.clientProfileId),
        baseVersionId: null,
      });
      await createWork(s, { sessionId: session.id, round: 1, slot: 0 });
      await expectConstraint(
        createWork(s, { sessionId: session.id, round: 1, slot: 0 }),
        /creative_work_items_training_slot_uq/i,
      );
      await expectConstraint(
        db.insert(creativeWorkItems).values({
          workspaceId: s.workspaceId,
          clientProfileId: s.clientProfileId,
          createdByUserId: s.userId,
          title: "Cal",
          request: "Exemplo de calibracao",
          toolKind: "variations",
          status: "draft",
          format: "4:5",
          settings: { targetFormats: [] },
          trainingSessionId: session.id,
        }),
        /creative_work_items_training_link_check/i,
      );
    });

    it("resolve a candidata da rodada pelo vínculo persistido", async () => {
      const s = await createScope();
      const session = await createTrainingSession({
        workspaceId: s.workspaceId,
        profileId: s.clientProfileId,
        userId: s.userId,
        candidate: testCandidate(s.clientProfileId),
        baseVersionId: null,
      });
      const candidate = testCandidate(s.clientProfileId);
      const work = await createWork(s, { sessionId: session.id, round: 1, slot: 2 });
      const plain = await createWork(s, null);
      await db
        .update(brandTrainingSessions)
        .set({
          rounds: [
            {
              number: 1,
              candidate,
              quoteCredits: 8,
              confirmedBy: s.userId,
              confirmedAt: "2026-09-13T12:00:00.000Z",
              coverage: ["palette"],
              slots: [0, 1, 2, 3].map((index) => ({
                index: index as 0 | 1 | 2 | 3,
                workItemId: work.id,
                outputId: null,
                feedback: null,
              })) as CalibrationRound["slots"],
            },
          ],
        })
        .where(eq(brandTrainingSessions.id, session.id));
      await expect(loadCalibrationCandidateForWork(s.workspaceId, work.id)).resolves.toMatchObject({
        hash: candidate.hash,
      });
      await expect(loadCalibrationCandidateForWork(s.workspaceId, plain.id)).resolves.toBeNull();
    });
  },
);
