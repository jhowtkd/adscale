// The staff pipeline at scale (ticket 11), in memory: a free account is read only while something is open, paid accounts
// always are, and the result equals what the old per-account algorithm produced. Plus the label reads of the consoles,
// which name only the accounts they show.

import { describe, expect, it, vi } from "vitest";
import type { AccountScope, EquipeAccountStatus, EquipeMandate } from "../data";
import { executeCommand } from "./commands";
import { getQualityPipeline, getRoundDetail } from "./calibration-queries";
import {
  getCrossAccountPipeline,
  getEscalationDetail,
  getExceptionsQueue,
  type CrossAccountEntry,
} from "./escalation-queries";
import { activationBaseOf } from "./plan-mandate";
import { makeTestDeps, openTestAccount, type TestDeps } from "./testing/deps";
import { ctx } from "./testing/items";
import { openTestRound, setupCalibration } from "./testing/calibration";

type Opened = Awaited<ReturnType<typeof openTestAccount>>;
const scopeOf = (ids: { workspaceId: string; accountId: string }): AccountScope => ({ workspaceId: ids.workspaceId, accountId: ids.accountId });

/** An account of the given status; `free` is set straight on the row, like the free-account tests do. */
async function accountIn(t: TestDeps, status: EquipeAccountStatus, labels?: { brandName: string; workspaceName: string }): Promise<Opened> {
  const ids = await openTestAccount(t, labels ? { labels } : {});
  t.store.accounts.rows.get(ids.accountId)!.status = status;
  return ids;
}
const entryOf = (entries: CrossAccountEntry[], ids: { accountId: string }) => entries.find((entry) => entry.scope.accountId === ids.accountId);

describe("getCrossAccountPipeline: free accounts", () => {
  it("a free account with nothing open is absent; with an open exception it shows, with names, and leaves when closed", async () => {
    const t = makeTestDeps();
    const quiet = await accountIn(t, "free");
    const free = await accountIn(t, "free", { brandName: "Café Aurora", workspaceName: "Agência Sul" });
    expect((await getCrossAccountPipeline(t.deps.uow.internal)).entries).toEqual([]);

    const asked = await executeCommand(t.deps, ctx(free, free.actors.approver), { type: "request_support", payload: { note: "Assinar" } });
    if (!asked.ok) throw new Error(`request_support failed: ${asked.error.code}`);
    const shown = (await getCrossAccountPipeline(t.deps.uow.internal)).entries;
    expect(shown.map((entry) => entry.scope.accountId)).toEqual([free.accountId]);
    expect(entryOf(shown, quiet)).toBeUndefined();
    expect(shown[0]).toMatchObject({ brandName: "Café Aurora", workspaceName: "Agência Sul" });
    expect(shown[0]?.exceptions).toHaveLength(1);
    const exceptionId = shown[0]!.exceptions[0]!.id;

    for (const [type, payload] of [["assume_exception", { exceptionId }], ["close_exception", { exceptionId, reason: "resolved" }]] as const) {
      const done = await executeCommand(t.deps, ctx(free, free.actors.support), { type, payload } as never);
      if (!done.ok) throw new Error(`${type} failed: ${done.error.code}`);
    }
    expect((await getCrossAccountPipeline(t.deps.uow.internal)).entries).toEqual([]);
  });

  it("an open escalation, an active pause each bring a free account in; resolved and lifted do not", async () => {
    const t = makeTestDeps();
    const { repos } = t.deps.uow;
    const escalated = await accountIn(t, "free");
    const paused = await accountIn(t, "free");
    const resolved = await accountIn(t, "free");
    const lifted = await accountIn(t, "free");
    await repos.escalations.create(scopeOf(escalated), { kind: "conteudo", severity: "high", ownerRole: "quality" });
    await repos.pauses.create(scopeOf(paused), { level: "publishing", scope: "account", origin: "client_request", resumableBy: "approver" });
    await repos.escalations.create(scopeOf(resolved), { kind: "conteudo", severity: "high", ownerRole: "quality", status: "resolved" });
    await repos.pauses.create(scopeOf(lifted), { level: "publishing", scope: "account", origin: "client_request", resumableBy: "approver", status: "lifted" });

    const { entries } = await getCrossAccountPipeline(t.deps.uow.internal);
    expect(entries.map((entry) => entry.scope.accountId)).toEqual([escalated.accountId, paused.accountId]);
    expect(entries[0]?.escalations).toHaveLength(1);
    expect(entries[1]?.pauses).toHaveLength(1);
  });
});

