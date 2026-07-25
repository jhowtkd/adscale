/**
 * T8 — R-006/R-007: reconciliação da máquina de estados do job creative-work
 * contra Postgres REAL (adscale_test). Primeiro teste do repo sem mocks de
 * repositório/db: importa os módulos de produção e prova, consultando outputs
 * E ledger (usage_events + credit_transactions + credit_grants) no banco:
 *
 *  1. Teto durável CAS de chamadas de imagem (claim 0→1→2, 2→3 falha; corrida
 *     concorrente admite no máximo CREATIVE_WORK_MAX_IMAGE_CALLS vencedores).
 *  2. Sucesso mantém exatamente um débito líquido (reentrega não duplica).
 *  3. Refund de falha terminal credita o grant e grava o ledger uma vez só.
 *  4. Reentrega duplicada (Inngest) após falha terminal é no-op total.
 *  5. Retry manual re-ativa a cobrança idempotentemente (um débito líquido),
 *     repetir não duplica, e imageCallCount = 2 é rejeitado.
 *
 * Único mock: `@/server/jobs/client` (inngest.send) — o despacho é efeito
 * externo; tudo que o teste prova é transacional. Storage/provider pago não
 * são exercitados por essas funções (confirmado lendo o código).
 *
 * Requer o container adscale-test-postgres migrado:
 *   DATABASE_URL=postgres://test:test@localhost:5433/adscale_test npm test -- tests/integration/creative-work-recovery.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";

// Suíte exclusiva de Postgres real: só roda quando a URL do banco de teste é
// passada explicitamente (contrato documentado acima). No `npm test` padrão
// (sem Docker) ela é pulada — uma execução explícita com DB inacessível
// continua FALHANDO no beforeAll, nunca passando em silêncio.
const TEST_DB_EXPLICITLY_CONFIGURED = Boolean(
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL,
);

vi.mock("@/server/jobs/client", () => ({
  inngest: {
    send: vi.fn(async () => undefined),
  },
}));

import { db } from "@/server/db";
import {
  betaAnalyticsEvents,
  clientProfiles,
  creditGrants,
  creditTransactions,
  creativeWorkItems,
  creativeWorkOutputs,
  subscriptions,
  usageEvents,
  user,
  workspaces,
  type CreativeWorkOutput,
} from "@/server/db/schema";
import {
  CREATIVE_WORK_MAX_IMAGE_CALLS,
  claimCreativeWorkOutputImageCall,
  completeCreativeWorkOutput,
  failCreativeWorkOutput,
  markCreativeWorkOutputProcessing,
} from "@/server/repositories/creative-work";
import { recordUsage, refundCredits } from "@/server/billing/credits";
import { getUsageByIdempotencyKey } from "@/server/repositories/usage";
import { retryCreativeWorkOutput } from "@/server/application/retry-creative-work-output";
import {
  GENERATION_CREDIT_COSTS,
  creativeWorkUnitBillingKey,
} from "@/server/generation/canonical/types";
import { inngest } from "@/server/jobs/client";

const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const CHARGE = GENERATION_CREDIT_COSTS.creativeWorkOutput;
const GRANT_START = 100;

let scopeSeq = 0;
const createdWorkspaceIds: string[] = [];
const createdUserIds: string[] = [];

interface TestScope {
  tag: string;
  userId: string;
  workspaceId: string;
  grantId: string;
  clientProfileId: string;
  workItemId: string;
}

/**
 * Semeia a cadeia mínima de FK para o fluxo: user → workspace → subscription
 * ativa (hasSpendAccess) + grant de créditos → client profile → work item.
 * IDs únicos por execução; afterAll remove APENAS essas linhas.
 */
