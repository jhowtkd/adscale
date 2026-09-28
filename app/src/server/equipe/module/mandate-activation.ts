// Staff-proposed mandate activation (#584): support or operations proposes
// taking an approved shadow mandate live. The command copies the approved
// rule into a new proposed version with shadow:false; the client approver
// or substitute then approves through the SAME approve_mandate flow (exact
// hash, receipt). No internal role can approve a mandate — authorize()
// keeps approve_mandate client-only.

import { z } from "zod";
import { err, ok, type Result } from "../domain";
import type { EquipeModuleDeps } from "./ports";
import { proposeMandateActivationPayloadSchema } from "./envelope";
import { MANDATE_PROPOSED_EVENT, liveRuleKey, mandateRuleOf } from "./plan-mandate";
import {
  appendEvent,
  loadAccountOrError,
  requestNotification,
  requireActivationAccount,
  scopeOf,
  transact,
  type CommandContext,
  type CommandSuccess,
  type TxBase,
} from "./shared";

export type ProposeMandateActivationPayload = z.infer<
  typeof proposeMandateActivationPayloadSchema
>;

/**
 * Staff proposes activating an approved shadow mandate: a new version,
 * identical except shadow:false, pending client approval. Refuses when the
 * mandate is unknown, not approved, already out of shadow, or its
 * activation is already pending. Any other open proposal is superseded —
 * like propose_mandate, the client reviews exactly one version.
 */
export async function runProposeMandateActivation(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: ProposeMandateActivationPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx: CommandContext) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const allowed = requireActivationAccount(account.value);
    if (!allowed.ok) return allowed;
    const scope = scopeOf(ctx);
    const mandates = await ctx.repos.mandates.list(scope);
    const source = mandates.find((mandate) => mandate.id === payload.mandateId);
    if (!source) {
      return err("unknown_mandate", `unknown mandate ${payload.mandateId}`);
    }
    if (source.status !== "approved") {
      return err(
        "invalid_transition",
        `mandate ${source.id} is ${source.status}, activation needs an approved mandate`,
      );
    }
    if (!source.shadow) {
      return err("invalid_transition", `mandate ${source.id} is already out of shadow mode`);
    }
    const activationKey = liveRuleKey(mandateRuleOf(source));
    const pending = mandates.find(
      (mandate) =>
        mandate.status === "proposed" &&
        !mandate.shadow &&
        liveRuleKey(mandateRuleOf(mandate)) === activationKey,
    );
    if (pending) {
      return err(
        "invalid_transition",
        `activation of mandate ${source.id} is already pending as v${pending.version}`,
      );
    }
    for (const mandate of mandates) {
      if (mandate.status === "proposed") {
        await ctx.repos.mandates.update(scope, mandate.id, { status: "superseded" });
      }
    }
    const nextVersion = mandates.reduce((max, mandate) => Math.max(max, mandate.version), 0) + 1;
    const created = await ctx.repos.mandates.create(scope, {
      frontId: source.frontId,
      version: nextVersion,
      status: "proposed",
      shadow: false,
      limits: source.limits,
      window: source.window,
      validFrom: source.validFrom,
      validUntil: source.validUntil,
      stopCondition: source.stopCondition,
    });
    await appendEvent(ctx, {
      eventType: MANDATE_PROPOSED_EVENT,
      objectType: "mandate",
      objectId: created.id,
      payload: {
        version: nextVersion,
        frontId: created.frontId,
        shadow: created.shadow,
        activatesVersion: source.version,
      },
    });
    await requestNotification(ctx, { recipientRole: "approver", templateKey: "mandate.proposed" });
    return ok({ version: nextVersion, mandateId: created.id, activatesVersion: source.version });
  });
}