describe("getCrossAccountPipeline: paid accounts", () => {
  it("every non-free status, closed included, shows even when empty, in creation order", async () => {
    const t = makeTestDeps();
    const statuses: EquipeAccountStatus[] = ["closed", "active", "deploying", "suspended", "paused", "calibrating"];
    const created: Opened[] = [];
    for (const status of statuses) {
      created.push(await accountIn(t, status));
      await accountIn(t, "free"); // quiet free accounts in between never show
    }
    const { entries } = await getCrossAccountPipeline(t.deps.uow.internal);
    expect(entries.map((entry) => entry.scope.accountId)).toEqual(created.map((ids) => ids.accountId));
    for (const entry of entries) {
      expect(entry.escalations).toEqual([]);
      expect(entry.exceptions).toEqual([]);
      expect(entry.pauses).toEqual([]);
      expect(entry.mandate).toEqual({ approved: null, activationPending: null });
    }
  });
});

describe("getCrossAccountPipeline: same result as the old per-account algorithm", () => {
  /** The algorithm the screen used before ticket 11, written out: per account, scoped reads and in-memory filters. */
  async function oracle(t: TestDeps, accounts: Opened[]) {
    const { repos } = t.deps.uow;
    const rank: Record<string, number> = { critical_cross_account: 0, critical: 1, high: 2, medium: 3, low: 4 };
    const bySeverityThenDue = (a: { severity: string; dueAt: Date | null }, b: { severity: string; dueAt: Date | null }) => {
      const r = (row: { severity: string }) => rank[row.severity] ?? 5;
      if (r(a) !== r(b)) return r(a) - r(b);
      return (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity);
    };
    const summary = (mandates: EquipeMandate[]) => {
      const approved = mandates.filter((row) => row.status === "approved").sort((a, b) => b.version - a.version)[0] ?? null;
      const activation = mandates
        .filter((row) => row.status === "proposed" && activationBaseOf(mandates, row) !== null)
        .sort((a, b) => b.version - a.version)[0] ?? null;
      return {
        approved: approved ? { id: approved.id, version: approved.version, shadow: approved.shadow } : null,
        activationPending: activation ? { id: activation.id, version: activation.version } : null,
      };
    };
    const out = [];
    for (const ids of accounts) {
      const scope = scopeOf(ids);
      const row = (await repos.accounts.get(scope.workspaceId, scope.accountId))!;
      const labels = (await t.deps.uow.internal.listAccountLabels()).find((label) => label.accountId === scope.accountId)!;
      out.push({
        scope,
        status: row.status,
        brandName: labels.brandName,
        workspaceName: labels.workspaceName,
        escalations: (await repos.escalations.list(scope))
          .filter((e) => ["open", "acknowledged", "resolving", "awaiting_client"].includes(e.status)).sort(bySeverityThenDue),
        exceptions: (await repos.exceptions.list(scope)).filter((e) => e.status === "open" || e.status === "claimed"),
        pauses: (await repos.pauses.list(scope)).filter((p) => p.status === "active"),
        mandate: summary(await repos.mandates.list(scope)),
      });
    }
    return out;
  }

  it("matches scope, names, escalation order, exceptions, pauses and mandate summary for a mixed set of paid accounts", async () => {
    const t = makeTestDeps();
    const { repos } = t.deps.uow;
    const statuses: EquipeAccountStatus[] = ["active", "closed", "deploying", "suspended", "calibrating", "paused"];
    const accounts: Opened[] = [];
    for (const [index, status] of statuses.entries()) {
      accounts.push(await accountIn(t, status, { brandName: `Marca ${index}`, workspaceName: `Agência ${index}` }));
    }
    const [a, b, c, d, e] = accounts as [Opened, Opened, Opened, Opened, Opened, Opened];
    const due = (day: number) => new Date(`2026-10-${String(day).padStart(2, "0")}T12:00:00.000Z`);
    // Escalations in mixed severities, deadlines and statuses (resolved/closed/merged must be filtered out).
    for (const [severity, dueAt, status] of [
      ["low", due(9), "open"], ["critical", null, "acknowledged"], ["high", due(8), "resolving"], ["high", due(7), "awaiting_client"],
      ["critical_cross_account", due(20), "open"], ["medium", due(1), "resolved"], ["high", due(2), "closed"], ["high", due(3), "merged"],
    ] as const) {
      await repos.escalations.create(scopeOf(a), { kind: "conteudo", severity, ownerRole: "quality", dueAt, status });
    }
    await repos.escalations.create(scopeOf(c), { kind: "seguranca", severity: "medium", ownerRole: "quality" });
    // Exceptions open, claimed, resolved, closed.
    for (const status of ["open", "claimed", "resolved", "closed"] as const) {
      await repos.exceptions.create(scopeOf(b), { trigger: "sem_material", status });
    }
    await repos.exceptions.create(scopeOf(d), { trigger: "sem_material" });
    // Pauses active and lifted.
    for (const status of ["active", "lifted", "active"] as const) {
      await repos.pauses.create(scopeOf(c), { level: "publishing", scope: "account", origin: "client_request", resumableBy: "approver", status });
    }
    // Mandates: an approved shadow with a proposed live version after it (activation pending), plus noise.
    await repos.mandates.create(scopeOf(a), { version: 1, status: "approved", shadow: true });
    await repos.mandates.create(scopeOf(a), { version: 2, status: "proposed", shadow: false });
    await repos.mandates.create(scopeOf(a), { version: 3, status: "draft", shadow: false });
    await repos.mandates.create(scopeOf(d), { version: 1, status: "approved", shadow: false });
    await repos.mandates.create(scopeOf(d), { version: 2, status: "superseded", shadow: false });
    await repos.mandates.create(scopeOf(e), { version: 1, status: "proposed", shadow: false });

    const expected = await oracle(t, accounts);
    const { entries } = await getCrossAccountPipeline(t.deps.uow.internal);
    expect(entries).toHaveLength(accounts.length);
    expect(entries.map((entry) => entry.scope)).toEqual(expected.map((row) => row.scope));
    for (const [index, entry] of entries.entries()) {
      const want = expected[index]!;
      expect(entry.brandName).toBe(want.brandName);
      expect(entry.workspaceName).toBe(want.workspaceName);
      expect(entry.escalations.map((row) => row.id)).toEqual(want.escalations.map((row) => row.id));
      expect(entry.exceptions.map((row) => row.id).sort()).toEqual(want.exceptions.map((row) => row.id).sort());
      expect(entry.pauses.map((row) => row.id).sort()).toEqual(want.pauses.map((row) => row.id).sort());
      expect(entry.mandate).toEqual(want.mandate);
    }
    // The fixture has teeth: the interesting cases are really there.
    expect(entries[0]?.escalations.map((row) => row.severity)).toEqual(["critical_cross_account", "critical", "high", "high", "low"]);
    expect(entries[0]?.escalations.slice(2, 4).map((row) => row.dueAt?.getDate())).toEqual([7, 8]);
    expect(entries[0]?.mandate.approved).toMatchObject({ version: 1, shadow: true });
    expect(entries[0]?.mandate.activationPending).toMatchObject({ version: 2 });
    expect(entries[1]?.exceptions).toHaveLength(2);
    expect(entries[2]?.pauses).toHaveLength(2);
    expect(entries[3]?.mandate).toEqual({ approved: { id: expect.any(String), version: 1, shadow: false }, activationPending: null });
    expect(entries[4]?.mandate.activationPending).toBeNull();
  });
});

