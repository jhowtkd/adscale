import { beforeAll, describe, expect, it } from "vitest";
import type {
  EquipeRepositories,
  EquipeUnitOfWork,
  InternalEquipeRepositories,
} from "./repositories";
import {
  EquipeConflictError,
  EquipeNotFoundError,
  type AccountScope,
} from "./types";

// Suíte de contrato dos repositórios da Equipe: roda idêntica contra a
// implementação em memória (memory.test.ts, sem banco) e contra Postgres
// (postgres.pg.test.ts, no CI). Cobra escopo, unicidade, erros,
// imutabilidade por ausência de método, idempotência, lease e atomicidade.
export type EquipeContractHarness = {
  uow: EquipeUnitOfWork;
  scope: AccountScope;
  otherScope: AccountScope;
  createScope: () => Promise<AccountScope>;
};

export function defineEquipeRepositoryContract(
  label: string,
  setup: () => Promise<EquipeContractHarness>,
  teardown?: (harness: EquipeContractHarness) => Promise<void>,
  opts: { enabled?: boolean } = {}
): void {
  const enabled = opts.enabled ?? true;
  describe.skipIf(!enabled)(`repositórios da Equipe (${label})`, () => {
    let harness: EquipeContractHarness;
    let repos: EquipeRepositories;
    let internal: InternalEquipeRepositories;
    let scope: AccountScope;
    let otherScope: AccountScope;

    beforeAll(async () => {
      harness = await setup();
      repos = harness.uow.repos;
      internal = harness.uow.internal;
      scope = harness.scope;
      otherScope = harness.otherScope;
      return async () => {
        await teardown?.(harness);
      };
    });

    async function newFrontId(target: AccountScope = scope): Promise<string> {
      const front = await repos.fronts.create(target, {
        key: target === scope ? "social_instagram" : "midia_paga",
      });
      return front.id;
    }

    async function newItemId(target: AccountScope = scope): Promise<string> {
      const front = await repos.fronts.create(target, {
        key: `social_instagram`,
      }).catch(async () => {
        const existing = await repos.fronts.list(target);
        const found = existing.find((row) => row.key === "social_instagram");
        if (!found) throw new Error("equipe_contract_without_front");
        return found;
      });
      const item = await repos.items.create(target, { frontId: front.id });
      return item.id;
    }

    it("contas: cria, lê, lista por workspace e atualiza", async () => {
      const fresh = await harness.createScope();
      const account = await repos.accounts.get(fresh.workspaceId, fresh.accountId);
      expect(account?.status).toBe("deploying");
      const byProfile = await repos.accounts.findByClientProfile(
        fresh.workspaceId,
        account?.clientProfileId as string
      );
      expect(byProfile?.id).toBe(fresh.accountId);
      const listed = await repos.accounts.list(fresh.workspaceId);
      expect(listed.map((row) => row.id)).toContain(fresh.accountId);
      const updated = await repos.accounts.update(fresh.workspaceId, fresh.accountId, {
        status: "active",
      });
      expect(updated.status).toBe("active");
      expect(await repos.accounts.get(otherScope.workspaceId, fresh.accountId)).toBeNull();
      await expect(
        repos.accounts.update(fresh.workspaceId, crypto.randomUUID(), { status: "active" })
      ).rejects.toBeInstanceOf(EquipeNotFoundError);
    });

    it("contas: (workspace, marca) duplicado conflita", async () => {
      const fresh = await harness.createScope();
      const account = await repos.accounts.get(fresh.workspaceId, fresh.accountId);
      await expect(
        repos.accounts.create(fresh.workspaceId, {
          clientProfileId: account?.clientProfileId as string,
        })
      ).rejects.toBeInstanceOf(EquipeConflictError);
    });

    it("escopo: fora da conta, get retorna null e update lança NotFound", async () => {
      const front = await repos.fronts.create(scope, { key: "midia_paga" });
      expect(await repos.fronts.get(otherScope, front.id)).toBeNull();
      expect(await repos.fronts.list(otherScope)).not.toContainEqual(
        expect.objectContaining({ id: front.id })
      );
      await expect(repos.fronts.update(otherScope, front.id, { status: "paused" })).rejects
        .toBeInstanceOf(EquipeNotFoundError);
    });

    it("frentes: (conta, chave) duplicada conflita", async () => {
      const fresh = await harness.createScope();
      await repos.fronts.create(fresh, { key: "social_instagram" });
      await expect(repos.fronts.create(fresh, { key: "social_instagram" })).rejects
        .toBeInstanceOf(EquipeConflictError);
    });

    it("implantação, contexto, plano, mandato e ideias: ciclo básico", async () => {
      const step = await repos.onboarding.create(scope, { step: "scope_confirm" });
      expect(step.status).toBe("pending");
      expect((await repos.onboarding.update(scope, step.id, { status: "done" })).status).toBe(
        "done"
      );
      const context = await repos.contexts.create(scope, {
        section: "oferta",
        version: 1,
        fields: { preco: { status: "unknown" } },
      });
      expect((await repos.contexts.get(scope, context.id))?.version).toBe(1);
      const plan = await repos.plans.create(scope, { version: 1 });
      expect((await repos.plans.update(scope, plan.id, { status: "approved" })).status).toBe(
        "approved"
      );
      const mandate = await repos.mandates.create(scope, { version: 1, shadow: true });
      expect(mandate.shadow).toBe(true);
      const idea = await repos.ideas.create(scope, { kind: "plan_change", payload: {} });
      expect((await repos.ideas.get(scope, idea.id))?.status).toBe("proposed");
    });

    it("lotes e itens: cria, filtra e atualiza", async () => {
      const frontId = await newFrontId();
      const batch = await repos.batches.create(scope, {
        frontId,
        title: "Lote 1",
        approveByAt: new Date("2026-10-01T12:00:00.000Z"),
      });
      const item = await repos.items.create(scope, {
        frontId,
        batchId: batch.id,
        status: "in_production",
      });
      expect((await repos.items.get(scope, item.id))?.batchId).toBe(batch.id);
      const produced = await repos.items.list(scope, { status: "in_production" });
      expect(produced.map((row) => row.id)).toContain(item.id);
      expect(await repos.items.list(scope, { status: "published" })).not.toContainEqual(
        expect.objectContaining({ id: item.id })
      );
      const byBatch = await repos.items.list(scope, { batchId: batch.id });
      expect(byBatch.map((row) => row.id)).toContain(item.id);
      expect((await repos.items.update(scope, item.id, { status: "approved" })).status).toBe(
        "approved"
      );
    });

    it("versões: imutáveis por interface e únicas por (item, hash)", async () => {
      expect("update" in repos.itemVersions).toBe(false);
      expect("delete" in repos.itemVersions).toBe(false);
      const itemId = await newItemId();
      const version = await repos.itemVersions.create(scope, {
        itemId,
        versionHash: "hash-1",
        caption: "Legenda",
        authorRole: "agent",
      });
      expect((await repos.itemVersions.getByHash(scope, itemId, "hash-1"))?.id).toBe(version.id);
      expect(await repos.itemVersions.list(scope, { itemId })).toHaveLength(1);
      await expect(
        repos.itemVersions.create(scope, { itemId, versionHash: "hash-1", authorRole: "agent" })
      ).rejects.toBeInstanceOf(EquipeConflictError);
    });

    it("recibos: imutáveis por interface e listáveis por objeto", async () => {
      expect("update" in repos.receipts).toBe(false);
      expect("delete" in repos.receipts).toBe(false);
      const itemId = await newItemId();
      const receipt = await repos.receipts.create(scope, {
        personKind: "client_person",
        personRole: "approver",
        objectType: "item",
        objectId: itemId,
        objectVersion: "hash-1",
        action: "approve",
      });
      expect((await repos.receipts.get(scope, receipt.id))?.action).toBe("approve");
      const byObject = await repos.receipts.listByObject(scope, "item", itemId);
      expect(byObject.map((row) => row.id)).toContain(receipt.id);
    });

    it("calibração: rodada e notas por tentativa", async () => {
      expect("update" in repos.calibrationScores).toBe(false);
      const fresh = await harness.createScope();
      const front = await repos.fronts.create(fresh, { key: "social_instagram" });
      const round = await repos.calibrationRounds.create(fresh, {
        frontId: front.id,
        sequence: 1,
      });
      const itemId = await newItemId(fresh);
      const score = await repos.calibrationScores.create(fresh, {
        roundId: round.id,
        itemId,
        versionHash: "hash-1",
        verdict: "pass",
      });
      expect((await repos.calibrationScores.get(fresh, score.id))?.verdict).toBe("pass");
      await expect(
        repos.calibrationScores.create(fresh, {
          roundId: round.id,
          itemId,
          versionHash: "hash-1",
          verdict: "fail",
        })
      ).rejects.toBeInstanceOf(EquipeConflictError);
      expect((await repos.calibrationRounds.update(fresh, round.id, { status: "closed" })).status)
        .toBe("closed");
    });

    it("escalonamentos, exceções e pausas: ciclo básico", async () => {
      const escalation = await repos.escalations.create(scope, {
        kind: "conteudo",
        severity: "high",
        ownerRole: "quality",
      });
      expect(
        (await repos.escalations.update(scope, escalation.id, { status: "resolved" })).status
      ).toBe("resolved");
      const exception = await repos.exceptions.create(scope, { trigger: "sem_material" });
      expect(exception.ownerRole).toBe("account_manager");
      const pause = await repos.pauses.create(scope, {
        level: "publishing",
        scope: "account",
        origin: "client_request",
        resumableBy: "approver",
      });
      expect((await repos.pauses.get(scope, pause.id))?.status).toBe("active");
    });

    it("conexões e conversas: unicidade por conta", async () => {
      const fresh = await harness.createScope();
      const connection = await repos.connections.create(fresh, {
        encryptedToken: "v1:cifrado",
      });
      expect(connection.provider).toBe("instagram");
      await expect(repos.connections.create(fresh, { encryptedToken: "v1:outro" })).rejects
        .toBeInstanceOf(EquipeConflictError);
      await repos.threads.create(fresh, { kind: "primary", topic: "operacao" });
      await expect(repos.threads.create(fresh, { kind: "primary" })).rejects.toBeInstanceOf(
        EquipeConflictError
      );
      const parallel = await repos.threads.create(fresh, { kind: "parallel", topic: "duvida" });
      expect(parallel.kind).toBe("parallel");
    });

    it("eventos: append-only, ordenados e filtráveis", async () => {
      expect("update" in repos.events).toBe(false);
      expect("delete" in repos.events).toBe(false);
      const fresh = await harness.createScope();
      const itemId = await newItemId(fresh);
      await repos.events.create(fresh, {
        actorType: "agent",
        eventType: "item.created",
        objectType: "item",
        objectId: itemId,
        occurredAt: new Date("2026-09-01T10:00:00.000Z"),
      });
      await repos.events.create(fresh, {
        actorType: "client_person",
        actorRole: "approver",
        eventType: "item.approved",
        objectType: "item",
        objectId: itemId,
        occurredAt: new Date("2026-09-01T11:00:00.000Z"),
      });
      const all = await repos.events.list(fresh);
      expect(all.map((row) => row.eventType)).toEqual(["item.created", "item.approved"]);
      const filtered = await repos.events.list(fresh, { objectType: "item", objectId: itemId });
      expect(filtered).toHaveLength(2);
      expect(await repos.events.list(fresh, { eventType: "item.created" })).toHaveLength(1);
    });

    it("intenções: insert idempotente por (item, hash)", async () => {
      const itemId = await newItemId();
      const first = await repos.intents.insertOrGet(scope, {
        itemId,
        versionHash: "hash-1",
        scheduledFor: new Date("2026-09-01T12:00:00.000Z"),
      });
      expect(first.created).toBe(true);
      const second = await repos.intents.insertOrGet(scope, {
        itemId,
        versionHash: "hash-1",
        scheduledFor: new Date("2026-09-01T12:00:00.000Z"),
      });
      expect(second.created).toBe(false);
      expect(second.intent.id).toBe(first.intent.id);
      expect(
        (await repos.intents.getByItemVersion(scope, itemId, "hash-1"))?.id
      ).toBe(first.intent.id);
      const pending = await repos.intents.list(scope, { status: "pending" });
      expect(pending.map((row) => row.id)).toContain(first.intent.id);
    });

    it("claim: só intenção vencida sem lease; lease ativo não é retomado", async () => {
      expect("claimDueIntents" in repos).toBe(false);
      const fresh = await harness.createScope();
      const now = new Date("2026-09-01T12:00:00.000Z");
      const dueItem = await newItemId(fresh);
      const futureItem = await newItemId(fresh);
      const { intent: due } = await repos.intents.insertOrGet(fresh, {
        itemId: dueItem,
        versionHash: "hash-due",
        scheduledFor: new Date("2026-09-01T11:00:00.000Z"),
      });
      await repos.intents.insertOrGet(fresh, {
        itemId: futureItem,
        versionHash: "hash-future",
        scheduledFor: new Date("2026-09-02T11:00:00.000Z"),
      });
      const claimed = await internal.claimDueIntents({ owner: "despachante-1", now, limit: 10 });
      const mine = claimed.find((row) => row.id === due.id);
      expect(mine?.leaseOwner).toBe("despachante-1");
      expect(mine?.status).toBe("sending");
      expect(mine?.attempts).toBe(1);
      // Diferença em vez de valor absoluto: timestamp sem tz desloca igual
      // nos dois campos conforme o fuso do banco (11:00 → 12:05 = 65 min).
      expect((mine?.leaseExpiresAt?.getTime() as number) - due.scheduledFor.getTime()).toBe(
        65 * 60 * 1000
      );
      expect(claimed.some((row) => row.itemId === futureItem)).toBe(false);
      // Lease ativo: segundo despachante não retoma.
      const reclaimed = await internal.claimDueIntents({ owner: "despachante-2", now });
      expect(reclaimed.some((row) => row.id === due.id)).toBe(false);
      // Lease expirado: outro despachante retoma.
      const later = new Date(now.getTime() + 6 * 60 * 1000);
      const expired = await internal.claimDueIntents({ owner: "despachante-2", now: later });
      const resumed = expired.find((row) => row.id === due.id);
      expect(resumed?.leaseOwner).toBe("despachante-2");
      expect(resumed?.attempts).toBe(2);
    });

    it("transação: estado + evento + intenção confirmam juntos", async () => {
      const fresh = await harness.createScope();
      const front = await repos.fronts.create(fresh, { key: "social_instagram" });
      const created = await harness.uow.run(async (tx) => {
        const item = await tx.items.create(fresh, { frontId: front.id });
        await tx.events.create(fresh, {
          actorType: "agent",
          eventType: "item.created",
          objectType: "item",
          objectId: item.id,
        });
        const { intent } = await tx.intents.insertOrGet(fresh, {
          itemId: item.id,
          versionHash: "hash-1",
          scheduledFor: new Date("2026-09-01T12:00:00.000Z"),
        });
        // Leitura dentro da transação enxerga a própria escrita.
        expect((await tx.items.get(fresh, item.id))?.id).toBe(item.id);
        return { itemId: item.id, intentId: intent.id };
      });
      expect((await repos.items.get(fresh, created.itemId))?.id).toBe(created.itemId);
      expect((await repos.intents.get(fresh, created.intentId))?.id).toBe(created.intentId);
      expect(await repos.events.list(fresh, { objectId: created.itemId })).toHaveLength(1);
    });

    it("transação: erro desfaz estado + evento + intenção", async () => {
      const fresh = await harness.createScope();
      const front = await repos.fronts.create(fresh, { key: "social_instagram" });
      let itemId = "";
      await expect(
        harness.uow.run(async (tx) => {
          const item = await tx.items.create(fresh, { frontId: front.id });
          itemId = item.id;
          await tx.events.create(fresh, {
            actorType: "agent",
            eventType: "item.created",
            objectType: "item",
            objectId: item.id,
          });
          await tx.intents.insertOrGet(fresh, {
            itemId: item.id,
            versionHash: "hash-1",
            scheduledFor: new Date("2026-09-01T12:00:00.000Z"),
          });
          throw new Error("falha_proposital");
        })
      ).rejects.toThrow("falha_proposital");
      expect(await repos.items.get(fresh, itemId)).toBeNull();
      expect(await repos.intents.getByItemVersion(fresh, itemId, "hash-1")).toBeNull();
      expect(await repos.events.list(fresh, { objectId: itemId })).toHaveLength(0);
    });

    it("lado interno: staff global e contas por estado entre workspaces", async () => {
      const member = await internal.staff.create({
        role: "quality",
        displayName: "Qualidade",
      });
      expect((await internal.staff.get(member.id))?.role).toBe("quality");
      expect(
        (await internal.staff.list({ role: "quality" })).map((row) => row.id)
      ).toContain(member.id);
      expect((await internal.staff.update(member.id, { active: false })).active).toBe(false);
      const fresh = await harness.createScope();
      await repos.accounts.update(fresh.workspaceId, fresh.accountId, { status: "active" });
      const actives = await internal.listAccountsByStatus("active");
      expect(actives.map((row) => row.id)).toContain(fresh.accountId);
      expect(actives.every((row) => row.status === "active")).toBe(true);
    });
  });
}
