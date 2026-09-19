/**
 * PR-03 Task 12: reserva, renovação, invalidação e finalização da tentativa de
 * preparação, contra Postgres REAL.
 *
 * A exclusão mútua é do banco — o índice único parcial
 * `creative_work_preparation_attempts_active_uq` admite no máximo uma tentativa
 * `running` por Trabalho (provado na Task 11). Estes testes provam que o
 * repositório usa essa garantia corretamente sob concorrência de verdade, e
 * que renovação de lease não mexe na revisão de conteúdo.
 *
 * Sem mocks: tudo é produção real contra o banco.
 *
 * Requer o container adscale-test-postgres migrado (tabela da 0097):
 *   DATABASE_URL=postgres://test:test@localhost:5433/adscale_test npm test -- src/server/repositories/creative-work-preparation.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";

// Suíte exclusiva de Postgres real: só roda quando a URL do banco de teste é
// passada explicitamente. Sem ela é pulada; com ela e o banco inacessível,
// FALHA no beforeAll — nunca passa em silêncio.
const TEST_DB_EXPLICITLY_CONFIGURED = Boolean(
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL,
);

import { db } from "@/server/db";
import {
  clientProfiles,
  creativeWorkItems,
  creativeWorkOutputs,
  creativeWorkPreparationAttempts,
  creativeWorkSources,
  user,
  workspaceAssets,
  workspaces,
} from "@/server/db/schema";
import {
  mutateCreativeWorkDraftSource,
  reservePreparedCreativeWorkOutputsIfCurrent,
} from "./creative-work";
import {
  claimPreparationAttempt,
  finalizePreparationAttempt,
  getActivePreparationAttempt,
  invalidatePreparationAttempts,
  renewPreparationAttempt,
} from "./creative-work-preparation";

const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let seq = 0;
const createdWorkspaceIds: string[] = [];
const createdUserIds: string[] = [];

type Scope = { userId: string; workspaceId: string; clientProfileId: string; workItemId: string };

/** Semeia user → workspace → client profile → Trabalho, com ids únicos por execução. */
async function createScope(): Promise<Scope> {
  seq += 1;
  const tag = `t12-${RUN_ID}-${seq}`;
  const userId = `user-${tag}`;

  await db.insert(user).values({
    id: userId,
    name: "T12",
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
      title: "T12",
      request: "Pedido de caracterizacao",
      toolKind: "variations",
      status: "draft",
      format: "4:5",
      settings: { targetFormats: [] },
    })
    .returning();

  createdUserIds.push(userId);
  createdWorkspaceIds.push(workspace.id);
  return { userId, workspaceId: workspace.id, clientProfileId: profile.id, workItemId: work.id };
}

