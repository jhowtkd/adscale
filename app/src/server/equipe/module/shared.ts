// Shared module internals: version hashing, account-status mapping between
// the domain machine and the stored rows, and the transactional writers
// (state + equipe_events + notification intents, all inside one unit of
// work — see commands.ts).

import { createHash } from "node:crypto";
import {
  actorId,
  type AccountStatus,
  type Actor,
  type ClientPersonRole,
  type DomainError,
  err,
  ok,
  type Result,
  type StaffRole,
} from "../domain";
import type {
  AccountScope,
  EquipeAccount,
  EquipeAccountStatus,
  EquipeEvent,
  EquipeReceipt,
  EquipeRepositories,
  InternalEquipeRepositories,
} from "../data";
import type { EquipeModuleDeps } from "./ports";

function canonicalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map((entry) => (entry === undefined ? null : canonicalize(entry)));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry === undefined) continue;
      out[key] = canonicalize(entry);
    }
    return out;
  }
  return value;
}

/** Canonical JSON: sorted keys, Dates as ISO, undefined dropped like JSON. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

/**
 * Content hash stored on receipts (`objectVersion`). An approval is valid
 * only for the exact version the approver saw: same content, same hash.
 */
export function versionHash(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

/** Stored row status → domain machine status. */
export function toDomainAccountStatus(status: string): AccountStatus | null {
  switch (status) {
    case "deploying":
      return "implantation";
    case "paused":
      return "implantation_paused";
    case "calibrating":
      return "calibrating";
    case "active":
      return "active";
    case "suspended":
      return "suspended";
    case "closed":
      return "closed";
    default:
      return null;
  }
}

/** Domain machine status → stored row status. */
export function fromDomainAccountStatus(status: AccountStatus): EquipeAccountStatus {
  switch (status) {
    case "implantation":
      return "deploying";
    case "implantation_paused":
      return "paused";
    case "calibrating":
      return "calibrating";
    case "active":
      return "active";
    case "suspended":
      return "suspended";
    case "closed":
      return "closed";
    case "scope_decision":
      throw new Error("scope_decision has no stored account status");
  }
}

export type CommandContext = {
  repos: EquipeRepositories;
  internal: InternalEquipeRepositories;
  actor: Actor;
  workspaceId: string;
  accountId: string;
  now: Date;
  /** Events persisted by this command, in creation order. */
  events: EquipeEvent[];
};

export function scopeOf(ctx: Pick<CommandContext, "workspaceId" | "accountId">): AccountScope {
  return { workspaceId: ctx.workspaceId, accountId: ctx.accountId };
}

function actorFields(actor: Actor): { actorType: Actor["kind"]; actorId: string; actorRole: string } {
  const actorRole =
    actor.kind === "client_person" || actor.kind === "staff" ? actor.role : actor.kind;
  return { actorType: actor.kind, actorId: actorId(actor), actorRole };
}

export async function appendEvent(
  ctx: CommandContext,
  input: { eventType: string; objectType?: string; objectId?: string; payload?: unknown },
): Promise<EquipeEvent> {
  const fields = actorFields(ctx.actor);
  const event = await ctx.repos.events.create(scopeOf(ctx), {
    actorType: fields.actorType,
    actorId: fields.actorId,
    actorRole: fields.actorRole,
    eventType: input.eventType,
    objectType: input.objectType,
    objectId: input.objectId,
    payload: input.payload ?? null,
    occurredAt: ctx.now,
  });
  ctx.events.push(event);
  return event;
}

/**
 * Effect intent for this ticket: a `notification.requested` event with the
 * recipient role and template key. A later job (#549) delivers these; the
 * Notifier port is never called inside the transaction.
 */
export async function requestNotification(
  ctx: CommandContext,
  input: { recipientRole: string; templateKey: string; detail?: unknown },
): Promise<EquipeEvent> {
  return appendEvent(ctx, {
    eventType: "notification.requested",
    payload: {
      recipientRole: input.recipientRole,
      templateKey: input.templateKey,
      ...(input.detail === undefined ? {} : { detail: input.detail }),
    },
  });
}

/** Immutable receipt: person, role, object, version hash, action, time. */
export async function writeReceipt(
  ctx: CommandContext,
  input: {
    objectType: string;
    objectId: string;
    objectVersion: string;
    action: string;
    detail?: unknown;
  },
): Promise<EquipeReceipt> {
  const fields = actorFields(ctx.actor);
  return ctx.repos.receipts.create(scopeOf(ctx), {
    personKind: fields.actorType,
    personId: fields.actorId,
    personRole: fields.actorRole,
    objectType: input.objectType,
    objectId: input.objectId,
    objectVersion: input.objectVersion,
    action: input.action,
    detail: input.detail ?? null,
  });
}

export async function loadAccountOrError(ctx: CommandContext): Promise<Result<EquipeAccount>> {
  const account = await ctx.repos.accounts.get(ctx.workspaceId, ctx.accountId);
  if (!account) {
    return err("unknown_account", `unknown account ${ctx.accountId}`);
  }
  return ok(account);
}

/** Implantação commands run while the account is deploying (implantação). */
export function requireDeploying(account: EquipeAccount): Result<void> {
  if (account.status !== "deploying") {
    return err(
      "invalid_transition",
      `account is ${account.status}, implantation commands require deploying`,
    );
  }
  return ok(undefined);
}

export type TxBase = {
  actor: Actor;
  workspaceId: string;
  /** Empty for open_account; the handler sets it after creating the account. */
  accountId: string;
  now: Date;
};

export type CommandSuccess = {
  accountId: string;
  events: EquipeEvent[];
  data: Record<string, unknown>;
};

/**
 * Thrown INSIDE the unit of work to roll back a command that fails with a
 * domain error; `transact` converts it back to an err Result outside.
 * Anything else thrown also rolls back but propagates to the caller.
 */
export class CommandRolledBack {
  constructor(readonly error: DomainError) {}
}

/**
 * Bind the claimed actor to a stored row, inside the command's transaction.
 * A client_person must be an active person of THIS account holding the
 * claimed role; staff must be an active equipe_staff row holding the claimed
 * role (a platform owner holding several roles is just several rows).
 * Agent and system actors have no table and pass through. The returned
 * actor — person and role from the row — is what receipts record.
 */
export async function bindActor(ctx: CommandContext): Promise<Result<Actor>> {
  const actor = ctx.actor;
  if (actor.kind === "agent" || actor.kind === "system") return ok(actor);
  if (actor.kind === "client_person") {
    const person = await ctx.repos.people.get(scopeOf(ctx), actor.personId);
    if (!person) {
      return err("forbidden_actor", `unknown person ${actor.personId} on account ${ctx.accountId}`);
    }
    if (!person.active) {
      return err("forbidden_actor", `person ${actor.personId} is inactive`);
    }
    if (person.role !== actor.role) {
      return err(
        "forbidden_actor",
        `person ${actor.personId} holds role ${person.role}, not ${actor.role}`,
      );
    }
    return ok({
      kind: "client_person",
      role: person.role as ClientPersonRole,
      personId: person.id,
    });
  }
  const member = await ctx.internal.staff.get(actor.staffId);
  if (!member) {
    return err("forbidden_actor", `unknown staff ${actor.staffId}`);
  }
  if (!member.active) {
    return err("forbidden_actor", `staff ${actor.staffId} is inactive`);
  }
  if (member.role !== actor.role) {
    return err("forbidden_actor", `staff ${actor.staffId} does not hold role ${actor.role}`);
  }
  return ok({ kind: "staff", role: member.role as StaffRole, staffId: member.id });
}

/**
 * One transaction per command: bind the actor, then the handler loads
 * state, decides with the pure domain, writes state + equipe_events +
 * notification intents. A domain-error return rolls everything back;
 * unexpected throws do too.
 */
export async function transact(
  deps: EquipeModuleDeps,
  base: TxBase,
  fn: (ctx: CommandContext) => Promise<Result<Record<string, unknown>>>,
): Promise<Result<CommandSuccess>> {
  const ctx: CommandContext = {
    repos: deps.uow.repos,
    internal: deps.uow.internal,
    ...base,
    events: [],
  };
  try {
    const data = await deps.uow.run(async (repos, internal) => {
      ctx.repos = repos;
      ctx.internal = internal;
      const bound = await bindActor(ctx);
      if (!bound.ok) throw new CommandRolledBack(bound.error);
      ctx.actor = bound.value;
      const outcome = await fn(ctx);
      if (!outcome.ok) throw new CommandRolledBack(outcome.error);
      return outcome.value;
    });
    return ok({ accountId: ctx.accountId, events: ctx.events, data });
  } catch (thrown) {
    if (thrown instanceof CommandRolledBack) {
      return err(thrown.error.code, thrown.error.message);
    }
    throw thrown;
  }
}
