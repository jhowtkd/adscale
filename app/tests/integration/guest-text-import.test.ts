/**
 * #443 — importação textual canônica contra Postgres REAL (adscale_test).
 * Primeiro teste do fluxo visitante sem mocks de repositório/db: importa os
 * módulos de produção e prova, consultando creative_work_items no banco:
 *
 *  1. Repetir a criação com o mesmo draftKey retorna o MESMO registro (1 linha).
 *  2. Outro usuário/workspace com o mesmo draftKey recebe OUTRO registro; a
 *     leitura escopada por (workspace, usuário, chave) não vaza linhas alheias.
 *  3. Núcleo + portas de banco: resposta perdida, depois `verified`, com uma
 *     linha, texto intacto e formatos de `format_adaptation` persistidos.
 *  4. Marca divergente é bloqueada pelo núcleo (`work_context_mismatch`), sem
 *     nova linha — o registro existente mantém a marca original.
 *
 * Recibo em memória: a persistência do recibo/lease é contrato dos testes de
 * domínio e das nativas da #446; aqui o que se prova é transacional.
 * Fixtures próprias, nunca dados/IDs do workspace de produção.
 *
 * Requer banco de teste migrado:
 *   DATABASE_URL=postgres://test:test@localhost:5433/adscale_test npm test -- tests/integration/guest-text-import.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";

// Suíte exclusiva de Postgres real: só roda quando a URL do banco de teste é
// passada explicitamente (contrato documentado acima). No `npm test` padrão
// ela é pulada — uma execução explícita com DB inacessível continua FALHANDO
// no beforeAll, nunca passando em silêncio.
const TEST_DB_EXPLICITLY_CONFIGURED = Boolean(
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL,
);

import { db } from "@/server/db";
import {
  clientProfiles,
  creativeWorkItems,
  user,
  workspaces,
} from "@/server/db/schema";
import { createCreativeWorkDraft } from "@/server/repositories/creative-work";
import { deriveCreativeWorkTitle } from "@/server/creative-work/prepare";
import { createDraft } from "@/components/guest-home/guest-core.mjs";
import { ensureCanonicalGuestDraft } from "@/lib/guest-home/import-text";
import type {
  CanonicalDraft,
  GuestImportReceipt,
  ImportContext,
  TextImportPorts,
} from "@/lib/guest-home/import-contracts";

const RUN_ID = `g443-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

let scopeSeq = 0;
const createdWorkspaceIds: string[] = [];
const createdUserIds: string[] = [];

interface TestScope {
  tag: string;
  userId: string;
  workspaceId: string;
  clientProfileId: string;
}

/**
 * Semeia a cadeia mínima de FK para a criação canônica: user → workspace →
 * client profile. IDs únicos por execução; afterAll remove APENAS essas linhas.
 */
async function createScope(): Promise<TestScope> {
  scopeSeq += 1;
  const tag = `${RUN_ID}-${scopeSeq}`;
  const userId = `user-${tag}`;
  await db.insert(user).values({
    id: userId,
    name: "Guest Import Integration",
    email: `${tag}@example.com`,
    emailVerified: true,
  });
  const [workspace] = await db
    .insert(workspaces)
    .values({ name: `Guest Import ${tag}`, slug: tag })
    .returning();
  const [profile] = await db
    .insert(clientProfiles)
    .values({ workspaceId: workspace.id, name: `Profile ${tag}` })
    .returning();
  createdUserIds.push(userId);
  createdWorkspaceIds.push(workspace.id);
  return { tag, userId, workspaceId: workspace.id, clientProfileId: profile.id };
}

async function countDraftKeyRows(workspaceId: string, userId: string, draftKey: string): Promise<number> {
  const rows = await db
    .select({ id: creativeWorkItems.id })
    .from(creativeWorkItems)
    .where(and(
      eq(creativeWorkItems.workspaceId, workspaceId),
      eq(creativeWorkItems.createdByUserId, userId),
      eq(creativeWorkItems.draftKey, draftKey),
    ));
  return rows.length;
}

function toCanonical(row: typeof creativeWorkItems.$inferSelect): CanonicalDraft {
  return {
    userId: row.createdByUserId,
    workspaceId: row.workspaceId,
    clientProfileId: row.clientProfileId,
    id: row.id,
    draftKey: row.draftKey,
    request: row.request,
    intent: row.toolKind,
  };
}

interface DbPortsControl {
  loseNextResponse: boolean;
}

