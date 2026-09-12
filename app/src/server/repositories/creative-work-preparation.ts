import { and, eq, lte, ne, sql } from "drizzle-orm";
import { db } from "../db";
import {
  creativeWorkPreparationAttempts,
  type CreativeWorkPreparationAttempt,
} from "../db/schema";
import {
  canFinalizeAttempt,
  type PreparationKind,
} from "../creative-work/preparation-attempt";

/**
 * Reserva, renovação, invalidação e finalização da tentativa de preparação.
 *
 * Toda função aqui roda em transação CURTA e decide validade pelo relógio do
 * BANCO (`now()`), nunca pelo relógio do processo — processos diferentes
 * derivam, e um lease julgado por relógio local admitiria dois donos.
 *
 * A exclusão mútua é do banco: o índice único parcial
 * `creative_work_preparation_attempts_active_uq` admite no máximo uma linha
 * `running` por Trabalho. Este módulo usa essa garantia; não a reimplementa.
 *
 * Nada aqui toca orçamento financeiro. Expiração de lease não é permissão para
 * retry infinito nem para nova cobrança: o contador de tentativas cobradas
 * continua sendo `manualRetryAttempt` em `creative_work_outputs`.
 */

/** Executor de escrita — permite rodar dentro da transação curta de quem chama. */
type WriteExecutor = Pick<typeof db, "update">;

export type ClaimPreparationAttemptResult =
  | { outcome: "claimed"; attempt: CreativeWorkPreparationAttempt }
  | { outcome: "joined"; attempt: CreativeWorkPreparationAttempt }
  | { outcome: "revision_changed" };

/** `now() + n segundos`, calculado pelo banco. */
function leaseExpiry(leaseSeconds: number) {
  return sql`now() + make_interval(secs => ${leaseSeconds})`;
}

/**
 * Reserva a tentativa vigente para este Trabalho.
 *
 * Uma requisição equivalente à que já está em curso recebe `joined` com a
 * MESMA tentativa — é isso que impede duas chamadas ao provedor para o mesmo
 * pedido quando a chamada externa sai da transação (PR-05).
 */
export async function claimPreparationAttempt(input: {
  workspaceId: string;
  workItemId: string;
  kind: PreparationKind;
  inputRevision: string;
  inputFingerprint: string;
  leaseSeconds: number;
}): Promise<ClaimPreparationAttemptResult> {
  return db.transaction(async (tx) => {
    // 1. Tentativa cujo lease venceu deixa de bloquear. O predicado é do banco.
    await tx
      .update(creativeWorkPreparationAttempts)
      .set({ state: "invalidated", updatedAt: new Date() })
      .where(and(
        eq(creativeWorkPreparationAttempts.workspaceId, input.workspaceId),
        eq(creativeWorkPreparationAttempts.workItemId, input.workItemId),
        eq(creativeWorkPreparationAttempts.state, "running"),
        lte(creativeWorkPreparationAttempts.leaseExpiresAt, sql`now()`),
      ));

    // 2. Tentativa presa a outra revisão de conteúdo é incompatível: a edição
    //    venceu, e o resultado dela não pode mais ser aplicado.
    await tx
      .update(creativeWorkPreparationAttempts)
      .set({ state: "invalidated", updatedAt: new Date() })
      .where(and(
        eq(creativeWorkPreparationAttempts.workspaceId, input.workspaceId),
        eq(creativeWorkPreparationAttempts.workItemId, input.workItemId),
        eq(creativeWorkPreparationAttempts.state, "running"),
        ne(creativeWorkPreparationAttempts.inputRevision, input.inputRevision),
      ));

    // 3. Sobrou alguma viva? Então esta requisição se junta a ela.
    const [alive] = await tx
      .select()
      .from(creativeWorkPreparationAttempts)
      .where(and(
        eq(creativeWorkPreparationAttempts.workspaceId, input.workspaceId),
        eq(creativeWorkPreparationAttempts.workItemId, input.workItemId),
        eq(creativeWorkPreparationAttempts.state, "running"),
      ))
      .limit(1);
    if (alive) return { outcome: "joined" as const, attempt: alive };

    // 4. Nenhuma viva: tenta assumir. Sob corrida, o índice parcial decide —
    //    a perdedora recebe zero linhas em vez de estourar 23505.
    const [created] = await tx
      .insert(creativeWorkPreparationAttempts)
      .values({
        workspaceId: input.workspaceId,
        workItemId: input.workItemId,
        kind: input.kind,
        inputRevision: input.inputRevision,
        inputFingerprint: input.inputFingerprint,
        state: "running",
        leaseExpiresAt: leaseExpiry(input.leaseSeconds) as unknown as Date,
      })
      // ATENCAO: e `where`, nao `targetWhere`. Nesta versao do drizzle (0.45.2)
      // `onConflictDoNothing` le APENAS `config.where`
      // (node_modules/drizzle-orm/pg-core/query-builders/insert.js:106);
      // `targetWhere` existe nos tipos e `where` aparece como deprecated, mas a
      // implementacao ignora `targetWhere` em silencio. Sem o predicado, o
      // `ON CONFLICT (work_item_id)` nao casa com o indice PARCIAL e o Postgres
      // recusa com 42P10. Nao "modernize" para `targetWhere` sem reconferir a
      // implementacao: o teste de claim concorrente e quem pega isso.
      .onConflictDoNothing({
        target: creativeWorkPreparationAttempts.workItemId,
        where: sql`${creativeWorkPreparationAttempts.state} = 'running'`,
      })
      .returning();
    if (created) return { outcome: "claimed" as const, attempt: created };

    // 5. Perdeu a corrida: relê a vencedora e junta-se a ela.
    const [winner] = await tx
      .select()
      .from(creativeWorkPreparationAttempts)
      .where(and(
        eq(creativeWorkPreparationAttempts.workspaceId, input.workspaceId),
        eq(creativeWorkPreparationAttempts.workItemId, input.workItemId),
        eq(creativeWorkPreparationAttempts.state, "running"),
      ))
      .limit(1);
    return winner
      ? { outcome: "joined" as const, attempt: winner }
      : { outcome: "revision_changed" as const };
  });
}

