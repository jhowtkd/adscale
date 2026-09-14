/**
 * Plan 01 T4: invariantes da ativação (publish) contra Postgres REAL.
 *
 * O teste mockado prova o fluxo; ESTE teste prova a exclusão mútua no banco:
 * advisory lock + índice único parcial (uma versão ativa por perfil):
 * publishes concorrentes da mesma sessão criam exatamente UMA versão
 * (os perdedores reentram e recebem o mesmo id), e prova stale nunca ativa.
 *
 * Requer o container adscale-test-postgres com as migrações aplicadas, e a
 * URL do banco de teste EXPLÍCITA — uma DATABASE_URL genérica nunca executa
 * esta suíte, para que ela jamais escreva num banco de dev ou produção:
 *   TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test npm test -- src/server/repositories/brand-knowledge-publish.pg.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { Pool } from "pg";
import type { CalibrationRound } from "@/server/brand-training/calibration";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? null;
// O drizzle lê DATABASE_URL quando @/server/db carrega: roteia para o banco
// de teste explícito ANTES dos imports dinâmicos abaixo. Imports estáticos
// içariam acima desta atribuição e conectariam no que DATABASE_URL apontar.
if (TEST_DATABASE_URL) process.env.DATABASE_URL = TEST_DATABASE_URL;
const TEST_DB_EXPLICITLY_CONFIGURED = TEST_DATABASE_URL !== null;

/** Nunca imprime a URL inteira: credenciais não pertencem a log de erro. */
function redactedDbLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}:${parsed.port}${parsed.pathname}`;
  } catch {
    return "(URL inválida)";
  }
}

function assertTestDatabaseUrl(url: string): void {
  const parsed = new URL(url);
  const localHost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (!localHost || parsed.port !== "5433" || parsed.pathname !== "/adscale_test") {
    throw new Error(
      `[brand-knowledge-publish.pg] TEST_DATABASE_URL deve apontar para o banco de teste local ` +
        `(esperado localhost:5433/adscale_test, recebido ${redactedDbLabel(url)}). ` +
        `Esta suíte escreve e deleta dados: aponte para o container adscale-test-postgres.`,
    );
  }
}

if (TEST_DATABASE_URL) assertTestDatabaseUrl(TEST_DATABASE_URL);

const { db } = await import("@/server/db");
const {
  brandKnowledgeVersions,
  brandTrainingSessions,
  clientProfiles,
  creativeWorkItems,
  creativeWorkOutputs,
  user,
  workspaces,
} = await import("@/server/db/schema");
const { freezeCandidate } = await import("@/server/brand-training/calibration");
const { createTrainingSession } = await import("./brand-training-sessions");
const { BrandKnowledgeCalibrationError, publishBrandKnowledgeVersion } =
  await import("./brand-knowledge");

const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let seq = 0;
const createdWorkspaceIds: string[] = [];
const createdUserIds: string[] = [];

type Scope = { userId: string; workspaceId: string; clientProfileId: string };

async function createScope(): Promise<Scope> {
  seq += 1;
  const tag = `pub-${RUN_ID}-${seq}`;
  const userId = `user-${tag}`;
  await db.insert(user).values({
    id: userId,
    name: "Pub",
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

/** Cria sessão + rodada 1 com os quatro slots aprovados e persiste o vínculo. */
async function createActivatableSession(scope: Scope) {
  const candidate = testCandidate(scope.clientProfileId);
  const session = await createTrainingSession({
    workspaceId: scope.workspaceId,
    profileId: scope.clientProfileId,
    userId: scope.userId,
    candidate,
    baseVersionId: null,
  });
  const slots = [];
  for (let index = 0; index < 4; index += 1) {
    const [work] = await db
      .insert(creativeWorkItems)
      .values({
        workspaceId: scope.workspaceId,
        clientProfileId: scope.clientProfileId,
        createdByUserId: scope.userId,
        title: "Cal",
        request: "Exemplo de calibracao",
        toolKind: "variations",
        status: "ready",
        format: "4:5",
        settings: { targetFormats: [] },
        trainingSessionId: session.id,
        trainingRound: 1,
        trainingSlot: index,
      })
      .returning();
    const [output] = await db
      .insert(creativeWorkOutputs)
      .values({
        workspaceId: scope.workspaceId,
        workItemId: work!.id,
        creativeLevel: "balanced",
        targetFormat: "4:5",
        operationKey: `pub-${RUN_ID}-${session.id.slice(0, 8)}-${index}`,
        status: "completed",
        outputKey: `creative-work/pub-${RUN_ID}/original.png`,
        quality: { objectiveVerdict: "pass" },
      })
      .returning();
    slots.push({
      index: index as 0 | 1 | 2 | 3,
      workItemId: work!.id,
      outputId: output!.id,
      feedback: {
        rating: "good" as const,
        note: "",
        dimensions: [],
        actorId: scope.userId,
        at: "2026-09-13T12:00:00.000Z",
      },
    });
  }
  await db
    .update(brandTrainingSessions)
    .set({
      rounds: [
        {
          number: 1,
          candidate,
          quoteCredits: 8,
          confirmedBy: scope.userId,
          confirmedAt: "2026-09-13T12:00:00.000Z",
          coverage: ["palette"],
          slots: slots as CalibrationRound["slots"],
        },
      ],
    })
    .where(eq(brandTrainingSessions.id, session.id));
  return { session, candidate };
}

beforeAll(async () => {
  try {
    await db.execute(sql`select 1 from adscale_app.brand_knowledge_versions limit 0`);
  } catch (err) {
    throw new Error(
      `[brand-knowledge-publish.pg] Postgres de teste INACESSÍVEL ou sem migrações ` +
        `(TEST_DATABASE_URL=${TEST_DATABASE_URL ? redactedDbLabel(TEST_DATABASE_URL) : "(não definida)"}). ` +
        `Suba o container adscale-test-postgres e aplique as migrações drizzle. ` +
        `Causa: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}, 30_000);

