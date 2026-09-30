// Exceções de atendimento (#547): the only place human support works. Open
// from the flow-4 triggers, assume (a named person joins), post staff
// messages and register off-app contacts in the conversation, close handing
// back to the AI. post_staff_message is the internal, role-guarded command:
// the conversation ticket (#551) only renders its event. First-response SLA
// comes from the domain `firstResponseSla` plus the business-day calendar.

import { z } from "zod";
import {
  actorId,
  addBusinessDays,
  assumeSupportException,
  closeSupportException,
  err,
  firstResponseSla,
  ok,
  type Result,
  type SupportExceptionCloseReason,
  type SupportExceptionState,
  type SupportExceptionTrigger,
} from "../domain";
import type { EquipeException } from "../data";
import type { EquipeModuleDeps } from "./ports";
import { hasRecordedDiagnostic } from "../agents/free-budget";
import {
  assumeExceptionPayloadSchema,
  closeExceptionPayloadSchema,
  openExceptionPayloadSchema,
  postStaffMessagePayloadSchema,
  registerContactPayloadSchema,
  requestSupportPayloadSchema,
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

export const SUPPORT_EXCEPTION_OPENED_EVENT = "support_exception.opened";
export const SUPPORT_EXCEPTION_ASSUMED_EVENT = "support_exception.assumed";
export const STAFF_MESSAGE_POSTED_EVENT = "staff.message_posted";
export const STAFF_CONTACT_REGISTERED_EVENT = "staff.contact_registered";
export const SUPPORT_EXCEPTION_CLOSED_EVENT = "support_exception.closed";

export type OpenExceptionPayload = z.infer<typeof openExceptionPayloadSchema>;
export type RequestSupportPayload = z.infer<typeof requestSupportPayloadSchema>;
export type AssumeExceptionPayload = z.infer<typeof assumeExceptionPayloadSchema>;
export type PostStaffMessagePayload = z.infer<typeof postStaffMessagePayloadSchema>;
export type RegisterContactPayload = z.infer<typeof registerContactPayloadSchema>;
export type CloseExceptionPayload = z.infer<typeof closeExceptionPayloadSchema>;

function domainStateOf(row: EquipeException): SupportExceptionState {
  return {
    status: row.status === "claimed" ? "in_progress" : row.status === "open" ? "open" : "closed",
    trigger: row.trigger as SupportExceptionTrigger,
    assignee: row.assigneeId,
  };
}

/** First-response due date: 2 h, or 1 business day on the SP calendar. */
export function exceptionDueAt(trigger: SupportExceptionTrigger, now: Date): Date {
  const sla = firstResponseSla(trigger);
  if ("hours" in sla) {
    return new Date(now.getTime() + sla.hours * 3_600_000);
  }
  return addBusinessDays(now, sla.businessDays);
}

export type CreateExceptionInput = {
  trigger: SupportExceptionTrigger;
  reason?: string | null;
  sourceEventId?: string;
  escalationId?: string;
  itemId?: string;
  workId?: string | null;
  roundId?: string;
};

/**
 * Open the row + event + support notification. Shared by the explicit open
 * commands, the client "talk to a person" button, and the escalation side
 * effects (critical incidents auto-open one alongside the escalation).
 */
export async function createExceptionInternal(
  ctx: CommandContext,
  input: CreateExceptionInput,
): Promise<Result<EquipeException>> {
  const scope = scopeOf(ctx);
  const dueAt = exceptionDueAt(input.trigger, ctx.now);
  const row = await ctx.repos.exceptions.create(scope, {
    trigger: input.trigger,
    reason: input.reason ?? null,
    dueAt,
  });
  await appendEvent(ctx, {
    eventType: SUPPORT_EXCEPTION_OPENED_EVENT,
    objectType: "exception",
    objectId: row.id,
    payload: {
      trigger: input.trigger,
      reason: input.reason ?? null,
      dueAt: dueAt.toISOString(),
      ...(input.itemId ? { itemId: input.itemId, workId: input.workId } : {}),
      ...(input.roundId ? { roundId: input.roundId } : {}),
      ...(input.sourceEventId ? { sourceEventId: input.sourceEventId } : {}),
      ...(input.escalationId ? { escalationId: input.escalationId } : {}),
    },
  });
  await requestNotification(ctx, {
    recipientRole: "support",
    templateKey: "exception.opened",
    detail: { exceptionId: row.id, trigger: input.trigger },
  });
  return ok(row);
}

async function loadExceptionOrError(
  ctx: CommandContext,
  exceptionId: string,
): Promise<Result<EquipeException>> {
  const row = await ctx.repos.exceptions.get(scopeOf(ctx), exceptionId);
  if (!row) return err("unknown_exception", `unknown exception ${exceptionId}`);
  return ok(row);
}

/**
 * Open from a flow-4 trigger. Agent/system open their own triggers; the
 * client-requested trigger belongs to `request_support` (support may still
 * open it for a client who called outside the app).
 */
export async function runOpenException(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: OpenExceptionPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    if (
      payload.trigger === "client_requested_person" &&
      (ctx.actor.kind === "agent" || ctx.actor.kind === "system")
    ) {
      return err(
        "use_request_support",
        "client_requested_person opens through the client request_support command",
      );
    }
    const created = await createExceptionInternal(ctx, {
      trigger: payload.trigger,
      reason: payload.reason,
    });
    if (!created.ok) return created;
    return ok({ exceptionId: created.value.id, dueAt: created.value.dueAt });
  });
}