describe("staff consoles label only the accounts they show", () => {
  const labelCalls = (t: TestDeps) => {
    const spy = vi.spyOn(t.deps.uow.internal, "listAccountLabels");
    return { spy, filters: () => spy.mock.calls.map(([filter]) => filter) };
  };

  it("getExceptionsQueue and getEscalationDetail ask for [accountId] only, never for every account", async () => {
    const t = makeTestDeps();
    const first = await accountIn(t, "active");
    await accountIn(t, "free");
    await accountIn(t, "free");
    const opened = await executeCommand(t.deps, ctx(first, first.actors.agent), {
      type: "open_escalation", payload: { kind: "content", severity: "normal", reason: "x" },
    });
    if (!opened.ok) throw new Error("open failed");
    const calls = labelCalls(t);

    await getExceptionsQueue(t.deps.uow.repos, t.deps.uow.internal, first.workspaceId, first.accountId, new Date());
    await getEscalationDetail(t.deps.uow.repos, t.deps.uow.internal, first.workspaceId, first.accountId, opened.value.data.escalationId as string);
    expect(calls.filters()).toEqual([{ accountIds: [first.accountId] }, { accountIds: [first.accountId] }]);
  });

  it("getQualityPipeline asks for the accounts of the rounds only; getRoundDetail for [accountId]", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    const idle = await accountIn(t, "active");
    await accountIn(t, "free");
    const calls = labelCalls(t);

    const qualityId = (ids.actors.quality as { staffId: string }).staffId;
    const pipeline = await getQualityPipeline(t.deps.uow.internal, qualityId);
    expect(pipeline.ok).toBe(true);
    await getRoundDetail(t.deps.uow.repos, t.deps.uow.internal, ids.workspaceId, ids.accountId, round.roundId);

    const filters = calls.filters();
    expect(filters).toEqual([{ accountIds: [ids.accountId] }, { accountIds: [ids.accountId] }]);
    expect(JSON.stringify(filters)).not.toContain(idle.accountId);
    expect(filters.every((filter) => filter !== undefined)).toBe(true);
  });
});