/** Portas reais de banco + recibo em memória (o recibo não é o objeto deste teste). */
function dbPorts(
  scope: TestScope,
  context: ImportContext,
  receipt: GuestImportReceipt,
  control: DbPortsControl,
): TextImportPorts {
  return {
    loadReceipt: async () => structuredClone(receipt),
    saveReceipt: async (next) => {
      receipt.workId = next.workId;
      receipt.phase = next.phase;
      receipt.revision = next.revision;
    },
    createDraft: async (input) => {
      const row = await createCreativeWorkDraft({
        workspaceId: scope.workspaceId,
        clientProfileId: input.clientProfileId,
        createdByUserId: scope.userId,
        draftKey: input.draftKey,
        intent: input.intent,
        title: deriveCreativeWorkTitle(input.request),
        request: input.request,
        format: input.format,
        settings: input.settings,
        brief: null,
      });
      if (!row) throw new Error("client_profile_not_found");
      if (control.loseNextResponse) {
        control.loseNextResponse = false;
        throw new Error("network");
      }
      return toCanonical(row);
    },
    readWork: async (id) => {
      const [row] = await db
        .select()
        .from(creativeWorkItems)
        .where(and(
          eq(creativeWorkItems.id, id),
          eq(creativeWorkItems.workspaceId, scope.workspaceId),
        ))
        .limit(1);
      if (!row) throw new Error("not_found");
      return toCanonical(row);
    },
  };
}

function claimedReceipt(draftId: string, context: ImportContext, expiresAt: number): GuestImportReceipt {
  return {
    ...context,
    guestDraftId: draftId,
    workId: null,
    phase: "claimed",
    references: [],
    expiresAt,
    revision: 1,
    leaseOwner: "integration-owner",
    leaseExpiresAt: Date.now() + 120_000,
  };
}