async function createScope(): Promise<TestScope> {
  scopeSeq += 1;
  const tag = `t8-${RUN_ID}-${scopeSeq}`;
  const userId = `user-${tag}`;

  await db.insert(user).values({
    id: userId,
    name: "T8 Integration",
    email: `${tag}@example.com`,
    emailVerified: true,
  });
  const [workspace] = await db
    .insert(workspaces)
    .values({ name: `T8 ${tag}`, slug: tag })
    .returning();
  await db.insert(subscriptions).values({
    workspaceId: workspace.id,
    stripeSubscriptionId: `sub_${tag}`,
    stripeCustomerId: `cus_${tag}`,
    status: "active",
    planKey: "growth",
    priceId: "price_test",
  });
  const [grant] = await db
    .insert(creditGrants)
    .values({
      workspaceId: workspace.id,
      source: "test",
      sourceId: tag,
      amount: GRANT_START,
      remaining: GRANT_START,
    })
    .returning();
  const [profile] = await db
    .insert(clientProfiles)
    .values({ workspaceId: workspace.id, name: `Profile ${tag}` })
    .returning();
  const [work] = await db
    .insert(creativeWorkItems)
    .values({
      workspaceId: workspace.id,
      clientProfileId: profile.id,
      createdByUserId: userId,
      toolKind: "social_post",
      title: `T8 ${tag}`,
      request: "integration test",
      format: "4:5",
      settings: { targetFormats: [] },
      status: "generating",
    })
    .returning();

  createdUserIds.push(userId);
  createdWorkspaceIds.push(workspace.id);
  return {
    tag,
    userId,
    workspaceId: workspace.id,
    grantId: grant.id,
    clientProfileId: profile.id,
    workItemId: work.id,
  };
}

async function createOutput(
  scope: TestScope,
  creativeLevel: CreativeWorkOutput["creativeLevel"],
): Promise<CreativeWorkOutput> {
  const [output] = await db
    .insert(creativeWorkOutputs)
    .values({
      workspaceId: scope.workspaceId,
      workItemId: scope.workItemId,
      creativeLevel,
      targetFormat: "4:5",
      versionNumber: 1,
      operationKey: `${creativeLevel}:4:5:1`,
      status: "queued",
      isSelected: false,
    })
    .returning();
  return output;
}

async function getOutput(outputId: string): Promise<CreativeWorkOutput> {
  const [row] = await db
    .select()
    .from(creativeWorkOutputs)
    .where(eq(creativeWorkOutputs.id, outputId))
    .limit(1);
  if (!row) throw new Error(`output ${outputId} não encontrado no banco de teste`);
  return row;
}

/** Ledger completo do workspace: usage_events + credit_transactions + grants. */
async function ledgerSnapshot(workspaceId: string) {
  const events = await db
    .select()
    .from(usageEvents)
    .where(eq(usageEvents.workspaceId, workspaceId));
  const txs = await db
    .select()
    .from(creditTransactions)
    .where(eq(creditTransactions.workspaceId, workspaceId));
  const grants = await db
    .select()
    .from(creditGrants)
    .where(eq(creditGrants.workspaceId, workspaceId));
  return {
    events,
    txs,
    grantRemaining: grants.reduce((total, g) => total + g.remaining, 0),
    usageSum: events.reduce((total, e) => total + (e.amount ?? 0), 0),
    txSum: txs.reduce((total, tx) => total + tx.amount, 0),
  };
}

async function countUsageEventsWithKey(workspaceId: string, key: string): Promise<number> {
  const rows = await db
    .select({ id: usageEvents.id })
    .from(usageEvents)
    .where(and(eq(usageEvents.workspaceId, workspaceId), eq(usageEvents.idempotencyKey, key)));
  return rows.length;
}

function terminalRefundKey(scope: TestScope, outputId: string): string {
  return `creative-work:${scope.workItemId}:output:${outputId}:terminal-refund`;
}

/** Deixa promessas fire-and-forget (analytics de crédito) assentarem antes do cleanup. */
async function flushFireAndForget() {
  await new Promise((resolve) => setTimeout(resolve, 100));
}

