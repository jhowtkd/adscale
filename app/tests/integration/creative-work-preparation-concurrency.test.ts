/**
 * PR-01 Task 6: recuperação concorrente da biblioteca contra a unicidade
 * GLOBAL de workspace_assets.key (workspace_assets_key_unique).
 *
 * Primeiro teste deste arquivo (a Task 8 o amplia com a caracterização de
 * preparação): duas recuperações concorrentes do mesmo output produzem uma
 * linha, resultado consistente e nenhum erro 23505.
 *
 * Único mock: `@/server/storage` (objectStorage.head) — o bucket R2 é efeito
 * externo; tudo que o teste prova é transacional no Postgres.
 *
 * Requer o container adscale-test-postgres migrado (coluna selection_effects):
 *   DATABASE_URL=postgres://test:test@localhost:5433/adscale_test npm test -- tests/integration/creative-work-preparation-concurrency.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import crypto from "node:crypto";

// Suíte exclusiva de Postgres real: só roda quando a URL do banco de teste é
// passada explicitamente (contrato documentado acima). No `npm test` padrão
// (sem Docker) ela é pulada — uma execução explícita com DB inacessível
// continua FALHANDO no beforeAll, nunca passando em silêncio.
const TEST_DB_EXPLICITLY_CONFIGURED = Boolean(
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL,
);

/**
 * Barreira de concorrencia, armavel por teste.
 *
 * POR QUE ELA EXISTE — nao simplifique sem ler isto. Sem barreira, um
 * Promise.all das duas chamadas da concorrencia de intencao, nao de execucao.
 * Entrelacamento medido por instrumentacao em 12/09/2026:
 *
 *   A:read-start / B:read-start
 *   A:read-done existing=nao
 *   A:insert-start -> A:insert-done criou=SIM
 *   B:read-done existing=SIM      <- B nunca chega no insert
 *
 * A completa leitura+insert ANTES da leitura de B retornar, entao B sai pelo
 * caminho benigno do `if (existing)` e a janela de corrida nunca abre. O teste
 * passava identico contra o insert desprotegido (createWorkspaceAsset), ou
 * seja: nao provava nada.
 *
 * `objectStorage.head` e o unico ponto que ambas as chamadas atravessam ENTRE
 * a leitura e o insert, o que faz dele a barreira correta. Segurar as duas ali
 * garante que ambas passaram da leitura com miss antes de qualquer insert.
 * Deadlock e impossivel: ninguem insere sem passar pela barreira, logo ambas
 * as leituras dao miss e ambas chegam.
 *
 * Desarmada (padrao), `head` e passagem livre — testes que nao precisam de
 * corrida nao sao afetados.
 */
const storageBarrier = vi.hoisted(() => {
  let pending = 0;
  let release: (() => void) | null = null;
  let gate: Promise<void> | null = null;
  return {
    /** Segura as proximas `n` chamadas a head() ate que todas tenham chegado. */
    arm(n: number) {
      pending = n;
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
    },
    async pass() {
      if (!gate) return;
      pending -= 1;
      if (pending <= 0) release?.();
      await gate;
    },
    disarm() {
      gate = null;
      release = null;
      pending = 0;
    },
  };
});

vi.mock("@/server/storage", () => ({
  objectStorage: {
    head: vi.fn(async () => {
      await storageBarrier.pass();
      return { contentLength: 1024 };
    }),
  },
}));

import { db } from "@/server/db";
import {
  clientProfiles,
  user,
  workspaceAssets,
  workspaces,
} from "@/server/db/schema";
import { ensureCreativeWorkOutputInLibrary } from "@/server/application/ensure-creative-work-output-library";

const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

let scopeSeq = 0;
const createdWorkspaceIds: string[] = [];
const createdUserIds: string[] = [];

/**
 * Semeia a cadeia mínima de FK pelo mesmo caminho de
 * creative-work-recovery.test.ts: user → workspace → client profile.
 * IDs únicos por execução; afterAll remove APENAS essas linhas.
 */
async function createScope(): Promise<{ userId: string; workspaceId: string; clientProfileId: string }> {
  scopeSeq += 1;
  const tag = `t6-${RUN_ID}-${scopeSeq}`;
  const userId = `user-${tag}`;

  await db.insert(user).values({
    id: userId,
    name: "T6 Integration",
    email: `${tag}@example.com`,
    emailVerified: true,
  });
  const [workspace] = await db
    .insert(workspaces)
    .values({ name: `T6 ${tag}`, slug: tag })
    .returning();
  const [profile] = await db
    .insert(clientProfiles)
    .values({ workspaceId: workspace.id, name: `Profile ${tag}` })
    .returning();

  createdUserIds.push(userId);
  createdWorkspaceIds.push(workspace.id);
  return { userId, workspaceId: workspace.id, clientProfileId: profile.id };
}

beforeAll(async () => {
  try {
    await db.execute(sql`select 1`);
  } catch (err) {
    throw new Error(
      `[creative-work-preparation-concurrency] Postgres de teste INACESSÍVEL (DATABASE_URL=${
        process.env.DATABASE_URL ?? "(não definida)"
      }). Suba o container adscale-test-postgres migrado antes de rodar este teste. ` +
        `Causa: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}, 30_000);

afterAll(async () => {
  if (createdWorkspaceIds.length > 0) {
    await db.delete(workspaceAssets).where(inArray(workspaceAssets.workspaceId, createdWorkspaceIds));
    await db.delete(clientProfiles).where(inArray(clientProfiles.workspaceId, createdWorkspaceIds));
    await db.delete(workspaces).where(inArray(workspaces.id, createdWorkspaceIds));
  }
  if (createdUserIds.length > 0) {
    await db.delete(user).where(inArray(user.id, createdUserIds));
  }
}, 30_000);

describe.skipIf(!TEST_DB_EXPLICITLY_CONFIGURED)("creative-work preparation concurrency (Postgres real)", () => {
  it("duas recuperacoes concorrentes do mesmo ativo produzem uma linha e nenhum erro", async () => {
    const { workspaceId } = await createScope();
    const outputKey = `creative-work/${crypto.randomUUID()}/out.png`;

    type EnsureResult = Awaited<ReturnType<typeof ensureCreativeWorkOutputInLibrary>>;
    let first: EnsureResult;
    let second: EnsureResult;

    // Sem isto as chamadas serializam e o caminho de conflito nunca roda.
    storageBarrier.arm(2);
    try {
      [first, second] = await Promise.all([
        ensureCreativeWorkOutputInLibrary({
          workspaceId,
          outputKey,
          theme: "Tema",
          creativeLevel: "balanced",
        }),
        ensureCreativeWorkOutputInLibrary({
          workspaceId,
          outputKey,
          theme: "Tema",
          creativeLevel: "balanced",
        }),
      ]);
    } finally {
      storageBarrier.disarm();
    }

    const rows = await db
      .select()
      .from(workspaceAssets)
      .where(eq(workspaceAssets.key, outputKey));

    expect(rows).toHaveLength(1);
    expect([first.created, second.created].filter(Boolean)).toHaveLength(1);
    expect(first.asset?.id).toBe(rows[0].id);
    expect(second.asset?.id).toBe(rows[0].id);
  });
});
