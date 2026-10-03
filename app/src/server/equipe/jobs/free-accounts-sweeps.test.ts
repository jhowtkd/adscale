// Crons and jobs never enumerate workspaces or free accounts because of `*` (ticket 11). With
// EQUIPE_PILOT_WORKSPACES=* the gate admits every workspace and every sign-up is a free account, so a job that listed
// workspaces, or every account, or read the scope of a free account with nothing pending, would grow with the number of
// sign-ups. Every sweep below runs against a unit of work that records each repository call, behind the real `*` gate.
//
// Event-driven jobs (handoff-read, diagnosis, agent-work: the instagram-cost read rides on the handoff) receive the
// account in the event and enumerate nothing; they are covered by the static guard, which also pins the cron jobs.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() },
}));

import type { EquipeUnitOfWork } from "../data";
import { EQUIPE_PAID_ACCOUNT_STATUS } from "../data/types";
import { executeCommand } from "../module/commands";
import { isEquipeEnabledForWorkspace, listPilotWorkspaceIds } from "../module/equipe-enabled";
import { makeTestDeps, openTestAccount, type TestDeps } from "../module/testing/deps";
import { ctx } from "../module/testing/items";
import { createAgentWorkOutboxHandler } from "./agent-work-outbox";
import { createDeadlinesHandler } from "./deadlines";
import { createDispatchHandler } from "./dispatch";
import { createMonitorHandler } from "./monitor";
import { createNotificationsHandler, type NotificationDeliveryAdapters } from "./notifications";
import { createReconcileHandler } from "./reconcile";
import { createRemindersHandler } from "./reminders";
import { EQUIPE_JOB_ACCOUNT_STATUSES, type EquipeJobDeps } from "./shared";
import { createSignalsHandler } from "./signals";

const GATE = { enabledRaw: "true", allowlistRaw: "*" } as const;
const PAID = 5;
const IDLE_FREE = 6;
const PENDING_FREE = 2;

const step = {
  run: async <T>(_name: string, fn: () => Promise<T>) => fn(),
  sendEvent: async () => undefined,
};

type Call = { name: string; args: unknown[] };

/** Wraps every function of an object tree so each call is recorded, then forwarded. */
function recording<T extends object>(target: T, calls: Call[], path: string): T {
  return new Proxy(target, {
    get(object, key, receiver) {
      const value = Reflect.get(object, key, receiver) as unknown;
      const name = `${path}.${String(key)}`;
      if (typeof value === "function") {
        return (...args: unknown[]) => {
          calls.push({ name, args });
          return (value as (...a: unknown[]) => unknown).apply(object, args);
        };
      }
      return value && typeof value === "object" ? recording(value, calls, name) : value;
    },
  });
}

function recordingUow(base: EquipeUnitOfWork, calls: Call[]): EquipeUnitOfWork {
  return {
    repos: recording(base.repos, calls, "repos"),
    internal: recording(base.internal, calls, "internal"),
    run: (fn) => base.run((repos, internal) => fn(recording(repos, calls, "repos"), recording(internal, calls, "internal"))),
  };
}

type Seeded = {
  t: TestDeps;
  paid: string[];
  closed: string;
  idleFree: string[];
  pendingFree: string[];
  terminalFree: string;
  /** Everything an idle free account is addressed by in a call: its account id and its workspace id. */
  idleNeedles: string[];
};

