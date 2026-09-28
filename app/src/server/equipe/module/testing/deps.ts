// Test assembly: in-memory unit of work, fixed clock, fakes, and an
// enabled-workspace stub (the env gate has its own tests).

import { fixedClock, type Actor } from "../../domain";
import {
  createMemoryEquipeStore,
  createMemoryEquipeUnitOfWork,
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
    isEnabledForWorkspace: options.isEnabledForWorkspace ?? (() => true),
  };
  return { deps, store, gateway, notifier, agents, publisher };
}

export function uuid(): string {
  return crypto.randomUUID();
}

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

export type OpenTestAccountOptions = {
  fronts?: EquipeFrontKey[];
  people?: Array<{ name: string; role: EquipePersonRole; userId?: string; email?: string }>;
};

/** Open an account through the real command (also exercises open_account). */
export async function openTestAccount(
  t: TestDeps,
  options: OpenTestAccountOptions = {},
): Promise<{ workspaceId: string; accountId: string; profileId: string }> {
  const workspaceId = uuid();
  const profileId = uuid();
  t.gateway.addProfile({ id: profileId, workspaceId });
  const outcome = await executeCommand(t.deps, testActors.operations, {
    type: "open_account",
    workspaceId,
    payload: {
      clientProfileId: profileId,
      fronts: options.fronts ?? ["social_instagram"],
      people: options.people ?? [
        { name: "Ana", role: "approver" },
        { name: "Carla", role: "substitute" },
      ],
    },
  });
  if (!outcome.ok) {
    throw new Error(`openTestAccount failed: ${outcome.error.code} ${outcome.error.message}`);
  }
  return { workspaceId, accountId: outcome.value.accountId, profileId };
}
