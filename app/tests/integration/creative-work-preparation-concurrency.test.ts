/**
 * PR-01 Task 6: recuperação concorrente da biblioteca contra a unicidade
 * GLOBAL de workspace_assets.key (workspace_assets_key_unique).
 *
 * Primeiro teste deste arquivo (a Task 8 o amplia com a caracterização de
 * preparação): duas recuperações concorrentes do mesmo output produzem uma
 * linha, resultado consistente e nenhum erro 23505.
 *
 * PR-02 Task 8: caracterização concorrente da preparação. Mede — não julga —
 * o que a transação longa provoca hoje: quantas chamadas de modelo dois
 * pedidos iguais disparam, se um escritor curto do MESMO Trabalho espera a
 * resposta do modelo, se um Trabalho DIFERENTE escapa, e quantas conexões o
 * mesmo Trabalho consegue prender.
 *
 * Mocks: `@/server/storage` (objectStorage.head) e `generateSocialPostCopy`
 * (o provedor suspenso). Tudo o mais é produção real contra Postgres real.
 *
 * Requer o container adscale-test-postgres migrado (coluna selection_effects):
 *   DATABASE_URL=postgres://test:test@localhost:5433/adscale_test npm test -- tests/integration/creative-work-preparation-concurrency.test.ts
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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

/**
 * Portao do modelo: suspende `generateSocialPostCopy` sob controle do teste.
 *
 * Sem isto a medicao mistura tempo de IA com tempo de banco e nenhuma conclusao
 * sobre a transacao e possivel. O mock substitui SO a chamada externa — o lock,
 * a transacao e toda a validacao de `prepareCreativeWork` continuam reais.
 */
const modelGate = vi.hoisted(() => {
  let arrivals = 0;
  let waiters: Array<{ n: number; resolve: () => void }> = [];
  let release!: () => void;
  let gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    get arrivals() {
      return arrivals;
    },
    /** Chamado de dentro do mock: registra a chegada e espera a liberacao. */
    async enter() {
      arrivals += 1;
      for (const w of waiters) if (arrivals >= w.n) w.resolve();
      await gate;
    },
    /** Resolve quando `n` chamadas tiverem entrado no portao. */
    waitForArrivals(n: number) {
      if (arrivals >= n) return Promise.resolve();
      return new Promise<void>((resolve) => {
        waiters.push({ n, resolve });
      });
    },
    releaseAll() {
      release();
    },
    reset() {
      arrivals = 0;
      waiters = [];
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
    },
  };
});

vi.mock("@/server/creative-work/copy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/creative-work/copy")>();
  return {
    ...actual,
    generateSocialPostCopy: vi.fn(async () => {
      await modelGate.enter();
      return { headline: "Titulo medido", body: "Corpo medido", cta: "Acao" };
    }),
  };
});

import { db } from "@/server/db";
import {
  clientProfiles,
  creativeWorkItems,
  creativeWorkSources,
  user,
  workspaceAssets,
  workspaces,
} from "@/server/db/schema";
import { ensureCreativeWorkOutputInLibrary } from "@/server/application/ensure-creative-work-output-library";
import { prepareCreativeWork } from "@/server/application/prepare-creative-work";
import {
  mutateCreativeWorkDraftSource,
  withCreativeWorkPreparationLock,
} from "@/server/repositories/creative-work";
import { invalidatePreparationAttempts } from "@/server/repositories/creative-work-preparation";
import { creativeWorkPreparationAttempts } from "@/server/db/schema";

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