async function seed(): Promise<Seeded> {
  const t = makeTestDeps();
  const people = [{ name: "Ana", role: "approver" as const, userId: "user-ana", email: "ana@client.com" }];
  const open = async (status: string) => {
    const ids = await openTestAccount(t, { people });
    t.store.accounts.rows.get(ids.accountId)!.status = status as never;
    return ids;
  };
  const paid: string[] = [];
  for (const status of EQUIPE_JOB_ACCOUNT_STATUSES) paid.push((await open(status)).accountId);
  const closed = (await open("closed")).accountId;
  /** Opening an account already queues notices: close them as handled, except those `keep` says to leave pending. */
  async function settle(ids: { workspaceId: string; accountId: string }, keep: (payload: { recipientRole?: string }) => boolean = () => false) {
    const events = await t.deps.uow.repos.events.list({ workspaceId: ids.workspaceId, accountId: ids.accountId }, { eventType: "notification.requested" });
    for (const event of events) {
      if (keep(event.payload as { recipientRole?: string })) continue;
      await t.deps.uow.repos.deliveries.record({ workspaceId: ids.workspaceId, accountId: ids.accountId }, { eventId: event.id, channels: ["completed"] });
    }
  }
  const idle = [];
  for (let i = 0; i < IDLE_FREE; i += 1) {
    const ids = await open("free");
    await settle(ids);
    idle.push(ids);
  }

  /** A free account whose approver asked for support; the support request stays pending unless `terminal`. */
  async function requested(terminal: boolean) {
    const ids = await open("free");
    const out = await executeCommand(t.deps, ctx(ids, ids.actors.approver), { type: "request_support", payload: { note: "Assinar" } });
    if (!out.ok) throw new Error(`request_support failed: ${out.error.code}`);
    await settle(ids, (payload) => !terminal && payload.recipientRole === "support");
    return ids;
  }
  const pending = [await requested(false), await requested(false)];
  const terminal = await requested(true);
  return {
    t,
    paid,
    closed,
    idleFree: idle.map((ids) => ids.accountId),
    pendingFree: pending.map((ids) => ids.accountId),
    terminalFree: terminal.accountId,
    idleNeedles: [...idle, terminal].flatMap((ids) => [ids.accountId, ids.workspaceId]),
  };
}

type Run = { name: string; run: (deps: EquipeJobDeps) => Promise<unknown>; accountsField?: (s: Seeded) => number; touchesPending?: boolean };

const delivery: NotificationDeliveryAdapters = {
  users: { get: async () => ({ email: "suporte@adscale.test", emailVerified: true, emailNotificationsEnabled: true }) },
  inbox: { insert: async () => undefined },
  mailer: { send: async () => undefined },
};

const RUNS: Run[] = [
  { name: "deadlines", run: (deps) => createDeadlinesHandler(deps)({ event: { data: {} }, step }), accountsField: () => PAID },
  { name: "signals", run: (deps) => createSignalsHandler(deps)({ event: { data: {} }, step }), accountsField: () => PAID },
  { name: "calibration monitor", run: (deps) => createMonitorHandler(deps)({ event: { data: {} }, step }), accountsField: () => PAID },
  { name: "reminders", run: (deps) => createRemindersHandler(deps)({ event: { data: {} }, step }), accountsField: () => PAID },
  { name: "reconcile", run: (deps) => createReconcileHandler(deps)({ event: { data: {} }, step }), accountsField: () => PAID },
  { name: "agent work outbox", run: (deps) => createAgentWorkOutboxHandler(deps)({ step }) },
  { name: "dispatch", run: (deps) => createDispatchHandler(deps)({ event: { data: {} }, step }) },
  {
    name: "notifications",
    run: (deps) => createNotificationsHandler({ ...deps, delivery })({ event: { data: {} }, step }),
    accountsField: () => PAID + PENDING_FREE,
    touchesPending: true,
  },
];

describe("the `*` gate premise", () => {
  it("admits every workspace but lists none, so nothing can be enumerated from the allowlist", () => {
    expect(listPilotWorkspaceIds(GATE)).toEqual([]);
    expect(isEquipeEnabledForWorkspace(crypto.randomUUID(), GATE)).toBe(true);
  });
});

