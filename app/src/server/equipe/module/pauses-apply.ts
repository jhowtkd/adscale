// Pausas (#547), apply side: client, team, content-incident, connection,
// execution suspension and delinquency. Stacked pauses: the most restrictive
// wins and the front only returns when every covering pause is lifted.
// Resume + revalidation live in ./pauses-resume.
//
// (#583) The per-account `global_stop` row is gone: stopping is global now
// (./global-stop), and old rows stay resumable through resume_pause.

import { z } from "zod";
import {
  actorId,
  err,
  holdItem,
  ok,
  type PauseLevel,
  type PauseOrigin,
  type Result,
} from "../domain";
import type { AccountScope, EquipePause } from "../data";
import type { EquipeModuleDeps } from "./ports";
import {
  pauseAccountTeamPayloadSchema,
  pauseConnectionPayloadSchema,
  pauseDelinquencyPayloadSchema,
  pauseFrontContentPayloadSchema,
  pausePublicationsPayloadSchema,
  suspendExecutionPayloadSchema,
} from "./envelope";
import {
  appendEvent,
  loadAccountOrError,
  requestNotification,
  scopeOf,
  transact,
  type CommandContext,
  type CommandSuccess,
  type TxBase,
} from "./shared";

export const PAUSE_APPLIED_EVENT = "pause.applied";
export const ITEM_HELD_EVENT = "item.held";

export type PausePublicationsPayload = z.infer<typeof pausePublicationsPayloadSchema>;
export type PauseAccountTeamPayload = z.infer<typeof pauseAccountTeamPayloadSchema>;
export type PauseFrontContentPayload = z.infer<typeof pauseFrontContentPayloadSchema>;
export type PauseConnectionPayload = z.infer<typeof pauseConnectionPayloadSchema>;
export type SuspendExecutionPayload = z.infer<typeof suspendExecutionPayloadSchema>;
export type PauseDelinquencyPayload = z.infer<typeof pauseDelinquencyPayloadSchema>;

// Stored levels (publishing/execution/billing) vs domain levels
// (publication/execution/delinquency).
const STORED_LEVEL_OF: Record<PauseLevel, string> = {
  publication: "publishing",
  execution: "execution",
  delinquency: "billing",
};

const LEVEL_OF_ORIGIN: Record<PauseOrigin, PauseLevel> = {
  client: "publication",
  team: "publication",
  content_incident: "publication",
  connection: "publication",
  global_stop: "publication",
  security: "execution",
  delinquency: "delinquency",
};

function resumableByFor(origin: PauseOrigin, ctx: CommandContext): string {
  switch (origin) {
    case "client":
      return "client";
    case "team":
      return `staff:${actorId(ctx.actor)}`;
    case "content_incident":
      return "quality";
    case "connection":
      return "system";
    case "global_stop":
      return "operations";
    case "security":
      return "operations";
    case "delinquency":
      return "system";
  }
}

function notifyRoleFor(origin: PauseOrigin): string {
  return origin === "security" || origin === "global_stop" ? "operations" : "strategist";
}

export type ApplyPauseInput = {
  origin: PauseOrigin;
  /** Front scope; null for account scope. */
  frontId?: string | null;
  // (#583) No "global" scope anymore: stopping is global (./global-stop),
  // never an account-scoped row. Old rows keep their stored value.
  scope: "account" | "front";
  reason?: string | null;
  escalationId?: string;
  connectionId?: string;
  /** Connections isolated through this suspension (kept, never revoked). */
  isolatedConnectionIds?: string[];
};

/**
 * Create a pause row and hold what it covers. Shared by the explicit pause
 * commands and the escalation side effects: when the same pause is already
 * active it is reused (`created: false`) and the explicit commands turn that
 * into `pause_already_active`.
 */
export async function applyPauseInternal(
  ctx: CommandContext,
  input: ApplyPauseInput,
): Promise<Result<{ pause: EquipePause; created: boolean; heldItemIds: string[] }>> {
  const scope = scopeOf(ctx);
  // Serialize suspension with the execution gate used by delivery/claim commands.
  await ctx.repos.accounts.get(scope.workspaceId, scope.accountId, { forUpdate: true });
  const frontId = input.scope === "front" ? (input.frontId ?? null) : null;
  const active = (await ctx.repos.pauses.list(scope)).filter((row) => row.status === "active");
  const existing = active.find(
    (row) => row.origin === input.origin && row.scope === input.scope && (row.frontId ?? null) === frontId,
  );
  if (existing) {
    return ok({ pause: existing, created: false, heldItemIds: [] });
  }
  const pause = await ctx.repos.pauses.create(scope, {
    frontId,
    level: STORED_LEVEL_OF[LEVEL_OF_ORIGIN[input.origin]] as "publishing" | "execution" | "billing",
    scope: input.scope,
    origin: input.origin,
    resumableBy: resumableByFor(input.origin, ctx),
    reason: input.reason ?? null,
  });
  const heldItemIds = await holdScheduledItems(ctx, scope, frontId);
  await appendEvent(ctx, {
    eventType: PAUSE_APPLIED_EVENT,
    objectType: "pause",
    objectId: pause.id,
    payload: {
      origin: input.origin,
      level: pause.level,
      scope: input.scope,
      frontId,
      heldItemIds,
      ...(input.escalationId ? { escalationId: input.escalationId } : {}),
      ...(input.connectionId ? { connectionId: input.connectionId } : {}),
      ...(input.isolatedConnectionIds?.length
        ? { isolatedConnectionIds: input.isolatedConnectionIds }
        : {}),
    },
  });
  await requestNotification(ctx, {
    recipientRole: notifyRoleFor(input.origin),
    templateKey: "pause.applied",
    detail: { pauseId: pause.id, origin: input.origin, heldItemIds },
  });
  return ok({ pause, created: true, heldItemIds });
}