async function attemptsOf(workItemId: string) {
  return db
    .select()
    .from(creativeWorkPreparationAttempts)
    .where(eq(creativeWorkPreparationAttempts.workItemId, workItemId));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const REV_A = "2026-09-12T10:00:00.000Z";
const REV_B = "2026-09-12T10:05:00.000Z";

beforeAll(async () => {
  try {
    await db.execute(sql`select 1`);
  } catch (err) {
    throw new Error(
      `[creative-work-preparation] Postgres de teste INACESSÍVEL (DATABASE_URL=${
        process.env.DATABASE_URL ?? "(não definida)"
      }). Suba o container adscale-test-postgres migrado antes de rodar este teste. ` +
        `Causa: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}, 30_000);

afterAll(async () => {
  if (createdWorkspaceIds.length > 0) {
    await db
      .delete(creativeWorkPreparationAttempts)
      .where(inArray(creativeWorkPreparationAttempts.workspaceId, createdWorkspaceIds));
    await db.delete(creativeWorkOutputs).where(inArray(creativeWorkOutputs.workspaceId, createdWorkspaceIds));
    await db.delete(creativeWorkSources).where(inArray(creativeWorkSources.workspaceId, createdWorkspaceIds));
    await db.delete(creativeWorkItems).where(inArray(creativeWorkItems.workspaceId, createdWorkspaceIds));
    await db.delete(workspaceAssets).where(inArray(workspaceAssets.workspaceId, createdWorkspaceIds));
    await db.delete(clientProfiles).where(inArray(clientProfiles.workspaceId, createdWorkspaceIds));
    await db.delete(workspaces).where(inArray(workspaces.id, createdWorkspaceIds));
  }
  if (createdUserIds.length > 0) {
    await db.delete(user).where(inArray(user.id, createdUserIds));
  }
}, 30_000);

describe.skipIf(!TEST_DB_EXPLICITLY_CONFIGURED)("creative-work preparation attempts (Postgres real)", () => {
  // NAO renomeie de volta para "claim concorrente": um Promise.all destas 8
  // chamadas NAO produz corrida no insert. Cada uma abre sua propria transacao,
  // elas serializam, e da segunda em diante todas saem no passo 3 (ja existe
  // uma viva) sem nunca alcancar o ON CONFLICT. Verificado em 12/09/2026
  // removendo `onConflictDoNothing`: este teste continuou passando. A corrida
  // real esta no teste seguinte, que segura uma transacao aberta.
  it("oito requisicoes equivalentes convergem para uma unica tentativa", async () => {
    const scope = await createScope();

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        claimPreparationAttempt({
          workspaceId: scope.workspaceId,
          workItemId: scope.workItemId,
          kind: "creative_prepare",
          inputRevision: REV_A,
          inputFingerprint: "fp-1",
          leaseSeconds: 60,
        }),
      ),
    );

    expect(results.filter((r) => r.outcome === "claimed")).toHaveLength(1);
    expect(results.filter((r) => r.outcome === "joined")).toHaveLength(7);

    const ids = new Set(
      results.flatMap((r) => (r.outcome === "revision_changed" ? [] : [r.attempt.id])),
    );
    expect(ids.size).toBe(1);

    // O banco tambem so tem uma linha viva.
    const rows = await attemptsOf(scope.workItemId);
    expect(rows.filter((row) => row.state === "running")).toHaveLength(1);
  }, 30_000);

  it("perde a corrida no insert e se junta a vencedora, sem estourar 23505", async () => {
    const scope = await createScope();

    // Segura uma transacao ABERTA com uma tentativa `running` ainda nao
    // commitada. Sob READ COMMITTED o claim nao enxerga essa linha na leitura,
    // segue para o insert e BLOQUEIA no indice unico ate este commit — que e
    // exatamente a corrida que o Promise.all nao consegue produzir.
    let commitWinner!: () => void;
    const winnerCommitted = new Promise<void>((resolve) => {
      commitWinner = resolve;
    });
    let winnerId = "";

    const heldTransaction = db.transaction(async (tx) => {
      const [row] = await tx
        .insert(creativeWorkPreparationAttempts)
        .values({
          workspaceId: scope.workspaceId,
          workItemId: scope.workItemId,
          kind: "creative_prepare",
          inputRevision: REV_A,
          inputFingerprint: "fp-1",
          state: "running",
          leaseExpiresAt: sql`now() + make_interval(secs => 60)` as unknown as Date,
        })
        .returning();
      winnerId = row.id;
      await winnerCommitted;
    });

    // Espera a linha estar inserida (ainda invisivel para outras transacoes).
    await new Promise((resolve) => setTimeout(resolve, 150));

    const loser = claimPreparationAttempt({
      workspaceId: scope.workspaceId,
      workItemId: scope.workItemId,
      kind: "creative_prepare",
      inputRevision: REV_A,
      inputFingerprint: "fp-1",
      leaseSeconds: 60,
    });

    // Deixa o claim chegar ao insert e bloquear, entao libera a vencedora.
    await new Promise((resolve) => setTimeout(resolve, 250));
    commitWinner();
    await heldTransaction;

    // Sem `onConflictDoNothing` com o predicado do indice parcial, esta linha
    // rejeita com 23505 em vez de resolver.
    const result = await loser;
    expect(result).toMatchObject({ outcome: "joined" });
    expect(result.outcome === "joined" && result.attempt.id).toBe(winnerId);

    const rows = await attemptsOf(scope.workItemId);
    expect(rows.filter((row) => row.state === "running")).toHaveLength(1);
  }, 30_000);

  it("requisicao equivalente recebe a MESMA tentativa enquanto ela e valida", async () => {
    const scope = await createScope();
    const base = {
      workspaceId: scope.workspaceId,
      workItemId: scope.workItemId,
      kind: "creative_prepare" as const,
      inputRevision: REV_A,
      inputFingerprint: "fp-1",
      leaseSeconds: 60,
    };

    const first = await claimPreparationAttempt(base);
    const second = await claimPreparationAttempt(base);

    expect(first.outcome).toBe("claimed");
    expect(second).toMatchObject({ outcome: "joined" });
    expect(second.outcome === "joined" && second.attempt.id).toBe(
      first.outcome === "claimed" ? first.attempt.id : "",
    );
  }, 30_000);

  it("revisao diferente invalida a tentativa incompativel e reclama", async () => {
    const scope = await createScope();
    const first = await claimPreparationAttempt({
      workspaceId: scope.workspaceId,
      workItemId: scope.workItemId,
      kind: "creative_prepare",
      inputRevision: REV_A,
      inputFingerprint: "fp-1",
      leaseSeconds: 60,
    });
    expect(first.outcome).toBe("claimed");

    const second = await claimPreparationAttempt({
      workspaceId: scope.workspaceId,
      workItemId: scope.workItemId,
      kind: "creative_prepare",
      inputRevision: REV_B,
      inputFingerprint: "fp-2",
      leaseSeconds: 60,
    });

    expect(second.outcome).toBe("claimed");
    expect(second.outcome === "claimed" && second.attempt.id).not.toBe(
      first.outcome === "claimed" ? first.attempt.id : "",
    );

    const rows = await attemptsOf(scope.workItemId);
    const old = rows.find((row) => row.inputRevision === REV_A);
    expect(old?.state).toBe("invalidated");
    expect(rows.filter((row) => row.state === "running")).toHaveLength(1);
  }, 30_000);

  it("tentativa expirada nao bloqueia: o proximo claim assume", async () => {
    const scope = await createScope();
    const base = {
      workspaceId: scope.workspaceId,
      workItemId: scope.workItemId,
      kind: "creative_prepare" as const,
      inputRevision: REV_A,
      inputFingerprint: "fp-1",
    };

    const first = await claimPreparationAttempt({ ...base, leaseSeconds: 1 });
    expect(first.outcome).toBe("claimed");

    // Expiracao decidida pelo relogio do BANCO, nao do processo.
    await sleep(1_300);

    const second = await claimPreparationAttempt({ ...base, leaseSeconds: 60 });
    expect(second.outcome).toBe("claimed");

    const rows = await attemptsOf(scope.workItemId);
    expect(rows.filter((row) => row.state === "running")).toHaveLength(1);
    expect(rows.filter((row) => row.state === "invalidated")).toHaveLength(1);
  }, 30_000);

  it("renovacao estende o lease sem tocar em creative_work_items.updated_at", async () => {
    const scope = await createScope();
    const claimed = await claimPreparationAttempt({
      workspaceId: scope.workspaceId,
      workItemId: scope.workItemId,
      kind: "creative_prepare",
      inputRevision: REV_A,
      inputFingerprint: "fp-1",
      leaseSeconds: 30,
    });
    expect(claimed.outcome).toBe("claimed");
    const attemptId = claimed.outcome === "claimed" ? claimed.attempt.id : "";

    const [workBefore] = await db
      .select()
      .from(creativeWorkItems)
      .where(eq(creativeWorkItems.id, scope.workItemId));
    const [attemptBefore] = await attemptsOf(scope.workItemId);

    const renewed = await renewPreparationAttempt({
      workspaceId: scope.workspaceId,
      attemptId,
      leaseSeconds: 120,
    });
    expect(renewed).toBe(true);

    const [workAfter] = await db
      .select()
      .from(creativeWorkItems)
      .where(eq(creativeWorkItems.id, scope.workItemId));
    const [attemptAfter] = await attemptsOf(scope.workItemId);

    // O lease andou...
    expect(attemptAfter.leaseExpiresAt.getTime()).toBeGreaterThan(
      attemptBefore.leaseExpiresAt.getTime(),
    );
    // ...e a revisao de conteudo NAO. Heartbeat operacional nunca pode
    // invalidar a propria tentativa por mexer no updatedAt do Trabalho.
    expect(workAfter.updatedAt.getTime()).toBe(workBefore.updatedAt.getTime());
    expect(attemptAfter.inputRevision).toBe(attemptBefore.inputRevision);
  }, 30_000);

  it("finaliza a tentativa vigente quando revisao e fingerprint batem", async () => {
    const scope = await createScope();
    const claimed = await claimPreparationAttempt({
      workspaceId: scope.workspaceId,
      workItemId: scope.workItemId,
      kind: "creative_prepare",
      inputRevision: REV_A,
      inputFingerprint: "fp-1",
      leaseSeconds: 60,
    });
    const attemptId = claimed.outcome === "claimed" ? claimed.attempt.id : "";

    const result = await finalizePreparationAttempt({
      workspaceId: scope.workspaceId,
      workItemId: scope.workItemId,
      attemptId,
      currentRevision: REV_A,
      currentFingerprint: "fp-1",
      state: "completed",
    });

    expect(result).toEqual({ ok: true });
    const rows = await attemptsOf(scope.workItemId);
    expect(rows[0].state).toBe("completed");
    // Concluida deixa de ser vigente: o Trabalho volta a aceitar claim.
    expect(await getActivePreparationAttempt({
      workspaceId: scope.workspaceId,
      workItemId: scope.workItemId,
    })).toBeNull();
  }, 30_000);

  it("conclusao tardia de tentativa antiga NAO substitui a nova", async () => {
    const scope = await createScope();
    const first = await claimPreparationAttempt({
      workspaceId: scope.workspaceId,
      workItemId: scope.workItemId,
      kind: "creative_prepare",
      inputRevision: REV_A,
      inputFingerprint: "fp-1",
      leaseSeconds: 60,
    });
    const attemptA = first.outcome === "claimed" ? first.attempt.id : "";

    // A edicao invalida a tentativa em curso e uma nova assume.
    const invalidated = await invalidatePreparationAttempts({
      workspaceId: scope.workspaceId,
      workItemId: scope.workItemId,
    });
    expect(invalidated).toBe(1);

    const second = await claimPreparationAttempt({
      workspaceId: scope.workspaceId,
      workItemId: scope.workItemId,
      kind: "creative_prepare",
      inputRevision: REV_B,
      inputFingerprint: "fp-2",
      leaseSeconds: 60,
    });
    expect(second.outcome).toBe("claimed");

    // A resposta atrasada do modelo da tentativa A chega agora. Precisa ser
    // descartada: ela foi calculada sobre entradas que ja nao valem.
    const late = await finalizePreparationAttempt({
      workspaceId: scope.workspaceId,
      workItemId: scope.workItemId,
      attemptId: attemptA,
      currentRevision: REV_B,
      currentFingerprint: "fp-2",
      state: "completed",
    });

    expect(late).toMatchObject({ ok: false });
    const rows = await attemptsOf(scope.workItemId);
    const newer = rows.find((row) => row.inputRevision === REV_B);
    expect(newer?.state).toBe("running");
  }, 30_000);

  it("dois workspaces com Trabalhos distintos nao interferem", async () => {
    const a = await createScope();
    const b = await createScope();

    const [claimA, claimB] = await Promise.all([
      claimPreparationAttempt({
        workspaceId: a.workspaceId,
        workItemId: a.workItemId,
        kind: "creative_prepare",
        inputRevision: REV_A,
        inputFingerprint: "fp-a",
        leaseSeconds: 60,
      }),
      claimPreparationAttempt({
        workspaceId: b.workspaceId,
        workItemId: b.workItemId,
        kind: "carousel_plan",
        inputRevision: REV_A,
        inputFingerprint: "fp-b",
        leaseSeconds: 60,
      }),
    ]);

    expect(claimA.outcome).toBe("claimed");
    expect(claimB.outcome).toBe("claimed");

    // Invalidar em A nao encosta em B.
    await invalidatePreparationAttempts({ workspaceId: a.workspaceId, workItemId: a.workItemId });
    expect(await getActivePreparationAttempt({ workspaceId: a.workspaceId, workItemId: a.workItemId })).toBeNull();
    expect(await getActivePreparationAttempt({ workspaceId: b.workspaceId, workItemId: b.workItemId })).not.toBeNull();

    // E o escopo de workspace e obrigatorio: o id de B com o workspace de A nao le nada.
    expect(await getActivePreparationAttempt({ workspaceId: a.workspaceId, workItemId: b.workItemId })).toBeNull();
  }, 30_000);
});

/** Semeia um ativo e uma fonte pronta no Trabalho do escopo. */
async function createSource(scope: Scope): Promise<string> {
  const [asset] = await db
    .insert(workspaceAssets)
    .values({
      workspaceId: scope.workspaceId,
      name: "base.png",
      key: `t13/${RUN_ID}/${Math.random().toString(36).slice(2)}.png`,
      type: "image/png",
      size: 1024,
      source: "upload",
    })
    .returning();
  const [source] = await db
    .insert(creativeWorkSources)
    .values({
      workspaceId: scope.workspaceId,
      workItemId: scope.workItemId,
      assetId: asset.id,
      usage: "both",
      usageConfirmed: true,
      status: "ready",
    })
    .returning();
  return source.id;
}

/**
 * Leva o Trabalho ao estado que `reservePreparedCreativeWorkOutputsIfCurrent`
 * exige: `ready` com brief, copy, inputSnapshot e identitySnapshot presentes.
 * O conteudo e minimo de proposito — a reserva so checa presenca.
 */
async function makeReadyForReservation(scope: Scope): Promise<Date> {
  const [row] = await db
    .update(creativeWorkItems)
    .set({
      status: "ready",
      brief: { theme: "T", objective: "O", audience: "A", offer: "Of" },
      copy: { headline: "H", body: "B", cta: "C" },
      inputSnapshot: { request: "R", settings: { targetFormats: [] }, sources: [] },
      identitySnapshot: { version: 1 },
    } as never)
    .where(eq(creativeWorkItems.id, scope.workItemId))
    .returning();
  return row.updatedAt;
}

const PLANS = [{ creativeLevel: "balanced", targetFormat: "4:5", versionNumber: 1 }] as never;

describe.skipIf(!TEST_DB_EXPLICITLY_CONFIGURED)("PR-03 Task 13 — escritores compativeis com a tentativa", () => {
  it("edicao de fonte invalida a tentativa em curso, na mesma transacao curta", async () => {
    const scope = await createScope();
    const sourceId = await createSource(scope);
    const [work] = await db
      .select()
      .from(creativeWorkItems)
      .where(eq(creativeWorkItems.id, scope.workItemId));

    const claimed = await claimPreparationAttempt({
      workspaceId: scope.workspaceId,
      workItemId: scope.workItemId,
      kind: "creative_prepare",
      inputRevision: work.updatedAt.toISOString(),
      inputFingerprint: "fp-1",
      leaseSeconds: 60,
    });
    expect(claimed.outcome).toBe("claimed");

    const changed = await mutateCreativeWorkDraftSource({
      workspaceId: scope.workspaceId,
      workItemId: scope.workItemId,
      expectedUpdatedAt: work.updatedAt,
      sourceId,
      mutation: { kind: "update", patch: { usage: "content" } },
    });
    expect(changed).not.toBeNull();

    // A edicao nao espera a IA: ela grava e invalida na mesma transacao curta.
    expect(await getActivePreparationAttempt({
      workspaceId: scope.workspaceId,
      workItemId: scope.workItemId,
    })).toBeNull();
  }, 30_000);

  it("reserva de outputs PROSSEGUE quando nao ha tentativa viva (controle)", async () => {
    const scope = await createScope();
    const preparedRevision = await makeReadyForReservation(scope);

    const reserved = await reservePreparedCreativeWorkOutputsIfCurrent({
      workspaceId: scope.workspaceId,
      workItemId: scope.workItemId,
      preparedRevision,
      plans: PLANS,
    });

    // Sem este controle, o teste seguinte passaria mesmo se a reserva falhasse
    // por um motivo qualquer da fixture, em vez de pela tentativa viva.
    expect(reserved).not.toBeNull();
    expect(reserved?.newlyCreatedIds).toHaveLength(1);
  }, 30_000);

  it("reserva de outputs RECUSA enquanto ha tentativa de preparacao viva", async () => {
    const scope = await createScope();
    const preparedRevision = await makeReadyForReservation(scope);

    const claimed = await claimPreparationAttempt({
      workspaceId: scope.workspaceId,
      workItemId: scope.workItemId,
      kind: "creative_prepare",
      inputRevision: preparedRevision.toISOString(),
      inputFingerprint: "fp-1",
      leaseSeconds: 60,
    });
    expect(claimed.outcome).toBe("claimed");

    const reserved = await reservePreparedCreativeWorkOutputsIfCurrent({
      workspaceId: scope.workspaceId,
      workItemId: scope.workItemId,
      preparedRevision,
      plans: PLANS,
    });

    // Gerar sobre briefing antigo e o que esta reserva existe para impedir.
    expect(reserved).toBeNull();
    const outputs = await db
      .select()
      .from(creativeWorkOutputs)
      .where(eq(creativeWorkOutputs.workItemId, scope.workItemId));
    expect(outputs).toHaveLength(0);
  }, 30_000);
});
