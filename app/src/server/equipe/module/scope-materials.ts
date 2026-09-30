// Steps 1–2 of the implantação flow: the client confirms the contract
// scope, then references collected materials (workspace assets).

import { z } from "zod";
import { err, ok, type Result } from "../domain";
import type { EquipeModuleDeps } from "./ports";
import { confirmScopePayloadSchema, registerMaterialPayloadSchema } from "./envelope";
import {
  appendEvent,
  loadAccountOrError,
  requestNotification,
  requireDeploying,
  transact,
  type CommandSuccess,
  type TxBase,
} from "./shared";

export type ConfirmScopePayload = z.infer<typeof confirmScopePayloadSchema>;
export type RegisterMaterialPayload = z.infer<typeof registerMaterialPayloadSchema>;

export const SCOPE_CONFIRMED_EVENT = "account.scope_confirmed";
export const MATERIAL_REGISTERED_EVENT = "material.registered";

/** Step 1: the approver/substitute confirms scope in a guided step. */
export async function runConfirmScope(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: ConfirmScopePayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const deploying = requireDeploying(account.value);
    if (!deploying.ok) return deploying;
    const prior = await ctx.repos.events.list(
      { workspaceId: ctx.workspaceId, accountId: ctx.accountId },
      { eventType: SCOPE_CONFIRMED_EVENT },
    );
    if (prior.length > 0) {
      return err("invalid_transition", "scope already confirmed");
    }
    await appendEvent(ctx, {
      eventType: SCOPE_CONFIRMED_EVENT,
      objectType: "account",
      objectId: ctx.accountId,
      payload: { scopeDigest: payload.scopeDigest, note: payload.note ?? null },
    });
    await requestNotification(ctx, { recipientRole: "strategist", templateKey: "scope.confirmed" });
    return ok({});
  });
}

/**
 * Step 2: register a reference to an existing workspace asset (materials
 * live in ADScale storage; the Equipe keeps the reference + origin).
 */
export async function runRegisterMaterial(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: RegisterMaterialPayload,
): Promise<Result<CommandSuccess>> {
  // Read-only lookups BEFORE the transaction (no external I/O inside): the account's brand, then the
  // asset as that brand may see it. With several brands a workspace asset of another brand is unknown.
  // A missing account falls through: the transaction answers unknown_account.
  const existing = await deps.uow.repos.accounts.get(base.workspaceId, base.accountId);
  if (existing) {
    const asset = await deps.gateway.getAssetForBrand(payload.assetId, existing.clientProfileId);
    if (!asset || asset.workspaceId !== base.workspaceId) {
      return err("unknown_asset", `unknown asset ${payload.assetId} for this brand in workspace ${base.workspaceId}`);
    }
  }
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const deploying = requireDeploying(account.value);
    if (!deploying.ok) return deploying;
    await appendEvent(ctx, {
      eventType: MATERIAL_REGISTERED_EVENT,
      objectType: "material",
      objectId: payload.assetId,
      payload: { assetId: payload.assetId, kind: payload.kind, origin: payload.origin ?? null },
    });
    await requestNotification(ctx, {
      recipientRole: "strategist",
      templateKey: "material.registered",
    });
    return ok({ assetId: payload.assetId });
  });
}