describe("cron sweeps with `*`: paid accounts only, free accounts only while a notification is pending", () => {
  for (const sweep of RUNS) {
    it(`${sweep.name}: no workspace listing, no unfiltered account listing, no free or closed sweep, no read of idle free accounts`, async () => {
      const s = await seed();
      const calls: Call[] = [];
      const deps: EquipeJobDeps = {
        uow: recordingUow(s.t.deps.uow, calls),
        clock: s.t.deps.clock,
        isEnabledForWorkspace: (id) => isEquipeEnabledForWorkspace(id, GATE),
        gatewayFor: () => s.t.gateway,
        publisher: s.t.publisher,
        isPublishEnabled: () => true,
      };

      const result = (await sweep.run(deps)) as { accounts?: number };

      const named = (name: string) => calls.filter((call) => call.name === name);
      // (a) nothing is enumerated through workspaces or through every account.
      expect(named("internal.listWorkspaceIds")).toEqual([]);
      expect(named("internal.listAccounts").filter((call) => call.args[0] === undefined)).toEqual([]);
      // (b) account sweeps ask for the paid job statuses only, never free or closed.
      for (const call of named("internal.listAccountsByStatus")) {
        expect(EQUIPE_JOB_ACCOUNT_STATUSES).toContain(call.args[0]);
      }
      // (c) no repository call carries the scope (or the workspace) of an idle free account.
      const touched = calls.filter((call) => s.idleNeedles.some((needle) => JSON.stringify(call.args).includes(needle)));
      expect(touched.map((call) => `${call.name} ${JSON.stringify(call.args).slice(0, 160)}`)).toEqual([]);
      // Only the notifications job reads free accounts, and only the two with a pending request.
      const pendingTouched = calls.filter((call) =>
        s.pendingFree.some((id) => JSON.stringify(call.args).includes(id)));
      if (sweep.touchesPending) {
        expect(pendingTouched.length).toBeGreaterThan(0);
        expect(named("internal.listFreeAccountsWithPendingNotifications")).toHaveLength(1);
      } else {
        expect(pendingTouched.map((call) => call.name)).toEqual([]);
        expect(named("internal.listFreeAccountsWithPendingNotifications")).toEqual([]);
      }
      // (d) the accounts counted are the paid ones (plus the pending free ones in the notifications job).
      if (sweep.accountsField) expect(result.accounts).toBe(sweep.accountsField(s));
    });
  }

  it("the paid sweeps list one status at a time and every status of the job list exactly once", async () => {
    const s = await seed();
    const calls: Call[] = [];
    const deps: EquipeJobDeps = {
      uow: recordingUow(s.t.deps.uow, calls),
      clock: s.t.deps.clock,
      isEnabledForWorkspace: (id) => isEquipeEnabledForWorkspace(id, GATE),
      gatewayFor: () => s.t.gateway,
    };
    await createDeadlinesHandler(deps)({ event: { data: {} }, step });
    const statuses = calls.filter((call) => call.name === "internal.listAccountsByStatus").map((call) => call.args[0]);
    expect(statuses).toEqual([...EQUIPE_PAID_ACCOUNT_STATUS]);
    expect(statuses).not.toContain("free");
    expect(statuses).not.toContain("closed");
  });
});

describe("static guard: no job enumerates workspaces or all accounts", () => {
  const equipeDir = fileURLToPath(new URL("../", import.meta.url));
  const jobsDir = `${equipeDir}jobs/`;
  const sources = [
    ...readdirSync(jobsDir)
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
      .map((file) => `jobs/${file}`),
    "agents/agent-work.ts",
  ].map((file) => ({ file, text: readFileSync(`${equipeDir}${file}`, "utf8") }));

  it("reads the job sources it is guarding", () => {
    expect(sources.length).toBeGreaterThan(10);
    expect(sources.map((source) => source.file)).toEqual(expect.arrayContaining(["jobs/shared.ts", "jobs/notifications.ts", "agents/agent-work.ts"]));
  });

  it("none lists workspaces, pilot workspaces or every account", () => {
    for (const { file, text } of sources) {
      expect(text, file).not.toContain("listWorkspaceIds");
      expect(text, file).not.toContain("listPilotWorkspaceIds");
      expect(text, file).not.toContain("listAccounts(");
    }
  });

  it("listAccountsByStatus is called from jobs/shared.ts only, where the paid status list lives", () => {
    const using = sources.filter((source) => source.text.includes("listAccountsByStatus")).map((source) => source.file);
    expect(using).toEqual(["jobs/shared.ts"]);
  });
});
