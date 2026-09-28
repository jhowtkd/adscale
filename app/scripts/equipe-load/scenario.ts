// Scenario generator: N synthetic accounts through module commands, each
// with fronts, an approved plan/mandate, an active (fake-served) Instagram
// connection and a realistic weekly volume (Anexo A: up to 6 posts/week
// social) of items across states.
//
// Accounts stay `deploying` (go_live is calibration entry, out of scope for
// the spike), so no calibration conference blocks approvals — the same gate
// the dispatch handler revalidates at send time.

import { randomUUID } from "node:crypto";
import { executeCommand } from "../../src/server/equipe/module/commands";
import { itemVersionHash } from "../../src/server/equipe/module/item-shared";
import {
  mandateRuleOf,
  mandateVersionHash,
  planVersionHash,
} from "../../src/server/equipe/module/plan-mandate";
import { contextVersionHash } from "../../src/server/equipe/module/context";
import { FakeAdscaleGateway } from "../../src/server/equipe/module/testing/fakes";
import type { Actor } from "../../src/server/equipe/domain";
import type { EquipeModuleDeps } from "../../src/server/equipe/module/ports";
import type { EquipeContextFields, EquipeOnboardingStepKey } from "../../src/server/equipe/data";
import type { Metrics } from "./metrics";
import type { Rng } from "./fakes";

/** Monday 2026-10-05 00:00 America/Sao_Paulo. */
export const WEEK_START_ISO = "2026-10-05T00:00:00-03:00";

export function spDate(day: number, hour: number, minute = 0): Date {
  const dd = String(day).padStart(2, "0");
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return new Date(`2026-10-${dd}T${hh}:${mm}:00-03:00`);
}

type CommandInput = { type: string; payload: Record<string, unknown> };

/** Timed executeCommand: records latency, counts errors, fails fast on demand. */
export async function runTimed(
  metrics: Metrics,
  deps: EquipeModuleDeps,
  context: { actor: Actor; workspaceId: string; accountId?: string },
  command: CommandInput,
  label: string,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; code: string }> {
  const start = performance.now();
  try {
    const outcome = await executeCommand(deps, context, command);
    metrics.timeCommand(command.type, performance.now() - start);
    if (!outcome.ok) {
      metrics.error(outcome.error.code);
      return { ok: false, code: outcome.error.code };
    }
    return { ok: true, data: outcome.value.data as Record<string, unknown> };
  } catch (error) {
    metrics.timeCommand(command.type, performance.now() - start);
    const code = error instanceof Error ? error.message : "threw";
    const cause =
      error instanceof Error && error.cause instanceof Error ? ` (cause: ${error.cause.message})` : "";
    metrics.error("threw");
    throw new Error(`${label} threw: ${code}${cause}`);
  }
}

export async function runMust(
  metrics: Metrics,
  deps: EquipeModuleDeps,
  context: { actor: Actor; workspaceId: string; accountId?: string },
  command: CommandInput,
  label: string,
): Promise<Record<string, unknown>> {
  const outcome = await runTimed(metrics, deps, context, command, label);
  if (!outcome.ok) {
    throw new Error(`${label} failed: ${outcome.code}`);
  }
  return outcome.data;
}

export type SetupActors = {
  approver: Actor;
  substitute: Actor;
  custodian: Actor;
  member: Actor;
  support: Actor;
  quality: Actor;
  operations: Actor;
  agent: Actor;
  system: Actor;
};

export type BurstTarget = { itemId: string; versionHash: string };

export type ScenarioAccount = {
  workspaceId: string;
  accountId: string;
  brand: string;
  actors: SetupActors;
  frontIds: { social: string; midia: string };
  /** Awaiting items the mid-week burst approves in batch. */
  burstBatch: BurstTarget[];
  /** needsConfirmation item: confirm_business_fact + approve_item in burst. */
  burstConfirm: BurstTarget | null;
  /** Awaiting items the burst touches with edit_caption / request_adjustment. */
  burstEdit: BurstTarget[];
  burstAdjust: BurstTarget[];
};

export type ScenarioDeps = {
  deps: EquipeModuleDeps;
  gateway: FakeAdscaleGateway;
  metrics: Metrics;
  rng: Rng;
  /** Insert a login user row so people/staff userIds satisfy the FK. */
  createLoginUser: (input: { id: string; name: string; email: string }) => Promise<void>;
  /** Insert the synthetic workspace/brand rows the account FKs need. */
  createWorkspace: (input: { workspaceId: string; profileId: string; brand: string }) => Promise<void>;
  /** Insert the real creative-work row the item FK needs. */
  createCreativeWork: (input: {
    workId: string;
    workspaceId: string;
    profileId: string;
    createdBy: string;
    title: string;
  }) => Promise<void>;
};

const ONBOARDING_STEPS: EquipeOnboardingStepKey[] = [
  "scope_confirm",
  "materials",
  "context",
  "plan",
  "mandate",
  "connection",
];