beforeAll(async () => {
  try {
    await db.execute(sql`select 1`);
  } catch (err) {
    throw new Error(
      `[guest-text-import] Postgres de teste INACESSÍVEL (DATABASE_URL=${
        process.env.DATABASE_URL ?? "(não definida)"
      }). Suba um banco de teste migrado antes de rodar este teste. ` +
        `Causa: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const indexCheck = await db.execute(sql`
    select indexname from pg_indexes
    where schemaname = 'adscale_app'
      and indexname = 'creative_work_items_draft_key_uq'
  `);
  if (indexCheck.rows.length === 0) {
    throw new Error(
      "[guest-text-import] índice creative_work_items_draft_key_uq AUSENTE no banco de teste.",
    );
  }
}, 30_000);

afterAll(async () => {
  // Ordem reversa das FKs; escopo restrito às linhas criadas por ESTA suíte.
  if (createdWorkspaceIds.length > 0) {
    await db.delete(creativeWorkItems).where(inArray(creativeWorkItems.workspaceId, createdWorkspaceIds));
    await db.delete(clientProfiles).where(inArray(clientProfiles.workspaceId, createdWorkspaceIds));
    await db.delete(workspaces).where(inArray(workspaces.id, createdWorkspaceIds));
  }
  if (createdUserIds.length > 0) {
    await db.delete(user).where(inArray(user.id, createdUserIds));
  }
});

describe.skipIf(!TEST_DB_EXPLICITLY_CONFIGURED)("guest text import (Postgres real)", () => {
  it("repetir a criação com o mesmo draftKey retorna o mesmo registro", async () => {
    const scope = await createScope();
    const draftKey = crypto.randomUUID();
    const input = {
      workspaceId: scope.workspaceId,
      clientProfileId: scope.clientProfileId,
      createdByUserId: scope.userId,
      draftKey,
      intent: "single" as const,
      title: "Peça de lançamento",
      request: "Uma peça de lançamento",
      format: "4:5" as const,
      settings: { targetFormats: [] as Array<"1:1" | "9:16"> },
      brief: null,
    };
    const first = await createCreativeWorkDraft(input);
    const second = await createCreativeWorkDraft(input);
    expect(first?.id).toBeTruthy();
    expect(second?.id).toBe(first?.id);
    expect(await countDraftKeyRows(scope.workspaceId, scope.userId, draftKey)).toBe(1);
  });

  it("outro usuário/workspace não recebe registro alheio", async () => {
    const scopeA = await createScope();
    const scopeB = await createScope();
    const draftKey = crypto.randomUUID();
    const base = {
      draftKey,
      intent: "single" as const,
      title: "Peça",
      request: "Uma peça",
      format: "4:5" as const,
      settings: { targetFormats: [] as Array<"1:1" | "9:16"> },
      brief: null,
    };
    const rowA = await createCreativeWorkDraft({
      ...base,
      workspaceId: scopeA.workspaceId,
      clientProfileId: scopeA.clientProfileId,
      createdByUserId: scopeA.userId,
    });
    const rowB = await createCreativeWorkDraft({
      ...base,
      workspaceId: scopeB.workspaceId,
      clientProfileId: scopeB.clientProfileId,
      createdByUserId: scopeB.userId,
    });
    expect(rowA?.id).toBeTruthy();
    expect(rowB?.id).toBeTruthy();
    expect(rowB?.id).not.toBe(rowA?.id);
    // Leitura escopada: cada contexto enxerga só a própria linha.
    const [scoped] = await db
      .select()
      .from(creativeWorkItems)
      .where(and(
        eq(creativeWorkItems.workspaceId, scopeA.workspaceId),
        eq(creativeWorkItems.createdByUserId, scopeA.userId),
        eq(creativeWorkItems.draftKey, draftKey),
      ));
    expect(scoped.id).toBe(rowA?.id);
    // ... e nada sob o outro workspace.
    const foreign = await db
      .select({ id: creativeWorkItems.id })
      .from(creativeWorkItems)
      .where(and(
        eq(creativeWorkItems.id, rowA!.id),
        eq(creativeWorkItems.workspaceId, scopeB.workspaceId),
      ));
    expect(foreign).toHaveLength(0);
  });

  it("núcleo + banco: resposta perdida, depois verified, com texto intacto", async () => {
    const scope = await createScope();
    const context: ImportContext = {
      userId: scope.userId,
      workspaceId: scope.workspaceId,
      clientProfileId: scope.clientProfileId,
    };
    const draft = createDraft(
      { request: "Adapte minha peça para feed e stories", intent: "format_adaptation", files: [] },
      crypto.randomUUID(),
    );
    const receipt = claimedReceipt(draft.id, context, draft.expiresAt);
    const control: DbPortsControl = { loseNextResponse: true };
    const ports = dbPorts(scope, context, receipt, control);

    const first = await ensureCanonicalGuestDraft({ draft, context }, ports);
    expect(first.kind).toBe("blocked");
    const second = await ensureCanonicalGuestDraft({ draft, context }, ports);
    expect(second.kind).toBe("verified");
    if (second.kind !== "verified") throw new Error("unreachable");

    expect(await countDraftKeyRows(scope.workspaceId, scope.userId, draft.id)).toBe(1);
    const [row] = await db
      .select()
      .from(creativeWorkItems)
      .where(eq(creativeWorkItems.id, second.workId));
    expect(row.request).toBe("Adapte minha peça para feed e stories");
    expect(row.toolKind).toBe("format_adaptation");
    expect(row.settings.targetFormats).toEqual(["1:1", "9:16"]);
    expect(row.format).toBe("4:5");
  });

  it("marca divergente é bloqueada sem nova linha", async () => {
    const scope = await createScope();
    const [otherProfile] = await db
      .insert(clientProfiles)
      .values({ workspaceId: scope.workspaceId, name: `Other ${scope.tag}` })
      .returning();
    const draftKey = crypto.randomUUID();
    const seeded = await createCreativeWorkDraft({
      workspaceId: scope.workspaceId,
      clientProfileId: scope.clientProfileId,
      createdByUserId: scope.userId,
      draftKey,
      intent: "single",
      title: "Peça da marca original",
      request: "Peça da marca original",
      format: "4:5",
      settings: { targetFormats: [] },
      brief: null,
    });
    expect(seeded?.id).toBeTruthy();

    const draft = createDraft(
      { request: "Peça da marca original", intent: "single", files: [] },
      draftKey,
    );
    // Recibo vinculado à OUTRA marca; o registro existente é da marca original.
    const context: ImportContext = {
      userId: scope.userId,
      workspaceId: scope.workspaceId,
      clientProfileId: otherProfile.id,
    };
    const receipt = claimedReceipt(draft.id, context, draft.expiresAt);
    const ports = dbPorts(scope, context, receipt, { loseNextResponse: false });
    const outcome = await ensureCanonicalGuestDraft({ draft, context }, ports);
    expect(outcome).toEqual({ kind: "blocked", code: "work_context_mismatch" });
    expect(await countDraftKeyRows(scope.workspaceId, scope.userId, draftKey)).toBe(1);
    const [row] = await db
      .select()
      .from(creativeWorkItems)
      .where(eq(creativeWorkItems.id, seeded!.id));
    expect(row.clientProfileId).toBe(scope.clientProfileId);
  });
});
