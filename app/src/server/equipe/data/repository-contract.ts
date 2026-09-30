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
        status: "adjusting",
        destination: "instagram:@brand",
      });
      expect((await repos.items.get(scope, item.id))?.batchId).toBe(batch.id);
      expect((await repos.items.get(scope, item.id))?.destination).toBe("instagram:@brand");
      const produced = await repos.items.list(scope, { status: "adjusting" });
      expect(produced.map((row) => row.id)).toContain(item.id);
      expect(await repos.items.list(scope, { status: "published" })).not.toContainEqual(
        expect.objectContaining({ id: item.id })
      );
      const byBatch = await repos.items.list(scope, { batchId: batch.id });
      expect(byBatch.map((row) => row.id)).toContain(item.id);
      expect(
        (await repos.items.update(scope, item.id, { status: "available_for_download" })).status
      ).toBe("available_for_download");
      expect((await repos.items.get(scope, item.id))?.destination).toBe("instagram:@brand");
    });

    it("versões: imutáveis por interface e únicas por (item, hash)", async () => {
      expect("update" in repos.itemVersions).toBe(false);
      expect("delete" in repos.itemVersions).toBe(false);
      const itemId = await newItemId();
      const version = await repos.itemVersions.create(scope, {
        itemId,
        versionHash: "hash-1",
        caption: "Legenda",
        destination: "instagram:@brand",
        authorRole: "agent",
      });
      expect((await repos.itemVersions.getByHash(scope, itemId, "hash-1"))?.id).toBe(version.id);
      expect((await repos.itemVersions.getByHash(scope, itemId, "hash-1"))?.destination).toBe(
        "instagram:@brand"
      );
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

    it("impede duas decisões de aprovação para o mesmo item e hash, sem limitar outros recibos", async () => {
      const itemId = await newItemId();
      const approval = {
        personKind: "client_person" as const,
        personRole: "approver",
        objectType: "item" as const,
        objectId: itemId,
        objectVersion: "decision-hash",
      };
      await repos.receipts.create(scope, { ...approval, action: "approve_item" });
      await expect(
        repos.receipts.create(scope, { ...approval, action: "approve_batch" })
      ).rejects.toBeInstanceOf(EquipeConflictError);
      await expect(
        repos.receipts.create(scope, { ...approval, action: "choose_piece" })
      ).rejects.toBeInstanceOf(EquipeConflictError);
      const other = await repos.receipts.create(scope, { ...approval, action: "decline_publish" });
      expect((await repos.receipts.listByObject(scope, "item", itemId)).map((row) => row.action))
        .toEqual(expect.arrayContaining(["approve_item", "decline_publish"]));
      expect(other.objectVersion).toBe("decision-hash");
    });

    it("calibração: rodada e notas por tentativa", async () => {
      expect("update" in repos.calibrationScores).toBe(false);
      const fresh = await harness.createScope();
      const front = await repos.fronts.create(fresh, { key: "social_instagram" });
      const batch = await repos.batches.create(fresh, { frontId: front.id, title: "Lote 1" });
      const round = await repos.calibrationRounds.create(fresh, {
        frontId: front.id,
        batchId: batch.id,
        weekKey: "2026-W41",
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
      // Uma rodada por semana por frente: a mesma semana conflita, outra passa.
      await expect(
        repos.calibrationRounds.create(fresh, {
          frontId: front.id,
          batchId: batch.id,
          weekKey: "2026-W41",
          sequence: 2,
        })
      ).rejects.toBeInstanceOf(EquipeConflictError);
      const nextWeek = await repos.calibrationRounds.create(fresh, {
        frontId: front.id,
        batchId: batch.id,
        weekKey: "2026-W42",
        sequence: 2,
      });
      expect(nextWeek.sequence).toBe(2);
      expect((await repos.calibrationRounds.update(fresh, round.id, { status: "closed" })).status)
        .toBe("closed");
      // Varredura interna entre contas: a pipeline de qualidade agrupa por estado.
      const open = await internal.listCalibrationRounds({ status: "open" });
      expect(open.map((row) => row.id)).toContain(nextWeek.id);
      expect(open.map((row) => row.id)).not.toContain(round.id);
      const all = await internal.listCalibrationRounds();
      expect(all.map((row) => row.id)).toEqual(expect.arrayContaining([round.id, nextWeek.id]));
      // By-id scope resolution for the detail console + the fronts scan for
      // the quality pipeline (#554): cross-account, null when unknown.
      expect((await internal.getCalibrationRound(round.id))?.accountId).toBe(fresh.accountId);
      expect(await internal.getCalibrationRound(crypto.randomUUID())).toBeNull();
      expect((await internal.listFronts()).map((row) => row.id)).toContain(front.id);
    });

    it("escalonamentos, exceções e pausas: ciclo básico", async () => {
      const itemId = await newItemId();
      const escalation = await repos.escalations.create(scope, {
        kind: "conteudo",
        severity: "high",
        ownerRole: "quality",
        itemId,
      });
      expect((await repos.escalations.get(scope, escalation.id))?.itemId).toBe(itemId);
      expect((await repos.escalations.list(scope, { itemId })).map((row) => row.id)).toContain(
        escalation.id
      );
      expect(await repos.escalations.list(scope, { itemId: crypto.randomUUID() })).toHaveLength(0);
      expect(
        (await repos.escalations.update(scope, escalation.id, { status: "resolved" })).status
      ).toBe("resolved");
      // By-id scope resolution for the detail console (#554): cross-account,
      // null when unknown.
      expect((await internal.getEscalation(escalation.id))?.accountId).toBe(scope.accountId);
      expect(await internal.getEscalation(crypto.randomUUID())).toBeNull();
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

    it("entregas: idempotente por evento, com união de canais e escopo", async () => {
      const fresh = await harness.createScope();
      const event = await repos.events.create(fresh, {
        actorType: "system",
        eventType: "notification.requested",
        occurredAt: new Date("2026-09-01T12:00:00.000Z"),
      });
      const first = await repos.deliveries.record(fresh, {
        eventId: event.id,
        channels: ["inapp"],
      });
      expect(first.channels).toEqual(["inapp"]);
      const second = await repos.deliveries.record(fresh, {
        eventId: event.id,
        channels: ["email", "inapp"],
      });
      expect(second.id).toBe(first.id);
      expect(second.channels).toEqual(["inapp", "email"]);
      expect((await repos.deliveries.getByEvent(fresh, event.id))?.id).toBe(first.id);
      expect(await repos.deliveries.getByEvent(otherScope, event.id)).toBeNull();
      expect(await repos.deliveries.list(fresh)).toHaveLength(1);
    });

    describe("internal.listFreeAccountsWithPendingNotifications", () => {
      const pendingIds = async () => (await internal.listFreeAccountsWithPendingNotifications()).map((a) => a.id);
      async function accountWith(status: "free" | "deploying" | "closed" | "active") {
        const fresh = await harness.createScope();
        if (status !== "deploying") await repos.accounts.update(fresh.workspaceId, fresh.accountId, { status });
        return fresh;
      }
      const request = (target: AccountScope, eventType = "notification.requested") =>
        repos.events.create(target, { actorType: "system", eventType, occurredAt: new Date("2026-09-01T12:00:00.000Z"),
          payload: { recipientRole: "support", templateKey: "exception.opened" } });

      it("inclui free com pedido sem recibo e com recibo parcial (não terminal)", async () => {
        const none = await accountWith("free"); await request(none);
        const inappOnly = await accountWith("free"); const e1 = await request(inappOnly);
        await repos.deliveries.record(inappOnly, { eventId: e1.id, channels: ["inapp"] });
        const emailOnly = await accountWith("free"); const e2 = await request(emailOnly);
        await repos.deliveries.record(emailOnly, { eventId: e2.id, channels: ["email"] });
        const ids = await pendingIds();
        expect(ids).toEqual(expect.arrayContaining([none.accountId, inappOnly.accountId, emailOnly.accountId]));
      });

      it("exclui recibos terminais (completed/internal/skipped e legado inapp+email)", async () => {
        const cases: string[][] = [["completed"], ["internal"], ["skipped"], ["inapp", "email"], ["inapp", "completed"], ["email", "inapp", "completed"]];
        const accounts: AccountScope[] = [];
        for (const channels of cases) {
          const fresh = await accountWith("free"); const event = await request(fresh);
          await repos.deliveries.record(fresh, { eventId: event.id, channels });
          accounts.push(fresh);
        }
        const ids = await pendingIds();
        for (const a of accounts) expect(ids).not.toContain(a.accountId);
      });

      it("exclui free sem notification.requested e eventos de outro tipo", async () => {
        const empty = await accountWith("free");
        const other = await accountWith("free"); await request(other, "item.approved");
        const ids = await pendingIds();
        expect(ids).not.toContain(empty.accountId);
        expect(ids).not.toContain(other.accountId);
      });

      it("exclui contas pagas e closed mesmo com pedido pendente", async () => {
        const paid = await accountWith("deploying"); await request(paid);
        const active = await accountWith("active"); await request(active);
        const closed = await accountWith("closed"); await request(closed);
        const free = await accountWith("free"); await request(free);
        const ids = await pendingIds();
        expect(ids).toContain(free.accountId);
        for (const a of [paid, active, closed]) expect(ids).not.toContain(a.accountId);
      });

      it("deduplica vários pedidos pendentes e segue pendente enquanto UM pedido faltar", async () => {
        const multi = await accountWith("free");
        const a = await request(multi); await request(multi); await request(multi);
        const ids = await pendingIds();
        expect(ids.filter((id) => id === multi.accountId)).toHaveLength(1);
        await repos.deliveries.record(multi, { eventId: a.id, channels: ["completed"] });
        expect(await pendingIds()).toContain(multi.accountId);   // 2 still pending
        const all = await accountWith("free");
        const evs = [await request(all), await request(all)];
        for (const ev of evs) await repos.deliveries.record(all, { eventId: ev.id, channels: ["completed"] });
        expect(await pendingIds()).not.toContain(all.accountId);
      });

      it("um recibo gravado sob escopo errado não encerra o evento de outra conta", async () => {
        const victim = await accountWith("free"); const event = await request(victim);
        const stranger = await accountWith("free");
        await repos.deliveries.record(stranger, { eventId: event.id, channels: ["completed"] }).catch(() => undefined);
        expect(await pendingIds()).toContain(victim.accountId);
        expect(await repos.deliveries.getByEvent(victim, event.id)).toBeNull();
      });

      it("a fila some da seleção após o recibo terminal e não depende de ordem de criação", async () => {
        const fresh = await accountWith("free"); const event = await request(fresh);
        expect(await pendingIds()).toContain(fresh.accountId);
        await repos.deliveries.record(fresh, { eventId: event.id, channels: ["inapp"] });
        expect(await pendingIds()).toContain(fresh.accountId);
        await repos.deliveries.record(fresh, { eventId: event.id, channels: ["completed"] });
        expect(await pendingIds()).not.toContain(fresh.accountId);
      });
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

    it("claim opcional: retoma apenas holds exclusivos de publish_disabled", async () => {
      const fresh = await harness.createScope();
      const other = await harness.createScope();
      const now = new Date("2026-09-01T12:00:00.000Z");
      const eligibleItem = await newItemId(fresh);
      const ineligibleItems = await Promise.all(Array.from({ length: 8 }, () => newItemId(fresh)));
      const eligible = await repos.intents.insertOrGet(fresh, {
        itemId: eligibleItem,
        versionHash: "held-publish-disabled",
        scheduledFor: new Date("2026-09-01T11:00:00.000Z"),
        destinationIgUserId: "ig-pinned",
      });
      await repos.intents.update(fresh, eligible.intent.id, {
        status: "held",
        leaseOwner: null,
        leaseExpiresAt: null,
      });
      const makeHeld = async (scope: AccountScope, itemId: string, hash: string) => {
        const { intent } = await repos.intents.insertOrGet(scope, {
          itemId,
          versionHash: hash,
          scheduledFor: new Date("2026-09-01T11:00:00.000Z"),
        });
        await repos.intents.update(scope, intent.id, { status: "held" });
        return intent;
      };
      const ineligible = await Promise.all(
        ineligibleItems.slice(0, 4).map((itemId, index) =>
          makeHeld(fresh, itemId, `held-other-${index}`),
        ),
      );
      const laterWrongReason = await makeHeld(fresh, ineligibleItems[4]!, "held-later-wrong-reason");
      const multiReason = ineligible[1]!;
      const otherAccount = ineligible[3]!;
      const otherReasons = await Promise.all(ineligibleItems.slice(5).map((itemId, index) =>
        makeHeld(fresh, itemId, `held-reason-${index}`),
      ));

      const hold = async (
        scope: AccountScope,
        itemId: string,
        occurredAt: Date,
        payload: Record<string, unknown>,
      ) => repos.events.create(scope, {
        actorType: "system",
        eventType: "item.held",
        objectType: "item",
        objectId: itemId,
        payload,
        occurredAt,
      });
      const flag = (intentId: string) => ({
        reason: "publish_disabled",
        reasons: ["publish_disabled"],
        heldIntentIds: [intentId],
      });
      await hold(fresh, eligibleItem, new Date(now.getTime() - 2_000), flag(eligible.intent.id));
      await hold(fresh, ineligibleItems[4]!, new Date(now.getTime() - 2_000), flag(laterWrongReason.id));
      await hold(fresh, ineligibleItems[4]!, new Date(now.getTime() - 1_000), {
        reason: "pause", reasons: ["pause"], heldIntentIds: [laterWrongReason.id],
      });
      await hold(fresh, ineligibleItems[1]!, now, {
        reason: "publish_disabled", reasons: ["publish_disabled", "pause"], heldIntentIds: [multiReason.id],
      });
      await hold(fresh, ineligibleItems[2]!, now, flag(crypto.randomUUID()));
      await hold(other, ineligibleItems[3]!, now, flag(otherAccount.id));
      for (const [index, reason] of ["global_stop", "manual_mode", "instagram_destination_changed"].entries()) {
        await hold(fresh, ineligibleItems[index + 5]!, now, {
          reason, reasons: [reason], heldIntentIds: [otherReasons[index]!.id],
        });
      }

      const claimed = await internal.claimDueIntents({
        owner: "retomada-flag", now, limit: 20, leaseTtlMs: 60_000,
        revalidatePublishDisabled: true,
      });
      expect(claimed.map((row) => row.id)).toEqual([eligible.intent.id]);
      expect(claimed[0]).toMatchObject({
        status: "held",
        leaseOwner: "retomada-flag",
        attempts: 1,
        destinationIgUserId: "ig-pinned",
      });
      expect(claimed[0]?.leaseExpiresAt?.getTime()).toBe(now.getTime() + 60_000);
      expect((await internal.claimDueIntents({
        owner: "concorrente", now, revalidatePublishDisabled: true,
      })).some((row) => row.id === eligible.intent.id)).toBe(false);
      const expired = await internal.claimDueIntents({
        owner: "após-lease", now: new Date(now.getTime() + 60_001),
        revalidatePublishDisabled: true,
      });
      expect(expired.find((row) => row.id === eligible.intent.id)).toMatchObject({
        status: "held", leaseOwner: "após-lease", attempts: 2,
      });
    });

    it("claim opcional: timestamp empatado com outro motivo falha fechado", async () => {
      const fresh = await harness.createScope();
      const now = new Date("2026-09-01T12:00:00.000Z");
      const itemId = await newItemId(fresh);
      const { intent } = await repos.intents.insertOrGet(fresh, {
        itemId, versionHash: "held-tie", scheduledFor: new Date(now.getTime() - 1_000),
      });
      await repos.intents.update(fresh, intent.id, { status: "held" });
      const occurredAt = new Date(now.getTime() - 500);
      for (const payload of [
        { reason: "publish_disabled", reasons: ["publish_disabled"], heldIntentIds: [intent.id] },
        { reason: "pause", reasons: ["pause"], heldIntentIds: [intent.id] },
      ]) await repos.events.create(fresh, {
        actorType: "system", eventType: "item.held", objectType: "item", objectId: itemId,
        payload, occurredAt,
      });
      const claimed = await internal.claimDueIntents({
        owner: "retomada-empate", now, revalidatePublishDisabled: true,
      });
      expect(claimed.some((row) => row.id === intent.id)).toBe(false);
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

    it("parada global (#583): uma ativa no máximo, sem escopo de conta", async () => {
      expect(await internal.globalStops.getActive()).toBeNull();
      const stop = await internal.globalStops.create({
        reason: "contrato",
        stoppedBy: "staff-1",
      });
      expect(stop.status).toBe("active");
      expect((await internal.globalStops.getActive())?.id).toBe(stop.id);
      await expect(
        internal.globalStops.create({ reason: "outra", stoppedBy: "staff-2" }),
      ).rejects.toBeInstanceOf(EquipeConflictError);
      const lifted = await internal.globalStops.update(stop.id, {
        status: "lifted",
        liftedBy: "staff-2",
        liftReason: "voltou",
      });
      expect(lifted.status).toBe("lifted");
      expect(await internal.globalStops.getActive()).toBeNull();
      await expect(
        internal.globalStops.update(crypto.randomUUID(), { status: "lifted" }),
      ).rejects.toBeInstanceOf(EquipeNotFoundError);
      const fresh = await harness.createScope();
      expect((await internal.listAccounts()).map((row) => row.id)).toContain(fresh.accountId);
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

    it("documentos da marca (ticket 07): append-only, versão única por conta+tipo, escopado à marca e à conta", async () => {
      const fresh = await harness.createScope();
      const account = await repos.accounts.get(fresh.workspaceId, fresh.accountId);
      const clientProfileId = account?.clientProfileId as string;

      const v1 = await repos.documents.create(fresh, {
        clientProfileId, kind: "diagnosis", version: 1,
        content: { summary: "Primeira versão" }, createdByRole: "assistant",
      });
      expect(v1).toMatchObject({ clientProfileId, kind: "diagnosis", version: 1, createdByRole: "assistant" });
      expect(v1.content).toEqual({ summary: "Primeira versão" });

      const v2 = await repos.documents.create(fresh, {
        clientProfileId, kind: "diagnosis", version: 2,
        content: { summary: "Segunda versão" }, createdByRole: "assistant",
      });
      const listed = await repos.documents.list(fresh);
      expect(listed.map((row) => row.version).sort()).toEqual([1, 2]);
      // Immutable: no update path exists on the repository at all.
      expect((repos.documents as unknown as { update?: unknown }).update).toBeUndefined();

      // Same (account, kind, version) is a conflict — versions are append-only, never overwritten.
      await expect(repos.documents.create(fresh, {
        clientProfileId, kind: "diagnosis", version: 1,
        content: { summary: "Reescrita indevida" }, createdByRole: "assistant",
      })).rejects.toBeInstanceOf(EquipeConflictError);
      // The original version 1 content survived the rejected duplicate.
      expect((await repos.documents.list(fresh)).find((row) => row.version === 1)?.content)
        .toEqual({ summary: "Primeira versão" });

      // Out of scope: another account never sees this brand's documents.
      expect(await repos.documents.list(otherScope)).not.toContainEqual(
        expect.objectContaining({ id: v1.id })
      );
      void v2;
    });

    it("documentos da marca (ticket 07): recusa uma marca que não é a da conta, mesma ou de outro workspace", async () => {
      const fresh = await harness.createScope();
      const otherFresh = await harness.createScope();
      const otherAccount = await repos.accounts.get(otherFresh.workspaceId, otherFresh.accountId);
      const foreignClientProfileId = otherAccount?.clientProfileId as string;

      // The account's OWN workspace, but a brand that belongs to a DIFFERENT account.
      await expect(repos.documents.create(fresh, {
        clientProfileId: foreignClientProfileId, kind: "diagnosis", version: 1,
        content: { summary: "Marca errada" }, createdByRole: "assistant",
      })).rejects.toBeInstanceOf(EquipeNotFoundError);

      // A clientProfileId that does not exist at all.
      await expect(repos.documents.create(fresh, {
        clientProfileId: crypto.randomUUID(), kind: "diagnosis", version: 1,
        content: { summary: "Marca inexistente" }, createdByRole: "assistant",
      })).rejects.toBeInstanceOf(EquipeNotFoundError);

      // Nothing was left behind by the rejected attempts.
      expect(await repos.documents.list(fresh)).toHaveLength(0);
    });
  });
}