/** Cede o event loop por `ms` para que promessas de banco em voo progridam. */
function tick(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Observa se uma promessa ja assentou, sem await-la. */
function watch<T>(promise: Promise<T>): { readonly done: boolean; promise: Promise<T> } {
  let done = false;
  promise.then(
    () => { done = true; },
    () => { done = true; },
  );
  return {
    get done() { return done; },
    promise,
  };
}

/** Medicoes da Task 8; gravadas so quando TASK8_MEASUREMENTS_OUT aponta um arquivo. */
const measurements: Array<Record<string, unknown>> = [];

/**
 * Semeia um Trabalho `variations` em draft com uma fonte pronta — o caminho
 * mais curto que `prepareCreativeWork` percorre ATE O FIM passando por
 * `generateSocialPostCopy`, que e onde o portao do modelo suspende.
 *
 * Nao usar `social_post` aqui: `projectPreparedPlanV1` devolve null para esse
 * protocolo por design (`prepared-plan.ts:100`), entao a preparacao terminaria
 * sempre em `invalid_preparation` e o cenario mediria um caminho de erro.
 * `variations` exige apenas `sources.length > 0`
 * (`creative-work-protocol-eligibility.ts:10`).
 */
async function createWork(scope: { userId: string; workspaceId: string; clientProfileId: string }): Promise<string> {
  const [work] = await db
    .insert(creativeWorkItems)
    .values({
      workspaceId: scope.workspaceId,
      clientProfileId: scope.clientProfileId,
      createdByUserId: scope.userId,
      title: "Caracterizacao T8",
      request: "Anunciar a promocao de primavera da loja com desconto de 20%",
      toolKind: "variations",
      status: "draft",
      format: "4:5",
      settings: { targetFormats: [] },
    })
    .returning();

  const [asset] = await db
    .insert(workspaceAssets)
    .values({
      workspaceId: scope.workspaceId,
      name: "base.png",
      key: `creative-work/${crypto.randomUUID()}/base.png`,
      type: "image/png",
      size: 2048,
      source: "upload",
    })
    .returning();

  await db.insert(creativeWorkSources).values({
    workspaceId: scope.workspaceId,
    workItemId: work.id,
    assetId: asset.id,
    usage: "both",
    usageConfirmed: true,
    status: "ready",
  });

  return work.id;
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
  const out = process.env.TASK8_MEASUREMENTS_OUT;
  if (out && measurements.length > 0) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(out, JSON.stringify(measurements, null, 2));
  }
  if (createdWorkspaceIds.length > 0) {
    await db
      .delete(creativeWorkPreparationAttempts)
      .where(inArray(creativeWorkPreparationAttempts.workspaceId, createdWorkspaceIds));
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

/**
 * Escritos na Task 8 para CARACTERIZAR o bug (o plano: "os testes caracterizam;
 * nao afirmam que o comportamento e correto"). A Task 15 corrigiu o bug e
 * inverteu os tres — que agora protegem a invariante nova. Os numeros medidos
 * antes da correcao ficam nos comentarios como registro historico; estao
 * tambem em docs/operations/reliability-metrics.md.
 *
 * Nenhuma asserção foi removida: cada uma passou a afirmar o oposto, que e
 * exatamente o que a correcao produz.
 */
describe.skipIf(!TEST_DB_EXPLICITLY_CONFIGURED)("PR-02/05 — preparacao sob concorrencia (Postgres real)", () => {
  beforeEach(() => {
    modelGate.reset();
  });

  it("caracteriza: duas preparacoes iguais do mesmo Trabalho", async () => {
    const scope = await createScope();
    const workItemId = await createWork(scope);

    const first = watch(prepareCreativeWork({ workspaceId: scope.workspaceId, workItemId }));
    await modelGate.waitForArrivals(1);

    const second = watch(prepareCreativeWork({ workspaceId: scope.workspaceId, workItemId }));
    await tick(150);

    // ANTES da Task 15 (medido 12/09): a segunda ficava PRESA no advisory lock
    // que a primeira segurava durante a chamada externa — nao assentava.
    // DEPOIS: ela assenta de imediato com preparation_in_progress, e continua
    // havendo UMA unica chamada ao provedor. O numero a bater nao mudou.
    const arrivalsEnquantoSuspenso = modelGate.arrivals;
    const segundaAssentouDurante = second.done;

    modelGate.releaseAll();
    const [a, b] = await Promise.all([first.promise, second.promise]);

    measurements.push({
      cenario: "duas preparacoes iguais",
      arrivalsEnquantoSuspenso,
      segundaAssentouDurante,
      arrivalsTotal: modelGate.arrivals,
      primeiro: a.ok ? "ok" : `erro:${a.error.code}`,
      segundo: b.ok ? "ok" : `erro:${b.error.code}`,
    });

    expect(arrivalsEnquantoSuspenso).toBe(1);
    expect(segundaAssentouDurante).toBe(true);
    expect(modelGate.arrivals).toBe(1);
    expect(a.ok).toBe(true);
  }, 30_000);

  it("caracteriza: escritor curto do MESMO Trabalho espera a resposta do modelo", async () => {
    const scope = await createScope();
    const workItemId = await createWork(scope);

    const preparing = watch(prepareCreativeWork({ workspaceId: scope.workspaceId, workItemId }));
    await modelGate.waitForArrivals(1);

    const startedAt = Date.now();
    const writer = watch(
      withCreativeWorkPreparationLock(scope.workspaceId, workItemId, async () => "entrou"),
    );
    await tick(200);

    // ANTES da Task 15: bloqueado por todo o tempo do provedor (227 ms medidos
    // em 12/09) — uma escrita curta, que nao depende de IA nenhuma, esperava o
    // modelo. DEPOIS: passa direto, porque a chamada externa saiu da transacao.
    const bloqueadoDurante = !writer.done;
    const esperaMedidaMs = Date.now() - startedAt;

    modelGate.releaseAll();
    await preparing.promise;
    await expect(writer.promise).resolves.toBe("entrou");

    measurements.push({
      cenario: "escritor curto — mesmo Trabalho",
      bloqueadoDurante,
      esperaMedidaAteAmostragemMs: esperaMedidaMs,
      esperaTotalMs: Date.now() - startedAt,
    });

    expect(bloqueadoDurante).toBe(false);
    expect(esperaMedidaMs).toBeLessThan(1_000);
  }, 30_000);

  it("caracteriza: escritor curto de Trabalho DIFERENTE nao espera", async () => {
    const scope = await createScope();
    const suspendedWorkId = await createWork(scope);
    const otherWorkId = await createWork(scope);

    const preparing = watch(prepareCreativeWork({ workspaceId: scope.workspaceId, workItemId: suspendedWorkId }));
    await modelGate.waitForArrivals(1);

    const startedAt = Date.now();
    const writer = await withCreativeWorkPreparationLock(
      scope.workspaceId,
      otherWorkId,
      async () => "entrou",
    );
    const esperaMs = Date.now() - startedAt;

    modelGate.releaseAll();
    await preparing.promise;

    measurements.push({ cenario: "escritor curto — Trabalho diferente", esperaMs });

    // O lock e por Trabalho: outro Trabalho passa direto. Isto delimita o dano
    // do bug e afasta a hipotese de um lock global.
    expect(writer).toBe("entrou");
    expect(esperaMs).toBeLessThan(1_000);
  }, 30_000);

  it("caracteriza: o mesmo Trabalho prende conexoes do pool enquanto o modelo responde", async () => {
    const scope = await createScope();
    const workItemId = await createWork(scope);

    const preparing = watch(prepareCreativeWork({ workspaceId: scope.workspaceId, workItemId }));
    await modelGate.waitForArrivals(1);

    // `withCreativeWorkPreparationLock` abre a transacao ANTES de pedir o
    // advisory lock, entao cada tentativa bloqueada ja segura uma conexao.
    // 5 e deliberadamente menor que o pool (max: 10 por processo): o objetivo
    // e medir o mecanismo, nao esgotar o pool e travar a propria suite.
    const CONCORRENTES = 5;
    const writers = Array.from({ length: CONCORRENTES }, () =>
      watch(withCreativeWorkPreparationLock(scope.workspaceId, workItemId, async () => "entrou")),
    );
    await tick(300);

    const presosDurante = writers.filter((w) => !w.done).length;

    modelGate.releaseAll();
    await preparing.promise;
    const resultados = await Promise.all(writers.map((w) => w.promise));

    measurements.push({
      cenario: "pressao de pool — mesmo Trabalho",
      concorrentes: CONCORRENTES,
      presosDurante,
      poolMaxPorProcesso: 10,
    });

    // ANTES da Task 15: 5 de 5 presos, cada um segurando a conexao que abriu
    // antes de pedir o lock — a pressao de pool que a spec inferia da ordem
    // `db.transaction -> pg_advisory_xact_lock`, medida em 12/09.
    // DEPOIS: nenhum preso. O lock nao e mais segurado durante a chamada.
    expect(presosDurante).toBe(0);
    expect(resultados).toEqual(Array(CONCORRENTES).fill("entrou"));
  }, 30_000);
});

describe.skipIf(!TEST_DB_EXPLICITLY_CONFIGURED)("PR-05 Task 15 — IA fora da transacao", () => {
  beforeEach(() => {
    modelGate.reset();
  });

  it("a edicao de fonte conclui ANTES da resposta do modelo ser liberada", async () => {
    const scope = await createScope();
    const workItemId = await createWork(scope);
    const [source] = await db
      .select()
      .from(creativeWorkSources)
      .where(eq(creativeWorkSources.workItemId, workItemId));
    const [work] = await db
      .select()
      .from(creativeWorkItems)
      .where(eq(creativeWorkItems.id, workItemId));

    const preparing = watch(prepareCreativeWork({ workspaceId: scope.workspaceId, workItemId }));
    await modelGate.waitForArrivals(1);

    // Hoje isto BLOQUEIA ate o modelo responder (medido na Task 8: 227 ms).
    // Depois da Task 15 precisa concluir enquanto o provedor segue suspenso.
    const startedAt = Date.now();
    const edited = await mutateCreativeWorkDraftSource({
      workspaceId: scope.workspaceId,
      workItemId,
      expectedUpdatedAt: work.updatedAt,
      sourceId: source.id,
      mutation: { kind: "update", patch: { usage: "content" } },
    });
    const edicaoMs = Date.now() - startedAt;
    expect(edited).not.toBeNull();

    modelGate.releaseAll();
    const result = await preparing.promise;

    measurements.push({ cenario: "Task 15 — edicao durante modelo suspenso", edicaoMs });

    // A edicao nao esperou o modelo...
    expect(edicaoMs).toBeLessThan(1_000);
    // ...e o resultado antigo NAO sobrescreveu a edicao.
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("stale_input");
  }, 30_000);

  it("duas requisicoes iguais compartilham UMA tentativa ativa", async () => {
    const scope = await createScope();
    const workItemId = await createWork(scope);

    const first = watch(prepareCreativeWork({ workspaceId: scope.workspaceId, workItemId }));
    // Segurar a primeira DENTRO da chamada externa e o que da dentes a este
    // teste: sem isso as duas serializam, a segunda encontra a preparacao ja
    // concluida e o resultado nao distingue "compartilhou tentativa" de
    // "rodou depois". Verificado pelo passo vermelho.
    await modelGate.waitForArrivals(1);

    const second = await prepareCreativeWork({ workspaceId: scope.workspaceId, workItemId });

    const durante = await db
      .select()
      .from(creativeWorkPreparationAttempts)
      .where(eq(creativeWorkPreparationAttempts.workItemId, workItemId));

    modelGate.releaseAll();
    await first.promise;

    // Uma tentativa, e a segunda requisicao devolveu estado tipado em vez de
    // criar outra. O numero a bater e 1 chamada ao provedor — o mesmo de hoje,
    // medido na Task 8.
    expect(durante.filter((row) => row.state === "running")).toHaveLength(1);
    expect(modelGate.arrivals).toBe(1);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe("preparation_in_progress");
  }, 30_000);

  it("conclusao atrasada de tentativa invalidada nao persiste resultado antigo", async () => {
    const scope = await createScope();
    const workItemId = await createWork(scope);

    const preparing = watch(prepareCreativeWork({ workspaceId: scope.workspaceId, workItemId }));
    await modelGate.waitForArrivals(1);

    // Invalida a tentativa enquanto o modelo ainda responde.
    expect(await invalidatePreparationAttempts({ workspaceId: scope.workspaceId, workItemId })).toBe(1);

    modelGate.releaseAll();
    const result = await preparing.promise;

    expect(result.ok).toBe(false);
    const [work] = await db
      .select()
      .from(creativeWorkItems)
      .where(eq(creativeWorkItems.id, workItemId));
    // Nada do resultado antigo foi persistido.
    expect(work.copy).toBeNull();
  }, 30_000);

  it("o tempo suspenso no provedor nao aparece como transacao aberta", async () => {
    const scope = await createScope();
    const workItemId = await createWork(scope);

    const preparing = watch(prepareCreativeWork({ workspaceId: scope.workspaceId, workItemId }));
    await modelGate.waitForArrivals(1);

    // O mesmo probe da Task 8, onde antes media 227 ms de bloqueio.
    const startedAt = Date.now();
    await withCreativeWorkPreparationLock(scope.workspaceId, workItemId, async () => "entrou");
    const esperaMs = Date.now() - startedAt;

    modelGate.releaseAll();
    await preparing.promise;

    measurements.push({ cenario: "Task 15 — lock livre durante modelo", esperaMs });
    expect(esperaMs).toBeLessThan(1_000);
  }, 30_000);
});