/**
 * Estende o lease da tentativa em curso.
 *
 * Escreve APENAS `lease_expires_at`. Nunca toca em `creative_work_items`: um
 * heartbeat operacional que mexesse na revisão de conteúdo invalidaria a
 * própria tentativa que está tentando manter viva.
 */
export async function renewPreparationAttempt(input: {
  workspaceId: string;
  attemptId: string;
  leaseSeconds: number;
}): Promise<boolean> {
  const rows = await db
    .update(creativeWorkPreparationAttempts)
    .set({ leaseExpiresAt: leaseExpiry(input.leaseSeconds) as unknown as Date, updatedAt: new Date() })
    .where(and(
      eq(creativeWorkPreparationAttempts.workspaceId, input.workspaceId),
      eq(creativeWorkPreparationAttempts.id, input.attemptId),
      eq(creativeWorkPreparationAttempts.state, "running"),
    ))
    .returning();
  return rows.length > 0;
}

/**
 * Invalida toda tentativa viva do Trabalho e devolve quantas foram atingidas.
 *
 * Aceita um `executor` para rodar DENTRO da transação curta de quem edita —
 * é assim que uma edição de fonte invalida a preparação em curso sem esperar
 * a resposta do modelo.
 */
export async function invalidatePreparationAttempts(input: {
  workspaceId: string;
  workItemId: string;
  executor?: WriteExecutor;
}): Promise<number> {
  const executor = input.executor ?? db;
  const rows = await executor
    .update(creativeWorkPreparationAttempts)
    .set({ state: "invalidated", updatedAt: new Date() })
    .where(and(
      eq(creativeWorkPreparationAttempts.workspaceId, input.workspaceId),
      eq(creativeWorkPreparationAttempts.workItemId, input.workItemId),
      eq(creativeWorkPreparationAttempts.state, "running"),
    ))
    .returning();
  return rows.length;
}

/**
 * Grava o estado terminal, mas só se esta tentativa ainda for a dona e as
 * entradas ainda forem as mesmas.
 *
 * É aqui que um resultado atrasado do provedor é descartado: a decisão é da
 * regra pura `canFinalizeAttempt`, e o motivo volta tipado para quem chamou
 * poder registrá-lo.
 */
export async function finalizePreparationAttempt(input: {
  workspaceId: string;
  workItemId: string;
  attemptId: string;
  currentRevision: string;
  currentFingerprint: string;
  state: "completed" | "failed";
}): Promise<{ ok: true } | { ok: false; reason: "not_owner" | "not_running" | "revision_changed" | "fingerprint_changed" | "lease_expired" }> {
  return db.transaction(async (tx) => {
    // A linha E o relógio do banco vêm na MESMA consulta: a decisão de lease
    // não pode depender do relógio de quem chamou, que deriva entre processos.
    const [found] = await tx
      .select({ attempt: creativeWorkPreparationAttempts, now: sql<Date>`now()` })
      .from(creativeWorkPreparationAttempts)
      .where(and(
        eq(creativeWorkPreparationAttempts.workspaceId, input.workspaceId),
        eq(creativeWorkPreparationAttempts.id, input.attemptId),
      ))
      .limit(1);
    if (!found) return { ok: false as const, reason: "not_owner" as const };
    const row = found.attempt;

    const verdict = canFinalizeAttempt({
      attempt: {
        id: row.id,
        state: row.state,
        inputRevision: row.inputRevision,
        inputFingerprint: row.inputFingerprint,
        leaseExpiresAt: row.leaseExpiresAt.toISOString(),
      },
      finalizingAttemptId: input.attemptId,
      currentRevision: input.currentRevision,
      currentFingerprint: input.currentFingerprint,
      now: new Date(found.now),
    });
    if (!verdict.ok) return verdict;

    const updated = await tx
      .update(creativeWorkPreparationAttempts)
      .set({ state: input.state, updatedAt: new Date() })
      .where(and(
        eq(creativeWorkPreparationAttempts.workspaceId, input.workspaceId),
        eq(creativeWorkPreparationAttempts.id, input.attemptId),
        eq(creativeWorkPreparationAttempts.state, "running"),
      ))
      .returning();
    // Perdeu para uma invalidação concorrente entre a leitura e a escrita.
    return updated.length > 0
      ? { ok: true as const }
      : { ok: false as const, reason: "not_running" as const };
  });
}

/**
 * Tentativa vigente e utilizável do Trabalho, ou `null`.
 *
 * "Utilizável" exclui lease vencido: uma execução morta não pode bloquear o
 * Trabalho para sempre.
 */
export async function getActivePreparationAttempt(input: {
  workspaceId: string;
  workItemId: string;
}): Promise<CreativeWorkPreparationAttempt | null> {
  const [row] = await db
    .select()
    .from(creativeWorkPreparationAttempts)
    .where(and(
      eq(creativeWorkPreparationAttempts.workspaceId, input.workspaceId),
      eq(creativeWorkPreparationAttempts.workItemId, input.workItemId),
      eq(creativeWorkPreparationAttempts.state, "running"),
      sql`${creativeWorkPreparationAttempts.leaseExpiresAt} > now()`,
    ))
    .limit(1);
  return row ?? null;
}
