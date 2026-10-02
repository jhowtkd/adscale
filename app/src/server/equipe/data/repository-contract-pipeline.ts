import { describe, expect, it } from "vitest";
import { EQUIPE_ACCOUNT_STATUS, EQUIPE_PAID_ACCOUNT_STATUS } from "../../db/equipe-schema";
import type { EquipeContractHarness } from "./repository-contract";
import type { EquipeAccountStatus, AccountScope } from "./types";

// Contrato do pipeline do staff (ticket 11): listPipelineRows, listAccounts({statuses}) e listAccountLabels({accountIds}).
// No modo Postgres o banco é compartilhado com outras suítes: todas as afirmações são sobre as contas que o teste cria
// (filtradas por id), nunca sobre totais.
export function definePipelineContract(getHarness: () => EquipeContractHarness): void {
  describe("pipeline do staff: listPipelineRows, listAccounts e listAccountLabels", () => {
    const repos = () => getHarness().uow.repos;
    const internal = () => getHarness().uow.internal;

    async function accountWith(status: EquipeAccountStatus): Promise<AccountScope> {
      const fresh = await getHarness().createScope();
      if (status !== "deploying") await repos().accounts.update(fresh.workspaceId, fresh.accountId, { status });
      return fresh;
    }

    /** The pipeline read, narrowed to the accounts a test created. */
    async function pipelineOf(mine: AccountScope[]) {
      const ids = new Set(mine.map((scope) => scope.accountId));
      const rows = await internal().listPipelineRows();
      return {
        accounts: rows.accounts.filter((row) => ids.has(row.id)),
        escalations: rows.escalations.filter((row) => ids.has(row.accountId)),
        exceptions: rows.exceptions.filter((row) => ids.has(row.accountId)),
        pauses: rows.pauses.filter((row) => ids.has(row.accountId)),
        mandates: rows.mandates.filter((row) => ids.has(row.accountId)),
      };
    }

    const openException = (scope: AccountScope) => repos().exceptions.create(scope, { trigger: "sem_material" });
    const escalationIn = (scope: AccountScope, status: "open" | "acknowledged" | "resolving" | "awaiting_client" | "resolved" | "merged" | "closed") =>
      repos().escalations.create(scope, { kind: "conteudo", severity: "high", ownerRole: "quality", status });
    const pauseIn = (scope: AccountScope, status: "active" | "lifted") =>
      repos().pauses.create(scope, { level: "publishing", scope: "account", origin: "client_request", resumableBy: "approver", status });

    it("contas pagas de todo status (inclusive closed) entram sempre, mesmo vazias, em ordem de criação", async () => {
      const mine: AccountScope[] = [];
      for (const status of EQUIPE_ACCOUNT_STATUS.filter((value) => value !== "free")) mine.push(await accountWith(status));
      const { accounts, escalations, exceptions, pauses } = await pipelineOf(mine);
      expect(accounts.map((row) => row.id)).toEqual(mine.map((scope) => scope.accountId));
      expect(accounts.map((row) => row.status)).toEqual(EQUIPE_ACCOUNT_STATUS.filter((value) => value !== "free"));
      expect(escalations).toHaveLength(0);
      expect(exceptions).toHaveLength(0);
      expect(pauses).toHaveLength(0);
    });

    it("conta free sem nada aberto não entra; com exceção open ou claimed, escalonamento aberto ou pausa ativa entra", async () => {
      const quiet = await accountWith("free");
      const withOpenException = await accountWith("free");
      await openException(withOpenException);
      const withClaimed = await accountWith("free");
      const claimed = await openException(withClaimed);
      await repos().exceptions.update(withClaimed, claimed.id, { status: "claimed" });
      const escalated: AccountScope[] = [];
      for (const status of ["open", "acknowledged", "resolving", "awaiting_client"] as const) {
        const fresh = await accountWith("free");
        await escalationIn(fresh, status);
        escalated.push(fresh);
      }
      const paused = await accountWith("free");
      await pauseIn(paused, "active");

      const mine = [quiet, withOpenException, withClaimed, ...escalated, paused];
      const { accounts, escalations, exceptions, pauses } = await pipelineOf(mine);
      expect(accounts.map((row) => row.id)).toEqual(mine.filter((scope) => scope !== quiet).map((scope) => scope.accountId));
      expect(accounts.every((row) => row.status === "free")).toBe(true);
      expect(exceptions.map((row) => row.accountId).sort())
        .toEqual([withOpenException.accountId, withClaimed.accountId].sort());
      expect(escalations.map((row) => row.accountId).sort()).toEqual(escalated.map((scope) => scope.accountId).sort());
      expect(pauses.map((row) => row.accountId)).toEqual([paused.accountId]);
    });

    it("exceção resolved/closed, escalonamento resolved/closed/merged e pausa lifted não trazem a conta free nem entram nas listas", async () => {
      const closedException = await accountWith("free");
      await repos().exceptions.update(closedException, (await openException(closedException)).id, { status: "closed" });
      const resolvedException = await accountWith("free");
      await repos().exceptions.update(resolvedException, (await openException(resolvedException)).id, { status: "resolved" });
      const finished: AccountScope[] = [];
      for (const status of ["resolved", "closed", "merged"] as const) {
        const fresh = await accountWith("free");
        await escalationIn(fresh, status);
        finished.push(fresh);
      }
      const lifted = await accountWith("free");
      await pauseIn(lifted, "lifted");

      const { accounts, escalations, exceptions, pauses } = await pipelineOf([closedException, resolvedException, ...finished, lifted]);
      expect(accounts).toHaveLength(0);
      expect(escalations).toHaveLength(0);
      expect(exceptions).toHaveLength(0);
      expect(pauses).toHaveLength(0);
    });

    it("conta paga traz só as linhas abertas, não as encerradas", async () => {
      const paid = await accountWith("active");
      const open = await openException(paid);
      await repos().exceptions.update(paid, (await openException(paid)).id, { status: "closed" });
      const keep = await escalationIn(paid, "awaiting_client");
      await escalationIn(paid, "resolved");
      const pause = await pauseIn(paid, "active");
      await pauseIn(paid, "lifted");
      const { exceptions, escalations, pauses } = await pipelineOf([paid]);
      expect(exceptions.map((row) => row.id)).toEqual([open.id]);
      expect(escalations.map((row) => row.id)).toEqual([keep.id]);
      expect(pauses.map((row) => row.id)).toEqual([pause.id]);
    });

    it("mandatos: só approved e proposed, e só os das contas listadas", async () => {
      const paid = await accountWith("active");
      const byStatus = new Map<string, string>();
      let version = 0;
      for (const status of ["draft", "proposed", "approved", "suspended", "superseded"] as const) {
        version += 1;
        byStatus.set(status, (await repos().mandates.create(paid, { version, status, shadow: status === "approved" })).id);
      }
      const quietFree = await accountWith("free");
      await repos().mandates.create(quietFree, { version: 1, status: "approved", shadow: false });
      const { mandates } = await pipelineOf([paid, quietFree]);
      expect(mandates.map((row) => row.id).sort()).toEqual([byStatus.get("approved"), byStatus.get("proposed")].sort());
      expect(mandates.find((row) => row.status === "approved")?.shadow).toBe(true);
    });

    it("nomes da marca e do workspace vêm da mesma junção dos rótulos", async () => {
      const base = await getHarness().createScope();
      const profile = await internal().createClientProfile(base.workspaceId, "Marca do pipeline");
      const account = await repos().accounts.create(base.workspaceId, { clientProfileId: profile.id });
      await repos().accounts.update(base.workspaceId, account.id, { status: "active" });
      const mine = [{ workspaceId: base.workspaceId, accountId: account.id }];
      const row = (await pipelineOf(mine)).accounts[0];
      expect(row?.brandName).toBe("Marca do pipeline");
      const [label] = await internal().listAccountLabels({ accountIds: [account.id] });
      expect(label).toEqual({ workspaceId: base.workspaceId, accountId: account.id, brandName: "Marca do pipeline", workspaceName: row?.workspaceName });
    });

    it("listAccounts({ statuses }): só os estados pedidos, oldest first; lista vazia devolve []", async () => {
      const mine: AccountScope[] = [];
      for (const status of ["free", "active", "closed", "deploying", "free"] as const) mine.push(await accountWith(status));
      const ids = new Set(mine.map((scope) => scope.accountId));
      const mineOf = async (statuses: readonly EquipeAccountStatus[]) =>
        (await internal().listAccounts({ statuses })).filter((row) => ids.has(row.id));

      expect((await mineOf(EQUIPE_PAID_ACCOUNT_STATUS)).map((row) => row.id))
        .toEqual([mine[1], mine[3]].map((scope) => scope?.accountId));
      expect((await mineOf(["free"])).map((row) => row.id)).toEqual([mine[0], mine[4]].map((scope) => scope?.accountId));
      expect((await mineOf(["closed"])).map((row) => row.id)).toEqual([mine[2]?.accountId]);
      expect(await internal().listAccounts({ statuses: [] })).toEqual([]);
      // Sem filtro continua devolvendo todas.
      expect((await internal().listAccounts()).filter((row) => ids.has(row.id))).toHaveLength(mine.length);
    });

    it("listAccountLabels({ accountIds }): só as contas pedidas; ids desconhecidos ou lista vazia devolvem []", async () => {
      const one = await getHarness().createScope();
      const two = await getHarness().createScope();
      expect((await internal().listAccountLabels({ accountIds: [one.accountId] })).map((row) => row.accountId)).toEqual([one.accountId]);
      expect((await internal().listAccountLabels({ accountIds: [two.accountId, one.accountId] })).map((row) => row.accountId).sort())
        .toEqual([one.accountId, two.accountId].sort());
      expect(await internal().listAccountLabels({ accountIds: [crypto.randomUUID()] })).toEqual([]);
      expect(await internal().listAccountLabels({ accountIds: [] })).toEqual([]);
      expect((await internal().listAccountLabels()).map((row) => row.accountId)).toEqual(expect.arrayContaining([one.accountId, two.accountId]));
    });
  });
}