/** The client asks for a person, in any screen, without justifying. */
export async function runRequestSupport(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: RequestSupportPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    if (payload.purpose === "plan" && !(await hasRecordedDiagnostic(ctx.repos, scopeOf(ctx)))) {
      return err("invalid_transition", "plan contact requires a recorded diagnosis");
    }
    const reason = payload.note ?? (payload.purpose === "plan" ? "Quero falar com vocês sobre o plano." : null);
    if (payload.purpose === "plan") {
      await ctx.repos.accounts.get(ctx.workspaceId, ctx.accountId, { forUpdate: true });
      const existing = (await ctx.repos.exceptions.list(scopeOf(ctx))).find((row) =>
        row.trigger === "out_of_contract_request" && row.reason === reason && row.status !== "closed");
      if (existing) return ok({ exceptionId: existing.id, dueAt: existing.dueAt });
    }
    const created = await createExceptionInternal(ctx, {
      trigger: payload.purpose === "plan" ? "out_of_contract_request" : "client_requested_person",
      reason,
    });
    if (!created.ok) return created;
    return ok({ exceptionId: created.value.id, dueAt: created.value.dueAt });
  });
}

/** A support person joins the conversation, with name and photo in the UI. */
export async function runAssumeException(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: AssumeExceptionPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const loaded = await loadExceptionOrError(ctx, payload.exceptionId);
    if (!loaded.ok) return loaded;
    const decided = assumeSupportException(domainStateOf(loaded.value), actorId(ctx.actor));
    if (!decided.ok) return decided;
    await ctx.repos.exceptions.update(scopeOf(ctx), loaded.value.id, {
      status: "claimed",
      assigneeId: actorId(ctx.actor),
    });
    await appendEvent(ctx, {
      eventType: SUPPORT_EXCEPTION_ASSUMED_EVENT,
      objectType: "exception",
      objectId: loaded.value.id,
      payload: { staffId: actorId(ctx.actor) },
    });
    await requestNotification(ctx, {
      recipientRole: "approver",
      templateKey: "exception.assumed",
      detail: { exceptionId: loaded.value.id, staffId: actorId(ctx.actor) },
    });
    return ok({ exceptionId: loaded.value.id, staffId: actorId(ctx.actor) });
  });
}

/**
 * A support message inside an open case. The event is the delivery: #551
 * renders it in the conversation, so no notification intent is recorded.
 */
export async function runPostStaffMessage(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: PostStaffMessagePayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const loaded = await loadExceptionOrError(ctx, payload.exceptionId);
    if (!loaded.ok) return loaded;
    if (loaded.value.status !== "open" && loaded.value.status !== "claimed") {
      return err(
        "invalid_transition",
        `cannot post to exception ${loaded.value.id} from ${loaded.value.status}`,
      );
    }
    const staff = await ctx.internal.staff.get(actorId(ctx.actor));
    const event = await appendEvent(ctx, {
      eventType: STAFF_MESSAGE_POSTED_EVENT,
      objectType: "exception",
      objectId: loaded.value.id,
      payload: { body: payload.body, staffId: actorId(ctx.actor), staffName: staff?.displayName },
    });
    return ok({ exceptionId: loaded.value.id, messageEventId: event.id });
  });
}

/**
 * Contact outside the app (call, WhatsApp, in person) lands in the
 * conversation with what was agreed. Support never approves nor confirms
 * facts for the client (actors.ts grants them neither action).
 */
export async function runRegisterContact(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: RegisterContactPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const loaded = await loadExceptionOrError(ctx, payload.exceptionId);
    if (!loaded.ok) return loaded;
    if (loaded.value.status !== "open" && loaded.value.status !== "claimed") {
      return err(
        "invalid_transition",
        `cannot register contact on exception ${loaded.value.id} from ${loaded.value.status}`,
      );
    }
    const attempts = loaded.value.attempts + 1;
    await ctx.repos.exceptions.update(scopeOf(ctx), loaded.value.id, { attempts });
    await appendEvent(ctx, {
      eventType: STAFF_CONTACT_REGISTERED_EVENT,
      objectType: "exception",
      objectId: loaded.value.id,
      payload: {
        channel: payload.channel,
        summary: payload.summary,
        attempts,
        staffId: actorId(ctx.actor),
      },
    });
    return ok({ exceptionId: loaded.value.id, attempts });
  });
}

/** Close with a reason and hand the account back to the Strategist IA. */
export async function runCloseException(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: CloseExceptionPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const loaded = await loadExceptionOrError(ctx, payload.exceptionId);
    if (!loaded.ok) return loaded;
    const decided = closeSupportException(
      domainStateOf(loaded.value),
      payload.reason as SupportExceptionCloseReason,
    );
    if (!decided.ok) return decided;
    await ctx.repos.exceptions.update(scopeOf(ctx), loaded.value.id, {
      status: "closed",
      resolvedAt: ctx.now,
    });
    await appendEvent(ctx, {
      eventType: SUPPORT_EXCEPTION_CLOSED_EVENT,
      objectType: "exception",
      objectId: loaded.value.id,
      payload: { reason: payload.reason, handedBackTo: "strategist" },
    });
    await requestNotification(ctx, {
      recipientRole: "strategist",
      templateKey: "exception.closed",
      detail: { exceptionId: loaded.value.id, reason: payload.reason },
    });
    return ok({ exceptionId: loaded.value.id, reason: payload.reason });
  });
}
