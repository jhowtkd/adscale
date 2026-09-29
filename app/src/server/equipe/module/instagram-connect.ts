// Instagram connection commands (#548): the OAuth callback records its
// outcome through these — success upserts the Equipe's own connection
// (encrypted token bundle + custodian + active state), failure records a
// plain-language error. After two failures since the last success, a support
// exception opens with the "conexão travada" trigger; denials at the
// provider never reach here (the route redirects without recording).

import { z } from "zod";
import { err, ok, type Result } from "../domain";
import type { AccountScope, EquipeAccountPerson, EquipeRepositories } from "../data";
import type { EquipeModuleDeps } from "./ports";
import {
  completeInstagramConnectPayloadSchema,
  failInstagramConnectPayloadSchema,
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
import { createExceptionInternal } from "./exceptions";
import { instagramFailureMessage } from "../publishing/connection-errors";
import { decryptEquipeIgToken, EquipeIgCryptoError } from "../publishing/crypto";
import { holdInstagramDestination, instagramIdentityOf } from "./instagram-destination";

export type CompleteInstagramConnectPayload = z.infer<typeof completeInstagramConnectPayloadSchema>;
export type FailInstagramConnectPayload = z.infer<typeof failInstagramConnectPayloadSchema>;

export const CONNECTION_CONNECTED_EVENT = "connection.connected";
export const CONNECTION_FAILED_EVENT = "connection.failed";

/** Failures since the last success that open a "conexão travada" exception. */
export const CONNECTION_FAILURES_BEFORE_EXCEPTION = 2;

export const INSTAGRAM_PROVIDER = "instagram";

/**
 * The session user behind the connect route, bound to the account's
 * custodian row. Only an active custodian holding a user link starts OAuth.
 */
export async function findCustodianPersonForUser(
  repos: EquipeRepositories,
  scope: AccountScope,
  userId: string,
): Promise<EquipeAccountPerson | null> {
  const people = await repos.people.list(scope);
  return (
    people.find((person) => person.active && person.role === "custodian" && person.userId === userId) ??
    null
  );
}

function custodianPersonIdOf(ctx: CommandContext): string {
  return ctx.actor.kind === "client_person" ? ctx.actor.personId : "";
}

/**
 * The OAuth callback exchanges the code and resolves the IG account first;
 * this command stores the outcome: encrypted token bundle, custodian owner,
 * active state. Reconnects overwrite the token without recreating the row.
 */
export async function runCompleteInstagramConnect(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: CompleteInstagramConnectPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const scope = scopeOf(ctx);
    let identity;
    try {
      identity = decryptEquipeIgToken(payload.encryptedToken);
    } catch (error) {
      if (error instanceof EquipeIgCryptoError) return err("invalid_token", "credencial do Instagram inválida");
      throw error;
    }
    const existing = (await ctx.repos.connections.list(scope)).find(
      (row) => row.provider === INSTAGRAM_PROVIDER,
    );
    const previousIgUserId = instagramIdentityOf(existing ?? null)?.igUserId ?? null;
    const custodianPersonId = custodianPersonIdOf(ctx);
    let connectionId: string;
    if (existing) {
      await ctx.repos.connections.update(scope, existing.id, {
        encryptedToken: payload.encryptedToken,
        custodianPersonId,
        status: "active",
        lastError: null,
        lastRefreshedAt: ctx.now,
      });
      connectionId = existing.id;
    } else {
      const created = await ctx.repos.connections.create(scope, {
        provider: INSTAGRAM_PROVIDER,
        encryptedToken: payload.encryptedToken,
        custodianPersonId,
        status: "active",
      });
      connectionId = created.id;
    }
    if (previousIgUserId !== identity.igUserId) {
      const intents = await ctx.repos.intents.list(scope, { status: ["pending", "held"] });
      for (const candidate of intents.sort((a, b) => a.itemId.localeCompare(b.itemId))) {
        if (candidate.destinationIgUserId === identity.igUserId) continue;
        const item = await ctx.repos.items.get(scope, candidate.itemId, { forUpdate: true });
        const intent = await ctx.repos.intents.get(scope, candidate.id);
        if (!intent || !["pending", "held"].includes(intent.status)) continue;
        if (item && (item.status === "scheduled" || item.status === "held")) {
          await holdInstagramDestination(ctx, item, intent);
        }
      }
    }
    await appendEvent(ctx, {
      eventType: CONNECTION_CONNECTED_EVENT,
      objectType: "connection",
      objectId: connectionId,
      payload: {
        provider: INSTAGRAM_PROVIDER,
        reconnected: existing != null,
        igUsername: identity.igUsername,
        igUserId: identity.igUserId,
        previousIgUserId,
      },
    });
    await requestNotification(ctx, {
      recipientRole: "strategist",
      templateKey: "connection.connected",
      detail: { connectionId, reconnected: existing != null },
    });
    return ok({ connectionId, reconnected: existing != null });
  });
}

/**
 * The OAuth callback failed (exchange error, no IG account, provider
 * error): record it in plain language on the row (when one exists) and on
 * the event log. The second failure since the last success opens a support
 * exception ("conexão travada") — once, while one is already open.
 */
export async function runFailInstagramConnect(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: FailInstagramConnectPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const scope = scopeOf(ctx);
    const custodian = custodianPersonIdOf(ctx)
      ? await ctx.repos.people.get(scope, custodianPersonIdOf(ctx))
      : null;
    const message = instagramFailureMessage(payload.code, custodian?.name ?? null);
    const existing = (await ctx.repos.connections.list(scope)).find(
      (row) => row.provider === INSTAGRAM_PROVIDER,
    );
    if (existing) {
      await ctx.repos.connections.update(scope, existing.id, {
        status: "error",
        lastError: message,
      });
    }
    await appendEvent(ctx, {
      eventType: CONNECTION_FAILED_EVENT,
      objectType: "connection",
      objectId: existing?.id,
      payload: { provider: INSTAGRAM_PROVIDER, code: payload.code, message },
    });
    const failures = await countFailuresSinceConnected(ctx);
    let exceptionId: string | null = null;
    if (failures >= CONNECTION_FAILURES_BEFORE_EXCEPTION) {
      const open = (await ctx.repos.exceptions.list(scope)).some(
        (row) =>
          row.trigger === "stuck_connection" && (row.status === "open" || row.status === "claimed"),
      );
      if (!open) {
        const exception = await createExceptionInternal(ctx, {
          trigger: "stuck_connection",
          reason: `conexão do Instagram falhou ${failures} vezes: ${message}`,
        });
        if (!exception.ok) return exception;
        exceptionId = exception.value.id;
      }
    }
    return ok({ failures, exceptionId, connectionId: existing?.id ?? null });
  });
}

async function countFailuresSinceConnected(ctx: CommandContext): Promise<number> {
  const events = await ctx.repos.events.list(scopeOf(ctx));
  let failures = 0;
  for (const event of events) {
    if (event.eventType === CONNECTION_CONNECTED_EVENT) {
      failures = 0;
    } else if (event.eventType === CONNECTION_FAILED_EVENT) {
      failures += 1;
    }
  }
  return failures;
}
