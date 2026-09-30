import { z } from "zod";
import { err, ok } from "../domain";
import type { EquipeModuleDeps } from "./ports";
import { openFreeAccountPayloadSchema } from "./envelope";
import { appendEvent, scopeOf, transact, type TxBase } from "./shared";
import { ensurePrimaryThreadInTx } from "./threads";

export function runOpenFreeAccount(
  deps: EquipeModuleDeps, base: TxBase, payload: z.infer<typeof openFreeAccountPayloadSchema>,
) {
  return transact(deps, base, async (ctx) => {
    await ctx.internal.lockWorkspace(ctx.workspaceId);
    const member = await ctx.internal.getVerifiedWorkspaceMember(ctx.workspaceId, payload.userId);
    if (!member) return err("forbidden_actor", "Opening requires a verified workspace member.");
    const [existing] = await ctx.repos.accounts.list(ctx.workspaceId);
    if (existing) {
      ctx.accountId = existing.id;
      const thread = await ensurePrimaryThreadInTx(ctx);
      return thread.ok ? ok({ accountId: existing.id, ...thread.value, created: false }) : thread;
    }
    const profile = await ctx.internal.createClientProfile(ctx.workspaceId, "Minha marca");
    const account = await ctx.repos.accounts.create(ctx.workspaceId, { clientProfileId: profile.id, status: "free" });
    ctx.accountId = account.id;
    const scope = scopeOf(ctx);
    await ctx.repos.people.create(scope, { userId: payload.userId, role: "approver", name: member.name, email: member.email });
    await ctx.repos.handoffs.create(scope, { clientProfileId: profile.id });
    const thread = await ensurePrimaryThreadInTx(ctx);
    if (!thread.ok) return thread;
    await appendEvent(ctx, { eventType: "account.free_opened", objectType: "account", objectId: account.id,
      payload: { clientProfileId: profile.id } });
    return ok({ accountId: account.id, ...thread.value, created: true });
  });
}