/**
 * Every pause level holds the scheduled items it covers ("segurados") and
 * holds their pending dispatch intents; awaiting items keep their state —
 * production, review and approval continue under a publication pause.
 */
async function holdScheduledItems(
  ctx: CommandContext,
  scope: AccountScope,
  frontId: string | null,
): Promise<string[]> {
  const items = await ctx.repos.items.list(scope, frontId ? { frontId } : undefined);
  const held: string[] = [];
  for (const item of items) {
    if (item.status !== "scheduled") continue;
    const decided = holdItem(
      { status: "scheduled", currentVersion: item.currentVersionHash ?? "", approvedVersion: null },
      "pause",
    );
    if (!decided.ok) continue;
    await ctx.repos.items.update(scope, item.id, { status: decided.value.state.status });
    const intents = await ctx.repos.intents.list(scope, { itemId: item.id, status: "pending" });
    for (const intent of intents) {
      await ctx.repos.intents.update(scope, intent.id, { status: "held" });
    }
    await appendEvent(ctx, {
      eventType: ITEM_HELD_EVENT,
      objectType: "item",
      objectId: item.id,
      payload: { reason: "pause", heldIntentIds: intents.map((intent) => intent.id) },
    });
    held.push(item.id);
  }
  return held;
}

async function applyExplicitPause(
  deps: EquipeModuleDeps,
  base: TxBase,
  input: ApplyPauseInput & { frontMustExist?: string; connectionMustExist?: string },
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    if (input.frontMustExist) {
      const front = await ctx.repos.fronts.get(scopeOf(ctx), input.frontMustExist);
      if (!front) return err("unknown_front", `unknown front ${input.frontMustExist}`);
    }
    if (input.connectionMustExist) {
      const connection = await ctx.repos.connections.get(scopeOf(ctx), input.connectionMustExist);
      if (!connection) return err("unknown_connection", `unknown connection ${input.connectionMustExist}`);
    }
    const applied = await applyPauseInternal(ctx, input);
    if (!applied.ok) return applied;
    if (!applied.value.created) {
      return err("pause_already_active", "this pause is already active");
    }
    return ok({ pauseId: applied.value.pause.id, heldItemIds: applied.value.heldItemIds });
  });
}

/** The client pauses their own account's publications (only they resume). */
export async function runPausePublications(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: PausePublicationsPayload,
): Promise<Result<CommandSuccess>> {
  return applyExplicitPause(deps, base, {
    origin: "client",
    scope: "account",
    reason: payload.reason,
  });
}

/** Support/operations pause the account inside an exception. */
export async function runPauseAccountTeam(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: PauseAccountTeamPayload,
): Promise<Result<CommandSuccess>> {
  return applyExplicitPause(deps, base, {
    origin: "team",
    scope: "account",
    reason: payload.reason,
  });
}

/** Quality (or the system, on a critical escalation) pauses the front. */
export async function runPauseFrontContent(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: PauseFrontContentPayload,
): Promise<Result<CommandSuccess>> {
  return applyExplicitPause(deps, base, {
    origin: "content_incident",
    scope: "front",
    frontId: payload.frontId,
    frontMustExist: payload.frontId,
    reason: payload.reason,
  });
}

/** Automatic pause while a connection is down. */
export async function runPauseConnection(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: PauseConnectionPayload,
): Promise<Result<CommandSuccess>> {
  return applyExplicitPause(deps, base, {
    origin: "connection",
    scope: "account",
    reason: payload.reason,
    connectionId: payload.connectionId,
    connectionMustExist: payload.connectionId,
  });
}

/**
 * Execution suspension (security / cross-account): scheduled items hold and
 * the listed connections are isolated through the suspension — no dispatch,
 * no provider calls with them while it lasts. Their stored status is left
 * untouched: revocation forces the client to reconnect, so it stays an
 * explicit operations decision (`revoke_connection`). The #549 job fans this
 * out to every affected account; the command itself is account-scoped.
 */
export async function runSuspendExecution(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: SuspendExecutionPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const scope = scopeOf(ctx);
    for (const connectionId of payload.connectionIds) {
      const connection = await ctx.repos.connections.get(scope, connectionId);
      if (!connection) return err("unknown_connection", `unknown connection ${connectionId}`);
    }
    const applied = await applyPauseInternal(ctx, {
      origin: "security",
      scope: "account",
      reason: payload.reason,
      isolatedConnectionIds: payload.connectionIds,
    });
    if (!applied.ok) return applied;
    if (!applied.value.created) {
      return err("pause_already_active", "execution is already suspended");
    }
    return ok({
      pauseId: applied.value.pause.id,
      heldItemIds: applied.value.heldItemIds,
      isolatedConnectionIds: payload.connectionIds,
    });
  });
}

/** Automatic suspension for delinquency, per the contract. */
export async function runPauseDelinquency(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: PauseDelinquencyPayload,
): Promise<Result<CommandSuccess>> {
  return applyExplicitPause(deps, base, {
    origin: "delinquency",
    scope: "account",
    reason: payload.reason,
  });
}