beforeAll(async () => {
  try {
    await db.execute(sql`select 1`);
  } catch (err) {
    throw new Error(
      `[creative-work-recovery] Postgres de teste INACESSÍVEL (DATABASE_URL=${
        process.env.DATABASE_URL ?? "(não definida)"
      }). Suba o container adscale-test-postgres migrado antes de rodar este teste. ` +
        `Causa: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const columnCheck = await db.execute(sql`
    select column_name from information_schema.columns
    where table_schema = 'adscale_app'
      and table_name = 'creative_work_outputs'
      and column_name = 'image_call_count'
  `);
  if (columnCheck.rows.length === 0) {
    throw new Error(
      "[creative-work-recovery] migration 0077 (creative_work_outputs.image_call_count) NÃO aplicada no banco de teste.",
    );
  }
}, 30_000);

afterAll(async () => {
  await flushFireAndForget();
  // Ordem reversa das FKs; escopo restrito às linhas criadas por ESTA suíte.
  if (createdWorkspaceIds.length > 0) {
    await db.delete(betaAnalyticsEvents).where(inArray(betaAnalyticsEvents.workspaceId, createdWorkspaceIds));
    await db.delete(creditTransactions).where(inArray(creditTransactions.workspaceId, createdWorkspaceIds));
    await db.delete(usageEvents).where(inArray(usageEvents.workspaceId, createdWorkspaceIds));
    await db.delete(creativeWorkOutputs).where(inArray(creativeWorkOutputs.workspaceId, createdWorkspaceIds));
    await db.delete(creativeWorkItems).where(inArray(creativeWorkItems.workspaceId, createdWorkspaceIds));
    await db.delete(creditGrants).where(inArray(creditGrants.workspaceId, createdWorkspaceIds));
    await db.delete(subscriptions).where(inArray(subscriptions.workspaceId, createdWorkspaceIds));
    await db.delete(clientProfiles).where(inArray(clientProfiles.workspaceId, createdWorkspaceIds));
    await db.delete(workspaces).where(inArray(workspaces.id, createdWorkspaceIds));
  }
  if (createdUserIds.length > 0) {
    await db.delete(user).where(inArray(user.id, createdUserIds));
  }
}, 30_000);

describe.skipIf(!TEST_DB_EXPLICITLY_CONFIGURED)("creative-work recovery (Postgres real)", () => {
  it(
    "1) teto durável CAS: claim 0→1→2, tentativa 2→3 retorna null; corrida concorrente admite no máximo 2 vencedores",
    async () => {
      expect(CREATIVE_WORK_MAX_IMAGE_CALLS).toBe(2);
      const scope = await createScope();
      const sequential = await createOutput(scope, "conservative");

      const first = await claimCreativeWorkOutputImageCall(scope.workspaceId, scope.workItemId, sequential.id);
      expect(first?.imageCallCount).toBe(1);
      const second = await claimCreativeWorkOutputImageCall(scope.workspaceId, scope.workItemId, sequential.id);
      expect(second?.imageCallCount).toBe(2);
      // A terceira chamada morre no CAS, ANTES de qualquer provider.
      const third = await claimCreativeWorkOutputImageCall(scope.workspaceId, scope.workItemId, sequential.id);
      expect(third).toBeNull();
      expect((await getOutput(sequential.id)).imageCallCount).toBe(CREATIVE_WORK_MAX_IMAGE_CALLS);

      // Corrida: N claims simultâneos sobre a mesma linha — o índice/UPDATE
      // guardado serializa e só CREATIVE_WORK_MAX_IMAGE_CALLS vencem.
      const raced = await createOutput(scope, "balanced");
      const claims = await Promise.all(
        Array.from({ length: 5 }, () =>
          claimCreativeWorkOutputImageCall(scope.workspaceId, scope.workItemId, raced.id),
        ),
      );
      const winners = claims.filter((row): row is CreativeWorkOutput => row !== null);
      expect(winners).toHaveLength(CREATIVE_WORK_MAX_IMAGE_CALLS);
      expect(winners.map((row) => row.imageCallCount).sort()).toEqual([1, 2]);
      expect((await getOutput(raced.id)).imageCallCount).toBe(CREATIVE_WORK_MAX_IMAGE_CALLS);
    },
    30_000,
  );

  it(
    "2) sucesso mantém exatamente um débito líquido no ledger (reentrega da cobrança/conclusão não duplica)",
    async () => {
      const scope = await createScope();
      const output = await createOutput(scope, "conservative");
      const billingKey = creativeWorkUnitBillingKey(scope.workItemId, output.id);

      const charge = await recordUsage({
        workspaceId: scope.workspaceId,
        action: "image_derivation",
        idempotencyKey: billingKey,
        amount: CHARGE,
        metadata: { creativeWorkId: scope.workItemId, outputId: output.id },
        userId: scope.userId,
      });
      expect(charge.status).toBe("recorded");

      await markCreativeWorkOutputProcessing(scope.workspaceId, scope.workItemId, output.id);
      const completed = await completeCreativeWorkOutput(scope.workspaceId, scope.workItemId, output.id, {
        outputKey: `creative-work/${output.id}/final.png`,
        cost: CHARGE,
        quality: null,
      });
      expect(completed?.status).toBe("completed");

      // Reentrega Inngest após conclusão: cobrança repetida é duplicate e a
      // conclusão repetida perde o CAS de status — sem efeito.
      const redeliveredCharge = await recordUsage({
        workspaceId: scope.workspaceId,
        action: "image_derivation",
        idempotencyKey: billingKey,
        amount: CHARGE,
        metadata: { creativeWorkId: scope.workItemId, outputId: output.id },
        userId: scope.userId,
      });
      expect(redeliveredCharge.status).toBe("duplicate");
      const redeliveredComplete = await completeCreativeWorkOutput(scope.workspaceId, scope.workItemId, output.id, {
        outputKey: `creative-work/${output.id}/final.png`,
        cost: CHARGE,
        quality: null,
      });
      expect(redeliveredComplete).toBeNull();

      const usageRow = await getUsageByIdempotencyKey(scope.workspaceId, billingKey);
      expect(usageRow).not.toBeNull();
      expect(usageRow?.amount).toBe(CHARGE);
      expect(await countUsageEventsWithKey(scope.workspaceId, billingKey)).toBe(1);

      const ledger = await ledgerSnapshot(scope.workspaceId);
      expect(ledger.events).toHaveLength(1);
      expect(ledger.txs).toHaveLength(1);
      expect(ledger.txs[0]).toMatchObject({ amount: -CHARGE, type: "usage" });
      expect(ledger.usageSum).toBe(CHARGE);
      expect(ledger.txSum).toBe(-CHARGE);
      expect(ledger.grantRemaining).toBe(GRANT_START - CHARGE);
      expect((await getOutput(output.id)).status).toBe("completed");
    },
    30_000,
  );

  it(
    "3) refund de falha terminal credita o grant e grava o ledger exatamente uma vez (repeat = duplicate; corrida = um crédito)",
    async () => {
      // A) mesma idempotency key repetida em sequência.
      const scopeA = await createScope();
      const failed = await createOutput(scopeA, "conservative");
      const billingKeyA = creativeWorkUnitBillingKey(scopeA.workItemId, failed.id);
      const refundKeyA = terminalRefundKey(scopeA, failed.id);

      const chargeA = await recordUsage({
        workspaceId: scopeA.workspaceId,
        action: "image_derivation",
        idempotencyKey: billingKeyA,
        amount: CHARGE,
        userId: scopeA.userId,
      });
      expect(chargeA.status).toBe("recorded");
      await markCreativeWorkOutputProcessing(scopeA.workspaceId, scopeA.workItemId, failed.id);
      const claimA = await claimCreativeWorkOutputImageCall(scopeA.workspaceId, scopeA.workItemId, failed.id);
      expect(claimA?.imageCallCount).toBe(1);
      await failCreativeWorkOutput(scopeA.workspaceId, scopeA.workItemId, failed.id, "provider_error");

      const refundInput = {
        workspaceId: scopeA.workspaceId,
        action: "image_derivation" as const,
        idempotencyKey: refundKeyA,
        amount: CHARGE,
        metadata: { description: "creative_work_output_terminal_refund", outputId: failed.id },
        userId: scopeA.userId,
      };
      const first = await refundCredits(refundInput);
      expect(first.status).toBe("refunded");
      const second = await refundCredits(refundInput);
      expect(second.status).toBe("duplicate");
      const third = await refundCredits(refundInput);
      expect(third.status).toBe("duplicate");

      const refundRow = await getUsageByIdempotencyKey(scopeA.workspaceId, refundKeyA);
      expect(refundRow?.amount).toBe(-CHARGE);
      expect(await countUsageEventsWithKey(scopeA.workspaceId, refundKeyA)).toBe(1);

      const ledgerA = await ledgerSnapshot(scopeA.workspaceId);
      // Uma cobrança + um refund: líquido zero, grant restaurado.
      expect(ledgerA.events).toHaveLength(2);
      expect(ledgerA.txs).toHaveLength(2);
      expect(ledgerA.usageSum).toBe(0);
      expect(ledgerA.txSum).toBe(0);
      expect(ledgerA.grantRemaining).toBe(GRANT_START);
      expect(ledgerA.txs.filter((tx) => tx.type === "refund")).toHaveLength(1);

      // B) corrida concorrente com a MESMA key: o crédito do grant aterrissa
      // uma única vez mesmo sob FOR UPDATE.
      const scopeB = await createScope();
      const raced = await createOutput(scopeB, "conservative");
      const refundKeyB = terminalRefundKey(scopeB, raced.id);
      const chargeB = await recordUsage({
        workspaceId: scopeB.workspaceId,
        action: "image_derivation",
        idempotencyKey: creativeWorkUnitBillingKey(scopeB.workItemId, raced.id),
        amount: CHARGE,
        userId: scopeB.userId,
      });
      expect(chargeB.status).toBe("recorded");
      await markCreativeWorkOutputProcessing(scopeB.workspaceId, scopeB.workItemId, raced.id);
      await failCreativeWorkOutput(scopeB.workspaceId, scopeB.workItemId, raced.id, "provider_error");

      const raceInput = {
        workspaceId: scopeB.workspaceId,
        action: "image_derivation" as const,
        idempotencyKey: refundKeyB,
        amount: CHARGE,
        userId: scopeB.userId,
      };
      const [r1, r2, r3] = await Promise.all([
        refundCredits(raceInput),
        refundCredits({ ...raceInput }),
        refundCredits({ ...raceInput }),
      ]);
      const statuses = [r1.status, r2.status, r3.status].sort();
      expect(statuses).toEqual(["duplicate", "duplicate", "refunded"]);

      expect(await countUsageEventsWithKey(scopeB.workspaceId, refundKeyB)).toBe(1);
      const ledgerB = await ledgerSnapshot(scopeB.workspaceId);
      expect(ledgerB.events).toHaveLength(2);
      expect(ledgerB.txSum).toBe(0);
      expect(ledgerB.grantRemaining).toBe(GRANT_START);
    },
    30_000,
  );

  it(
    "4) reentrega duplicada após falha terminal não altera contador, status, output nem ledger",
    async () => {
      const scope = await createScope();
      const output = await createOutput(scope, "conservative");
      const billingKey = creativeWorkUnitBillingKey(scope.workItemId, output.id);
      const refundKey = terminalRefundKey(scope, output.id);

      // Sequência terminal completa: cobrança → processing → budget esgotado
      // (2 claims) → falha → refund.
      const charge = await recordUsage({
        workspaceId: scope.workspaceId,
        action: "image_derivation",
        idempotencyKey: billingKey,
        amount: CHARGE,
        userId: scope.userId,
      });
      expect(charge.status).toBe("recorded");
      await markCreativeWorkOutputProcessing(scope.workspaceId, scope.workItemId, output.id);
      await claimCreativeWorkOutputImageCall(scope.workspaceId, scope.workItemId, output.id);
      await claimCreativeWorkOutputImageCall(scope.workspaceId, scope.workItemId, output.id);
      const failedRow = await failCreativeWorkOutput(scope.workspaceId, scope.workItemId, output.id, "provider_error");
      expect(failedRow?.status).toBe("failed");
      const refund = await refundCredits({
        workspaceId: scope.workspaceId,
        action: "image_derivation",
        idempotencyKey: refundKey,
        amount: CHARGE,
        userId: scope.userId,
      });
      expect(refund.status).toBe("refunded");

      const outputBefore = await getOutput(output.id);
      const ledgerBefore = await ledgerSnapshot(scope.workspaceId);

      // Reentrega Inngest: repete a MESMA sequência. Tudo deve ser no-op.
      const claimAgain = await claimCreativeWorkOutputImageCall(scope.workspaceId, scope.workItemId, output.id);
      expect(claimAgain).toBeNull(); // teto durável atingido
      const failAgain = await failCreativeWorkOutput(scope.workspaceId, scope.workItemId, output.id, "provider_error");
      expect(failAgain).toBeNull(); // CAS exige status processing
      const chargeAgain = await recordUsage({
        workspaceId: scope.workspaceId,
        action: "image_derivation",
        idempotencyKey: billingKey,
        amount: CHARGE,
        userId: scope.userId,
      });
      expect(chargeAgain.status).toBe("duplicate");
      const refundAgain = await refundCredits({
        workspaceId: scope.workspaceId,
        action: "image_derivation",
        idempotencyKey: refundKey,
        amount: CHARGE,
        userId: scope.userId,
      });
      expect(refundAgain.status).toBe("duplicate");

      const outputAfter = await getOutput(output.id);
      const ledgerAfter = await ledgerSnapshot(scope.workspaceId);

      // Linha intacta (inclui imageCallCount, status, failureCode e updatedAt).
      expect(outputAfter).toEqual(outputBefore);
      expect(outputAfter.imageCallCount).toBe(CREATIVE_WORK_MAX_IMAGE_CALLS);
      expect(outputAfter.status).toBe("failed");
      // Ledger intacto.
      expect(ledgerAfter.events).toHaveLength(ledgerBefore.events.length);
      expect(ledgerAfter.txs).toHaveLength(ledgerBefore.txs.length);
      expect(ledgerAfter.usageSum).toBe(ledgerBefore.usageSum);
      expect(ledgerAfter.txSum).toBe(ledgerBefore.txSum);
      expect(ledgerAfter.grantRemaining).toBe(ledgerBefore.grantRemaining);
    },
    30_000,
  );

  it(
    "5) retry manual re-ativa a cobrança idempotentemente (um débito líquido), repetir não duplica, budget esgotado é rejeitado",
    async () => {
      const scope = await createScope();
      const output = await createOutput(scope, "conservative");
      const billingKey = creativeWorkUnitBillingKey(scope.workItemId, output.id);
      const refundKey = terminalRefundKey(scope, output.id);
      const reactivateKey = `creative-work:${scope.workItemId}:output:${output.id}:reactivate-terminal`;
      const sendMock = vi.mocked(inngest.send);
      sendMock.mockClear();

      // Ciclo falho refundado: cobrança → processing → 1 provider call →
      // falha terminal → refund.
      const charge = await recordUsage({
        workspaceId: scope.workspaceId,
        action: "image_derivation",
        idempotencyKey: billingKey,
        amount: CHARGE,
        userId: scope.userId,
      });
      expect(charge.status).toBe("recorded");
      await markCreativeWorkOutputProcessing(scope.workspaceId, scope.workItemId, output.id);
      await claimCreativeWorkOutputImageCall(scope.workspaceId, scope.workItemId, output.id);
      await failCreativeWorkOutput(scope.workspaceId, scope.workItemId, output.id, "provider_error");
      const refund = await refundCredits({
        workspaceId: scope.workspaceId,
        action: "image_derivation",
        idempotencyKey: refundKey,
        amount: CHARGE,
        userId: scope.userId,
      });
      expect(refund.status).toBe("refunded");

      // Primeiro retry manual: re-ativa o débito original ANTES do requeue.
      const retry1 = await retryCreativeWorkOutput({
        workspaceId: scope.workspaceId,
        workItemId: scope.workItemId,
        outputId: output.id,
        userId: scope.userId,
      });
      expect(retry1.ok).toBe(true);
      if (retry1.ok) {
        expect(retry1.value.output.status).toBe("queued");
        expect(retry1.value.output.retryCount).toBe(1);
        expect(retry1.value.output.failureCode).toBeNull();
      }
      expect(sendMock).toHaveBeenCalledTimes(1);
      expect(sendMock).toHaveBeenCalledWith([
        {
          name: "creative-work.generate",
          data: { workspaceId: scope.workspaceId, workItemId: scope.workItemId, outputId: output.id },
        },
      ]);

      // Re-ativação gravada exatamente uma vez; líquido = um débito.
      const reactivationRow = await getUsageByIdempotencyKey(scope.workspaceId, reactivateKey);
      expect(reactivationRow?.amount).toBe(CHARGE);
      expect(await countUsageEventsWithKey(scope.workspaceId, reactivateKey)).toBe(1);
      let ledger = await ledgerSnapshot(scope.workspaceId);
      expect(ledger.events).toHaveLength(3); // generate + terminal-refund + reactivate-terminal
      expect(ledger.txs).toHaveLength(3);
      expect(ledger.usageSum).toBe(CHARGE); // +5 -5 +5
      expect(ledger.txSum).toBe(-CHARGE); // -5 +5 -5: no máximo um débito líquido
      expect(ledger.grantRemaining).toBe(GRANT_START - CHARGE);

      // Repetir o MESMO comando: output já não está falho → rejeitado antes de
      // qualquer efeito. Nada duplica: débito, crédito, output ou evento.
      const outputAfterRetry = await getOutput(output.id);
      const retry2 = await retryCreativeWorkOutput({
        workspaceId: scope.workspaceId,
        workItemId: scope.workItemId,
        outputId: output.id,
        userId: scope.userId,
      });
      expect(retry2).toEqual({ ok: false, error: { code: "output_not_retriable", status: "queued" } });
      expect(sendMock).toHaveBeenCalledTimes(1);
      expect(await getOutput(output.id)).toEqual(outputAfterRetry);
      ledger = await ledgerSnapshot(scope.workspaceId);
      expect(ledger.events).toHaveLength(3);
      expect(ledger.txs).toHaveLength(3);
      expect(ledger.usageSum).toBe(CHARGE);
      expect(ledger.txSum).toBe(-CHARGE);
      expect(ledger.grantRemaining).toBe(GRANT_START - CHARGE);

      // A tentativa re-enfileirada consome a ÚLTima chamada de provider e falha
      // de novo; o refund repetido do job é duplicate (não devolve duas vezes).
      await markCreativeWorkOutputProcessing(scope.workspaceId, scope.workItemId, output.id);
      const lastClaim = await claimCreativeWorkOutputImageCall(scope.workspaceId, scope.workItemId, output.id);
      expect(lastClaim?.imageCallCount).toBe(CREATIVE_WORK_MAX_IMAGE_CALLS);
      await failCreativeWorkOutput(scope.workspaceId, scope.workItemId, output.id, "provider_error");
      const secondRefund = await refundCredits({
        workspaceId: scope.workspaceId,
        action: "image_derivation",
        idempotencyKey: refundKey,
        amount: CHARGE,
        userId: scope.userId,
      });
      expect(secondRefund.status).toBe("duplicate");

      // Budget durável esgotado → retry manual rejeitado, sem débito nem evento.
      const retry3 = await retryCreativeWorkOutput({
        workspaceId: scope.workspaceId,
        workItemId: scope.workItemId,
        outputId: output.id,
        userId: scope.userId,
      });
      expect(retry3).toEqual({
        ok: false,
        error: { code: "output_not_retriable", status: "image_call_budget_exhausted" },
      });
      expect(sendMock).toHaveBeenCalledTimes(1);
      ledger = await ledgerSnapshot(scope.workspaceId);
      expect(ledger.events).toHaveLength(3);
      expect(ledger.txs).toHaveLength(3);
      expect(ledger.txSum).toBe(-CHARGE);
      expect(ledger.grantRemaining).toBe(GRANT_START - CHARGE);
      expect((await getOutput(output.id)).status).toBe("failed");
    },
    30_000,
  );
});
