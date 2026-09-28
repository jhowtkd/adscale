// open_account: staff operations creates the Equipe account for a client
// profile in a workspace — its fronts from the contract scope, the 7
// onboarding steps with owners/deadlines, and the account people.
//
// Not named in the plan; needed to start everything, kept minimal.

import { z } from "zod";
import { addBusinessDays } from "../domain";
import type { EquipeOnboardingStepKey } from "../data";
import type { EquipeModuleDeps } from "./ports";
import { openAccountPayloadSchema } from "./envelope";
import {
  appendEvent,
  requestNotification,
  scopeOf,
  transact,
  type CommandSuccess,
  type TxBase,
} from "./shared";
import { err, ok, type Result } from "../domain";

export type OpenAccountPayload = z.infer<typeof openAccountPayloadSchema>;

// Owner + deadline (business days from opening) per step. Deadlines are a
// module choice — the flow fixes reminder caps (2/5/7/10), not step due
// dates. Owners follow the flow's "who does it" column.
const STEP_PLAN: Array<{ step: EquipeOnboardingStepKey; owner: string; dueInBusinessDays: number }> = [
  { step: "scope_confirm", owner: "approver", dueInBusinessDays: 2 },
  { step: "materials", owner: "approver", dueInBusinessDays: 5 },
  { step: "context", owner: "approver", dueInBusinessDays: 10 },
  { step: "plan", owner: "approver", dueInBusinessDays: 15 },
  { step: "mandate", owner: "approver", dueInBusinessDays: 15 },
  { step: "connection", owner: "custodian", dueInBusinessDays: 10 },
  { step: "go_live", owner: "strategist", dueInBusinessDays: 20 },
];

export async function runOpenAccount(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: OpenAccountPayload,
): Promise<Result<CommandSuccess>> {
  // Read-only gateway lookup BEFORE the transaction (no external I/O inside).
  const profile = await deps.gateway.getClientProfile(base.workspaceId, payload.clientProfileId);
  if (!profile || profile.workspaceId !== base.workspaceId) {
    return err("unknown_client_profile", `unknown client profile ${payload.clientProfileId}`);
  }
  return transact(deps, base, async (ctx) => {
    const existing = await ctx.repos.accounts.findByClientProfile(
      ctx.workspaceId,
      payload.clientProfileId,
    );
    if (existing) {
      return err(
        "account_already_exists",
        `account already exists for client profile ${payload.clientProfileId}`,
      );
    }
    const account = await ctx.repos.accounts.create(ctx.workspaceId, {
      clientProfileId: payload.clientProfileId,
      notes: payload.notes,
    });
    ctx.accountId = account.id;
    const scope = scopeOf(ctx);
    for (const person of payload.people) {
      await ctx.repos.people.create(scope, {
        name: person.name,
        role: person.role,
        userId: person.userId,
        email: person.email,
      });
    }
    for (const key of payload.fronts) {
      await ctx.repos.fronts.create(scope, { key, status: "draft" });
    }
    for (const plan of STEP_PLAN) {
      await ctx.repos.onboarding.create(scope, {
        step: plan.step,
        status: "pending",
        owner: plan.owner,
        dueAt: addBusinessDays(ctx.now, plan.dueInBusinessDays),
      });
    }
    await appendEvent(ctx, {
      eventType: "account.opened",
      objectType: "account",
      objectId: account.id,
      payload: { clientProfileId: payload.clientProfileId, fronts: payload.fronts },
    });
    await requestNotification(ctx, { recipientRole: "approver", templateKey: "account.opened" });
    return ok({ accountId: account.id });
  });
}
