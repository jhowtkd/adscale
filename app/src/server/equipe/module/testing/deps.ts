// Test assembly: in-memory unit of work, fixed clock, fakes, and an
// enabled-workspace stub (the env gate has its own tests).
//
// Actors are bound inside the command transaction (see bindActor), so happy
// paths use the bound actors returned by openTestAccount / seedStaff, while
// the unbound testActors entries serve the forbidden-actor probes.

import { fixedClock, type Actor, type StaffRole } from "../../domain";
import {
  createMemoryEquipeStore,
  createMemoryEquipeUnitOfWork,
  seedMemoryAdscaleLabels,
  type EquipeFrontKey,
  type EquipePersonRole,
  type MemoryEquipeStore,
} from "../../data";
import { executeCommand } from "../commands";
import type { EquipeModuleDeps } from "../ports";
import {
  FakeAdscaleGateway,
  FakePublisher,
  FixedAgents,
  RecordingNotifier,
} from "./fakes";

export type TestDepsOptions = {
  now?: Date;
  isEnabledForWorkspace?: (workspaceId: string) => boolean;
  publishEnabled?: boolean;
  /** Remaining free AI balance reported to commands that re-reserve it (default: the whole US$ 1 cap). */
  freeBalanceUsdCents?: number;
};

export type TestDeps = {
  deps: EquipeModuleDeps;
  store: MemoryEquipeStore;
  gateway: FakeAdscaleGateway;
  notifier: RecordingNotifier;
  agents: FixedAgents;
  publisher: FakePublisher;
};

export function makeTestDeps(options: TestDepsOptions = {}): TestDeps {
  const store = createMemoryEquipeStore();
  const uow = createMemoryEquipeUnitOfWork(store);
  const gateway = new FakeAdscaleGateway();
  const notifier = new RecordingNotifier();
  const agents = new FixedAgents();
  const publisher = new FakePublisher();
  const deps: EquipeModuleDeps = {
    uow,
    clock: fixedClock(options.now ?? new Date("2026-10-05T14:00:00.000Z")),
    gateway,
    notifier,
    agents,
    publisher,
    freeBudget: { remainingUsdCents: async () => options.freeBalanceUsdCents ?? 100 },
    isEnabledForWorkspace: options.isEnabledForWorkspace ?? (() => true),
    isPublishEnabled: () => options.publishEnabled ?? true,
  };
  return { deps, store, gateway, notifier, agents, publisher };
}

export function uuid(): string {
  return crypto.randomUUID();
}

/**
 * Unbound actors: no store rows back the client/staff entries, so binding
 * rejects them — exactly what the forbidden-actor probes need. Agent and
 * system have no table and work as-is.
 */
export const testActors: Record<string, Actor> = {
  approver: { kind: "client_person", role: "approver", personId: "person-ana" },
  substitute: { kind: "client_person", role: "substitute", personId: "person-carla" },
  custodian: { kind: "client_person", role: "custodian", personId: "person-cust" },
  member: { kind: "client_person", role: "member", personId: "person-rui" },
  support: { kind: "staff", role: "support", staffId: "staff-bruna" },
  quality: { kind: "staff", role: "quality", staffId: "staff-q" },
  operations: { kind: "staff", role: "operations", staffId: "staff-ops" },
  agent: { kind: "agent", agentId: "estrategista" },
  system: { kind: "system", job: "reminders" },
};

export type TestAccountActors = Record<
  | "approver"
  | "substitute"
  | "custodian"
  | "member"
  | "support"
  | "quality"
  | "operations"
  | "agent"
  | "system",
  Actor
>;

/** Create an active staff row and return the actor bound to it. */
export async function seedStaff(
  t: TestDeps,
  role: StaffRole,
  options: { active?: boolean; displayName?: string } = {},
): Promise<Actor> {
  const row = await t.deps.uow.internal.staff.create({
    role,
    displayName: options.displayName ?? role,
    active: options.active ?? true,
  });
  return { kind: "staff", role, staffId: row.id };
}

export type OpenTestAccountOptions = {
  fronts?: EquipeFrontKey[];
  people?: Array<{ name: string; role: EquipePersonRole; userId?: string; email?: string }>;
  labels?: { brandName: string; workspaceName: string };
  profileName?: string;
};

/** Open an account through the real command (also exercises open_account). */
export async function openTestAccount(
  t: TestDeps,
  options: OpenTestAccountOptions = {},
): Promise<{
  workspaceId: string;
  accountId: string;
  profileId: string;
  actors: TestAccountActors;
}> {
  const workspaceId = uuid();
  const profileId = uuid();
  t.gateway.addProfile({ id: profileId, workspaceId, name: options.profileName ?? null });
  // Staff views always carry brand/workspace names; tests that assert
  // them pass custom labels, the rest get deterministic defaults.
  seedMemoryAdscaleLabels(t.store, {
    workspaceId,
    profileId,
    brandName: options.labels?.brandName ?? "Marca demo",
    workspaceName: options.labels?.workspaceName ?? "Espaço demo",
  });
  const operations = await seedStaff(t, "operations");
  const outcome = await executeCommand(t.deps, { actor: operations, workspaceId }, {
    type: "open_account",
    payload: {
      clientProfileId: profileId,
      fronts: options.fronts ?? ["social_instagram"],
      people: options.people ?? [
        { name: "Ana", role: "approver" },
        { name: "Carla", role: "substitute" },
        { name: "Cid", role: "custodian" },
        { name: "Rui", role: "member" },
      ],
    },
  });
  if (!outcome.ok) {
    throw new Error(`openTestAccount failed: ${outcome.error.code} ${outcome.error.message}`);
  }
  const accountId = outcome.value.accountId;
  const people = await t.deps.uow.repos.people.list({ workspaceId, accountId });
  const bound = (role: EquipePersonRole): Actor => {
    const found = people.find((person) => person.role === role);
    if (found) {
      return { kind: "client_person", role, personId: found.id };
    }
    return testActors[role]!;
  };
  const support = await seedStaff(t, "support");
  const quality = await seedStaff(t, "quality");
  return {
    workspaceId,
    accountId,
    profileId,
    actors: {
      approver: bound("approver"),
      substitute: bound("substitute"),
      custodian: bound("custodian"),
      member: bound("member"),
      support,
      quality,
      operations,
      agent: testActors.agent!,
      system: testActors.system!,
    },
  };
}
