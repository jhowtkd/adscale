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

vi.mock("@/server/storage", () => ({
  objectStorage: {
    head: vi.fn(async () => ({ contentLength: 1024 })),
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

    const [first, second] = await Promise.all([
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