afterAll(async () => {
  if (createdWorkspaceIds.length > 0) {
    await db
      .delete(creativeWorkOutputs)
      .where(inArray(creativeWorkOutputs.workspaceId, createdWorkspaceIds));
    await db
      .delete(creativeWorkItems)
      .where(inArray(creativeWorkItems.workspaceId, createdWorkspaceIds));
    await db
      .delete(brandTrainingSessions)
      .where(inArray(brandTrainingSessions.workspaceId, createdWorkspaceIds));
    await db
      .delete(brandKnowledgeVersions)
      .where(inArray(brandKnowledgeVersions.workspaceId, createdWorkspaceIds));
    await db.delete(clientProfiles).where(inArray(clientProfiles.workspaceId, createdWorkspaceIds));
    await db.delete(workspaces).where(inArray(workspaces.id, createdWorkspaceIds));
  }
  if (createdUserIds.length > 0) {
    await db.delete(user).where(inArray(user.id, createdUserIds));
  }
}, 30_000);

describe.skipIf(!TEST_DB_EXPLICITLY_CONFIGURED)(
  "brand knowledge publish (Postgres real)",
  () => {
    it("publishes concorrentes da mesma sessão criam exatamente uma versão", async () => {
      const s = await createScope();
      const { session, candidate } = await createActivatableSession(s);
      const proof = {
        workspaceId: s.workspaceId,
        clientProfileId: s.clientProfileId,
        userId: s.userId,
        sessionId: session.id,
        expectedRevision: session.revision,
        candidateHash: candidate.hash,
      };
      // Prova de contenção real, não de partida junta: partir ao mesmo
      // tempo não garante disputa no ponto crítico. Uma conexão auxiliar
      // segura o MESMO advisory lock que o publish adquire na primeira
      // instrução da transação; os corredores começam; o teste confirma em
      // pg_locks que todos estão esperando exatamente nesta chave; só então
      // o lock é liberado e uma única versão deve emergir.
      const lockKey = `${s.workspaceId}:${s.clientProfileId}`;
      const auxPool = new Pool({ connectionString: TEST_DATABASE_URL!, max: 2 });
      const holder = await auxPool.connect();
      const monitor = await auxPool.connect();
      const RACERS = 5;
      let waiting = 0;
      let results: Awaited<ReturnType<typeof publishBrandKnowledgeVersion>>[] = [];
      try {
        await holder.query("BEGIN");
        await holder.query("select pg_advisory_xact_lock(hashtext($1))", [lockKey]);
        const racers = Array.from({ length: RACERS }, () => publishBrandKnowledgeVersion(proof));
        // Chave int4 no pg_locks: classid carrega a extensão de sinal,
        // objid os 32 bits baixos sem sinal, objsubid é 1 — tudo derivado
        // em SQL para não depender de conversão com sinal no JS.
        const deadline = Date.now() + 10_000;
        for (;;) {
          const { rows } = await monitor.query(
            `select count(*)::int as waiting from pg_locks
             where locktype = 'advisory' and not granted
               and database = (select oid from pg_database where datname = current_database())
               and classid = case when hashtext($1) < 0 then 4294967295::oid else 0::oid end
               and objid = ((hashtext($1)::bigint % 4294967296 + 4294967296) % 4294967296)::oid
               and objsubid = 1`,
            [lockKey],
          );
          waiting = rows[0].waiting as number;
          if (waiting >= RACERS || Date.now() > deadline) break;
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        // Libera antes de qualquer assertion para nunca travar os corredores
        // até o timeout da suíte quando a contenção não se forma.
        await holder.query("ROLLBACK");
        results = await Promise.all(racers);
      } finally {
        holder.release();
        monitor.release();
        await auxPool.end();
      }
      expect(waiting).toBe(RACERS);
      const first = results[0]!;
      expect(first.id).toBeDefined();
      for (const result of results) {
        expect(result.id).toBe(first.id);
      }
      const versions = await db
        .select()
        .from(brandKnowledgeVersions)
        .where(
          and(
            eq(brandKnowledgeVersions.workspaceId, s.workspaceId),
            eq(brandKnowledgeVersions.clientProfileId, s.clientProfileId),
          ),
        );
      expect(versions).toHaveLength(1);
      expect(versions[0]).toMatchObject({ id: first.id, status: "active", versionNumber: 1 });
      const [persisted] = await db
        .select()
        .from(brandTrainingSessions)
        .where(eq(brandTrainingSessions.id, session.id));
      expect(persisted).toMatchObject({ status: "activated", activatedVersionId: first.id });
      // Contenção leva milissegundos; o teto existe para que uma falha de
      // contenção apareça como assertion clara, nunca como timeout opaco.
    }, 30_000);

    it("prova stale nunca ativa nem cria versão", async () => {
      const s = await createScope();
      const { session, candidate } = await createActivatableSession(s);
      const base = {
        workspaceId: s.workspaceId,
        clientProfileId: s.clientProfileId,
        userId: s.userId,
        sessionId: session.id,
      };
      await expect(
        publishBrandKnowledgeVersion({ ...base, expectedRevision: session.revision, candidateHash: "deadbeef" }),
      ).rejects.toBeInstanceOf(BrandKnowledgeCalibrationError);
      await expect(
        publishBrandKnowledgeVersion({ ...base, expectedRevision: session.revision, candidateHash: "deadbeef" }),
      ).rejects.toMatchObject({ code: "calibration_stale" });
      await expect(
        publishBrandKnowledgeVersion({ ...base, expectedRevision: session.revision + 1, candidateHash: candidate.hash }),
      ).rejects.toMatchObject({ code: "calibration_stale" });
      const versions = await db
        .select()
        .from(brandKnowledgeVersions)
        .where(
          and(
            eq(brandKnowledgeVersions.workspaceId, s.workspaceId),
            eq(brandKnowledgeVersions.clientProfileId, s.clientProfileId),
          ),
        );
      expect(versions).toHaveLength(0);
    });
  },
);
