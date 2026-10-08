import { z } from "zod";
import { err, ok, type Result } from "../domain";
import { transitionHandoff, type HandoffDecisions, type HandoffItem } from "../domain/handoff";
import type { AdscaleClientProfileRef, EquipeModuleDeps } from "./ports";
import { openFreeAccountPayloadSchema } from "./envelope";
import { freePlanLimitsApply, type FreePlanReaders } from "./free-plan";
import { appendEvent, scopeOf, transact, type CommandSuccess, type TxBase } from "./shared";
import { ensurePrimaryThreadInTx } from "./threads";
import { FREE_INTRO_EVENT } from "../handoff/contract";

export const BRAND_IMPORTED_EVENT = "account.brand_imported";

/** A brand that already has an identity (its Brand Kit); in a workspace that pays it enters without the handoff (spec 2026-10-07 §3). */
export function hasBrandIdentity(profile: AdscaleClientProfileRef): boolean {
  return Boolean(profile.logoAssetKey) || (profile.brandColors?.length ?? 0) > 0;
}

/** That identity as the handoff's confirmed decision: origin `user`, since the person entered it in the Brand Kit. */
export function importedIdentity(profile: AdscaleClientProfileRef): NonNullable<HandoffDecisions["identity"]> {
  const item = (value: string, key?: string): HandoffItem => ({ id: crypto.randomUUID(), value, origin: "user", ...(key ? { key } : {}) });
  const name = profile.name?.trim() || "Minha marca";
  return {
    name: item(name),
    logo: profile.logoAssetKey ? item(name, profile.logoAssetKey) : null,
    colors: (profile.brandColors ?? []).map((color) => item(color)),
    fonts: (profile.brandFonts ?? []).map((font) => item(font)),
    paletteChoice: "user",
  };
}

export async function runOpenFreeAccount(
  deps: EquipeModuleDeps, base: TxBase, payload: z.infer<typeof openFreeAccountPayloadSchema>,
): Promise<Result<CommandSuccess>> {
  // The brand is read through the gateway BEFORE the transaction (no external I/O inside), as open_account does.
  const profile = payload.clientProfileId ? await deps.gateway.getClientProfile(base.workspaceId, payload.clientProfileId) : null;
  if (payload.clientProfileId && (!profile || profile.workspaceId !== base.workspaceId)) {
    return err("unknown_client_profile", `unknown client profile ${payload.clientProfileId}`);
  }
  return transact(deps, base, async (ctx) => {
    await ctx.internal.lockWorkspace(ctx.workspaceId);
    const member = await ctx.internal.getVerifiedWorkspaceMember(ctx.workspaceId, payload.userId);
    if (!member) return err("forbidden_actor", "Opening requires a verified workspace member.");
    // Match the client account order; free→paid conversion keeps the entry account.
    const accounts = [...(await ctx.repos.accounts.list(ctx.workspaceId))].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
    );
    // A classic paying customer with no live account (none, or only closed ones) keeps the classic product (ticket 11,
    // part 2): no free account is opened for it and a closed one is not handed back, so opening the home never turns a
    // paid workspace into the free plan (the same test as `usesEquipeProduct`).
    const live = accounts.some((account) => account.status !== "closed");
    if (!live && await deps.hasClassicPaidAccess?.(ctx.workspaceId)) {
      return err("classic_paid_access", "This workspace pays for the classic product: no free account is opened.");
    }
    // Spec 2026-10-07 §3: one account per brand, opened the first time the brand is. Without a brand (a workspace that has
    // none yet), the oldest account, as before. A closed free account is the operation's decision: with none live, the
    // workspace gets it back whatever the brand, never a new account.
    const existing = profile
      ? accounts.find((account) => account.clientProfileId === profile.id) ?? (live ? undefined : accounts.at(-1))
      : accounts[0];
    if (existing) {
      ctx.accountId = existing.id;
      const thread = await ensurePrimaryThreadInTx(ctx);
      return thread.ok ? ok({ accountId: existing.id, ...thread.value, created: false }) : thread;
    }
    // Whether the workspace pays (spec 2026-10-07 §3), asked only now that an account opens, so a failing read never takes an
    // existing conversation down. With no live account it does not: the classic access was just asked, and nothing else pays.
    const readers: FreePlanReaders = { readAccounts: async () => accounts, hasActivePaidAccess: deps.hasClassicPaidAccess ?? (async () => false) };
    const paying = live && !(await freePlanLimitsApply({ status: "free" }, ctx.workspaceId, readers));
    // The free plan has one brand: another one opens only for a workspace that pays.
    if (profile && live && !paying) return err("requires_plan", "The free plan has one brand.");
    const owner = await ctx.internal.getVerifiedWorkspaceOwner(ctx.workspaceId);
    if (!owner) return err("forbidden_actor", "Peça ao dono deste workspace para abrir o ADScale primeiro");
    const clientProfileId = profile?.id ?? (await ctx.internal.createClientProfile(ctx.workspaceId, "Minha marca")).id;
    const account = await ctx.repos.accounts.create(ctx.workspaceId, { clientProfileId, status: "free" });
    ctx.accountId = account.id;
    const scope = scopeOf(ctx);
    await ctx.repos.people.create(scope, { ...owner, role: "approver" });
    if (payload.userId !== owner.userId) {
      await ctx.repos.people.create(scope, { userId: payload.userId, role: "member", name: member.name, email: member.email });
    }
    const handoff = await ctx.repos.handoffs.create(scope, { clientProfileId });
    if (profile && paying && hasBrandIdentity(profile)) {
      // In a workspace that pays, a brand with a Brand Kit enters the conversation directly: its identity is the confirmed
      // decision, and its main conversation starts new (an old classic thread of the brand is not taken over). On the free
      // plan it goes through the handoff: the reading and the diagnosis are what the plan offers, and the plan card comes
      // after the diagnosis.
      const imported = transitionHandoff({ ...handoff, decisions: { identity: importedIdentity(profile), imported: true } }, "import");
      if (!imported.ok) return imported;
      const { step, version, decisions } = imported.value;
      await ctx.repos.handoffs.update(scope, handoff.id, { step, version, decisions });
      const thread = await ensurePrimaryThreadInTx(ctx, undefined, { fresh: true });
      if (!thread.ok) return thread;
      await appendEvent(ctx, { eventType: BRAND_IMPORTED_EVENT, objectType: "account", objectId: account.id, payload: { clientProfileId } });
      return ok({ accountId: account.id, ...thread.value, created: true, imported: true });
    }
    // The conversation of a new account of an EXISTING brand starts new: the brand's old classic thread is not taken over, or the
    // opening line and the handoff card would land after its classic messages. Only the account that creates "Minha marca" has
    // no brand to read a thread of.
    const thread = await ensurePrimaryThreadInTx(ctx, undefined, { fresh: Boolean(profile) });
    if (!thread.ok) return thread;
    // The opening line goes first: the conversation reads "Oi! Sou o Estrategista…" and then the first card.
    await appendEvent(ctx, { eventType: FREE_INTRO_EVENT, objectType: "account", objectId: account.id, payload: {} });
    await appendEvent(ctx, { eventType: "account.free_opened", objectType: "account", objectId: account.id,
      payload: { clientProfileId } });
    return ok({ accountId: account.id, ...thread.value, created: true });
  });
}