function ctxOf(account: { workspaceId: string; accountId: string }, actor: Actor) {
  return { actor, workspaceId: account.workspaceId, accountId: account.accountId };
}

async function seedStaffOnce(s: ScenarioDeps): Promise<Pick<SetupActors, "support" | "quality" | "operations">> {
  const out = {} as Pick<SetupActors, "support" | "quality" | "operations">;
  for (const role of ["support", "quality", "operations"] as const) {
    const userId = `load-staff-${role}`;
    await s.createLoginUser({
      id: userId,
      name: `Load ${role}`,
      email: `load-staff-${role}@load.test`,
    });
    const row = await s.deps.uow.internal.staff.create({
      role,
      displayName: `Load ${role}`,
      active: true,
      userId,
    });
    out[role] = { kind: "staff", role, staffId: row.id };
  }
  return out;
}

export async function buildScenario(
  s: ScenarioDeps,
  staff: Pick<SetupActors, "support" | "quality" | "operations">,
  index: number,
): Promise<ScenarioAccount> {
  const { deps, gateway, metrics, rng } = s;
  const brand = `Marca Sintética ${index + 1}`;
  const workspaceId = randomUUID();
  const profileId = randomUUID();
  gateway.addProfile({ id: profileId, workspaceId });
  await s.createWorkspace({ workspaceId, profileId, brand });

  const people = ["approver", "substitute", "custodian", "member"] as const;
  const logins = new Map<string, string>();
  for (const role of people) {
    const id = randomUUID();
    logins.set(role, id);
    await s.createLoginUser({ id, name: `${brand} ${role}`, email: `load-${index}-${role}@load.test` });
  }
  const opened = await runMust(
    metrics,
    deps,
    { actor: staff.operations, workspaceId },
    {
      type: "open_account",
      payload: {
        clientProfileId: profileId,
        fronts: ["social_instagram", "midia_paga"],
        people: people.map((role) => ({
          name: `${brand} ${role}`,
          role,
          userId: logins.get(role),
          email: `load-${index}-${role}@load.test`,
        })),
      },
    },
    `open_account[${index}]`,
  );
  const accountId = opened.accountId as string;
  const scope = { workspaceId, accountId };
  const rows = await deps.uow.repos.people.list(scope);
  const bound = (role: (typeof people)[number]): Actor => {
    const found = rows.find((person) => person.role === role);
    if (!found) throw new Error(`setup[${index}]: missing person ${role}`);
    return { kind: "client_person", role, personId: found.id };
  };
  const actors: SetupActors = {
    approver: bound("approver"),
    substitute: bound("substitute"),
    custodian: bound("custodian"),
    member: bound("member"),
    ...staff,
    agent: { kind: "agent", agentId: "estrategista" },
    system: { kind: "system", job: "equipe-load" },
  };

  await runMust(metrics, deps, ctxOf(scope, actors.approver),
    { type: "confirm_scope", payload: { scopeDigest: `escopo-${index}` } },
    `confirm_scope[${index}]`);

  const assetId = randomUUID();
  gateway.addAsset({ id: assetId, workspaceId, kind: "brand_guide" });
  await runMust(metrics, deps, ctxOf(scope, actors.custodian),
    { type: "register_material", payload: { assetId, kind: "brand_guide" } },
    `register_material[${index}]`);

  for (const section of ["oferta", "voz"]) {
    const fields = {
      principal: { status: "sustained", value: `${section} ${index}`, source: "brand_guide" },
    } satisfies EquipeContextFields;
    await runMust(metrics, deps, ctxOf(scope, actors.agent),
      { type: "propose_context_section", payload: { section, fields } },
      `propose_context[${index}:${section}]`);
    await runMust(metrics, deps, ctxOf(scope, actors.approver),
      { type: "approve_context_section", payload: { section, expectedVersionHash: contextVersionHash(fields) } },
      `approve_context[${index}:${section}]`);
  }

  const planContent = { month: "2026-10", fronts: ["social_instagram", "midia_paga"], brand };
  await runMust(metrics, deps, ctxOf(scope, actors.agent),
    { type: "propose_plan", payload: { content: planContent } },
    `propose_plan[${index}]`);
  await runMust(metrics, deps, ctxOf(scope, actors.approver),
    { type: "approve_plan", payload: { expectedVersionHash: planVersionHash(planContent) } },
    `approve_plan[${index}]`);

  await runMust(metrics, deps, ctxOf(scope, actors.agent),
    { type: "propose_mandate", payload: { shadow: false } },
    `propose_mandate[${index}]`);
  const mandates = await deps.uow.repos.mandates.list(scope);
  const open = mandates.find((row) => row.status === "proposed");
  if (!open) throw new Error(`setup[${index}]: missing proposed mandate`);
  await runMust(metrics, deps, ctxOf(scope, actors.approver),
    { type: "approve_mandate", payload: { expectedVersionHash: mandateVersionHash(mandateRuleOf(open)) } },
    `approve_mandate[${index}]`);

  const custodianRow = rows.find((person) => person.role === "custodian");
  await deps.uow.repos.connections.create(scope, {
    provider: "instagram",
    encryptedToken: "v1:load-sintetico",
    custodianPersonId: custodianRow?.id ?? null,
    status: "active",
  });

  for (const step of ONBOARDING_STEPS) {
    await runMust(metrics, deps, ctxOf(scope, actors.agent),
      { type: "advance_onboarding", payload: { step } },
      `advance_onboarding[${index}:${step}]`);
  }

  const fronts = await deps.uow.repos.fronts.list(scope);
  const social = fronts.find((front) => front.key === "social_instagram");
  const midia = fronts.find((front) => front.key === "midia_paga");
  if (!social || !midia) throw new Error(`setup[${index}]: missing fronts`);

  // Weekly volume (Anexo A: up to 6 social posts/week).
  const seedWork = async (title: string) => {
    const workId = randomUUID();
    const outputId = randomUUID();
    await s.createCreativeWork({
      workId,
      workspaceId,
      profileId,
      createdBy: logins.get("approver")!,
      title,
    });
    gateway.works.set(workId, { id: workId, workspaceId });
    gateway.addOutput({ id: outputId, workspaceId, workId });
    return { workId, outputId };
  };
  const deliver = async (
    frontId: string,
    title: string,
    approveByAt: Date,
    specs: Array<{ caption: string; scheduledFor: Date; needsConfirmation?: boolean }>,
  ): Promise<Array<{ itemId: string; versionHash: string }>> => {
    const items = [];
    for (const spec of specs) {
      const { workId, outputId } = await seedWork(spec.caption);
      items.push({
        creativeWorkId: workId,
        creativeWorkOutputId: outputId,
        caption: spec.caption,
        destinationAccount: `instagram:@marca${index + 1}`,
        scheduledFor: spec.scheduledFor,
        needsConfirmation: spec.needsConfirmation ?? false,
      });
    }
    const data = await runMust(metrics, deps, ctxOf(scope, actors.agent),
      { type: "deliver_batch", payload: { title, frontId, approveByAt, items } },
      `deliver_batch[${index}:${title}]`);
    const itemIds = data.itemIds as string[];
    const versionHashes = data.versionHashes as string[];
    return itemIds.map((itemId, i) => ({ itemId, versionHash: versionHashes[i]! }));
  };
  const approve = async (item: { itemId: string; versionHash: string }, label: string) => {
    await runMust(metrics, deps, ctxOf(scope, actors.approver),
      { type: "approve_item", payload: { itemId: item.itemId, expectedVersionHash: item.versionHash } },
      `approve_item[${index}:${label}]`);
  };

  const jitter = () => rng.int(0, 20);
  const early = await deliver(social.id, `Social semana 41-A`, spDate(5, 8), [
    { caption: `Segunda ${index}`, scheduledFor: spDate(5, 11, jitter()) },
    { caption: `Terça ${index}`, scheduledFor: spDate(6, 11, jitter()) },
    { caption: `Abandonado ${index}`, scheduledFor: spDate(5, 10, jitter()) },
  ]);
  const late = await deliver(social.id, `Social semana 41-B`, spDate(7, 12), [
    { caption: `Quinta ${index}`, scheduledFor: spDate(8, 11, jitter()) },
    { caption: `Sexta ${index}`, scheduledFor: spDate(9, 11, jitter()) },
    { caption: `Quarta ${index}`, scheduledFor: spDate(7, 15, jitter()), needsConfirmation: true },
  ]);
  // Approved at setup: 3 due in-week. `late[1]` (Friday) is approved in the
  // mid-week burst; `early[2]` stays abandoned (deadlines expire it);
  // `late[2]` is confirmed + approved in the burst.
  await approve(early[0]!, "s1");
  await approve(early[1]!, "s2");
  await approve(late[0]!, "s3");

  const midiaItems = await deliver(midia.id, `Mídia semana 41`, spDate(9, 18), [
    { caption: `Ângulo 1/${index}`, scheduledFor: spDate(12, 11) },
    { caption: `Ângulo 2/${index}`, scheduledFor: spDate(12, 12) },
    { caption: `Ângulo 3/${index}`, scheduledFor: spDate(12, 13) },
  ]);
  await approve(midiaItems[0]!, "m1-future");

  if (index % 5 === 0) {
    await runMust(metrics, deps, ctxOf(scope, actors.quality),
      { type: "record_quality_effort", payload: { frontId: social.id, minutes: 400 } },
      `record_quality_effort[${index}]`);
  }

  return {
    workspaceId,
    accountId,
    brand,
    actors,
    frontIds: { social: social.id, midia: midia.id },
    burstBatch: [late[1]!],
    burstConfirm: late[2]!,
    burstEdit: [midiaItems[1]!],
    burstAdjust: [midiaItems[2]!],
  };
}

export async function setupStaff(s: ScenarioDeps) {
  return seedStaffOnce(s);
}

export { itemVersionHash };
