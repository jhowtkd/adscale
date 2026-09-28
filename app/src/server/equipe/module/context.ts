// Step 3 of the implantação flow: the versioned marketing Context.
// The agent proposes each section; the approver/substitute approves it per
// section (receipt with the section version hash); conflicts become short
// questions the client answers in the conversation.

import { z } from "zod";
import { err, ok, type Result } from "../domain";
import type { EquipeContextFields, EquipeContextVersion } from "../data";
import type { EquipeModuleDeps } from "./ports";
import {
  answerConflictPayloadSchema,
  approveContextSectionPayloadSchema,
  proposeContextSectionPayloadSchema,
} from "./envelope";
import {
  appendEvent,
  loadAccountOrError,
  requestNotification,
  requireDeploying,
  scopeOf,
  transact,
  versionHash,
  writeReceipt,
  type CommandContext,
  type CommandSuccess,
  type TxBase,
} from "./shared";

export type ProposeContextSectionPayload = z.infer<typeof proposeContextSectionPayloadSchema>;
export type ApproveContextSectionPayload = z.infer<typeof approveContextSectionPayloadSchema>;
export type AnswerConflictPayload = z.infer<typeof answerConflictPayloadSchema>;

/** A conflict is an unknown field whose source carries the open question. */
export const CONFLICT_SOURCE_PREFIX = "conflict:";

export const CONTEXT_SECTION_PROPOSED_EVENT = "context_section.proposed";
export const CONTEXT_SECTION_APPROVED_EVENT = "context_section.approved";
export const CONTEXT_CONFLICT_ANSWERED_EVENT = "context.conflict_answered";

/** Hash of the canonical section fields; stored on the approval receipt. */
export function contextVersionHash(fields: EquipeContextFields): string {
  return versionHash(fields);
}

function latestByVersion(versions: EquipeContextVersion[]): EquipeContextVersion | null {
  let best: EquipeContextVersion | null = null;
  for (const version of versions) {
    if (!best || version.version > best.version) best = version;
  }
  return best;
}

async function supersedeProposed(
  ctx: CommandContext,
  section: string,
): Promise<void> {
  const scope = scopeOf(ctx);
  const versions = await ctx.repos.contexts.list(scope);
  for (const version of versions) {
    if (version.section === section && version.status === "proposed") {
      await ctx.repos.contexts.update(scope, version.id, { status: "superseded" });
    }
  }
}

/** The agent proposes section v(n+1); an open proposal is superseded. */
export async function runProposeContextSection(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: ProposeContextSectionPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const deploying = requireDeploying(account.value);
    if (!deploying.ok) return deploying;
    const scope = scopeOf(ctx);
    const existing = (await ctx.repos.contexts.list(scope)).filter(
      (version) => version.section === payload.section,
    );
    const nextVersion = (latestByVersion(existing)?.version ?? 0) + 1;
    await supersedeProposed(ctx, payload.section);
    const created = await ctx.repos.contexts.create(scope, {
      section: payload.section,
      version: nextVersion,
      fields: payload.fields as EquipeContextFields,
      status: "proposed",
      authorRole: "agent",
      authorId: ctx.actor.kind === "agent" ? ctx.actor.agentId : null,
    });
    await appendEvent(ctx, {
      eventType: CONTEXT_SECTION_PROPOSED_EVENT,
      objectType: "context_section",
      objectId: created.id,
      payload: { section: payload.section, version: nextVersion },
    });
    await requestNotification(ctx, {
      recipientRole: "approver",
      templateKey: "context_section.proposed",
    });
    return ok({ section: payload.section, version: nextVersion, contextVersionId: created.id });
  });
}

/**
 * The approver/substitute approves the open proposal — only for the exact
 * version hash they saw. Approving a stale version fails.
 */
export async function runApproveContextSection(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: ApproveContextSectionPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const deploying = requireDeploying(account.value);
    if (!deploying.ok) return deploying;
    const scope = scopeOf(ctx);
    const proposed = (await ctx.repos.contexts.list(scope)).filter(
      (version) => version.section === payload.section && version.status === "proposed",
    );
    const open = latestByVersion(proposed);
    if (!open) {
      return err("invalid_transition", `no proposed version for section ${payload.section}`);
    }
    const hash = contextVersionHash(open.fields as EquipeContextFields);
    if (hash !== payload.expectedVersionHash) {
      return err(
        "stale_version",
        `section ${payload.section} changed since version ${open.version} was seen`,
      );
    }
    const receipt = await writeReceipt(ctx, {
      objectType: "context_section",
      objectId: open.id,
      objectVersion: hash,
      action: "approve_context_section",
      detail: { section: payload.section, version: open.version },
    });
    const versions = await ctx.repos.contexts.list(scope);
    for (const version of versions) {
      if (version.section === payload.section && version.status === "approved") {
        await ctx.repos.contexts.update(scope, version.id, { status: "superseded" });
      }
    }
    await ctx.repos.contexts.update(scope, open.id, { status: "approved", receiptId: receipt.id });
    await appendEvent(ctx, {
      eventType: CONTEXT_SECTION_APPROVED_EVENT,
      objectType: "context_section",
      objectId: open.id,
      payload: { section: payload.section, version: open.version, versionHash: hash },
    });
    await requestNotification(ctx, {
      recipientRole: "strategist",
      templateKey: "context_section.approved",
    });
    return ok({ section: payload.section, version: open.version, receiptId: receipt.id, versionHash: hash });
  });
}

/**
 * The approver/substitute answers a conflict question on the open
 * draft/proposal: the field becomes sustained with the client's answer.
 */
export async function runAnswerConflict(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: AnswerConflictPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const deploying = requireDeploying(account.value);
    if (!deploying.ok) return deploying;
    const scope = scopeOf(ctx);
    const open = latestByVersion(
      (await ctx.repos.contexts.list(scope)).filter(
        (version) =>
          version.section === payload.section &&
          (version.status === "proposed" || version.status === "draft"),
      ),
    );
    if (!open) {
      return err("invalid_transition", `no open version for section ${payload.section}`);
    }
    const fields = { ...(open.fields as EquipeContextFields) };
    const field = fields[payload.field];
    if (!field || field.status !== "unknown" || !field.source?.startsWith(CONFLICT_SOURCE_PREFIX)) {
      return err(
        "invalid_transition",
        `no open conflict on ${payload.section}.${payload.field}`,
      );
    }
    const question = field.source.slice(CONFLICT_SOURCE_PREFIX.length);
    fields[payload.field] = { status: "sustained", value: payload.answer, source: "client_answer" };
    await ctx.repos.contexts.update(scope, open.id, { fields });
    await appendEvent(ctx, {
      eventType: CONTEXT_CONFLICT_ANSWERED_EVENT,
      objectType: "context_section",
      objectId: open.id,
      payload: { section: payload.section, version: open.version, field: payload.field, question, answer: payload.answer },
    });
    await requestNotification(ctx, {
      recipientRole: "strategist",
      templateKey: "context.conflict_answered",
    });
    return ok({ section: payload.section, version: open.version, field: payload.field });
  });
}
