// declare_manual_publication (#548): in manual mode the client publishes
// themselves and declares "publiquei". The item moves from
// `available_for_download` to `published_declared` with a receipt; the
// reconcile command later confirms it on the platform (`published_confirmed`)
// when a read connection exists. Declared/confirmed items never schedule:
// approval is what creates intents, and manual approvals create none.

import { z } from "zod";
import { declareManualPublished, err, ok, type Result } from "../domain";
import type { EquipeModuleDeps } from "./ports";
import { declareManualPublicationPayloadSchema } from "./envelope";
import {
  appendEvent,
  loadAccountOrError,
  requestNotification,
  scopeOf,
  transact,
  writeReceipt,
  type CommandSuccess,
  type TxBase,
} from "./shared";
import { domainStateOf, loadItemOrError } from "./item-shared";

export type DeclareManualPublicationPayload = z.infer<typeof declareManualPublicationPayloadSchema>;

export const MANUAL_PUBLISH_DECLARED_EVENT = "item.manual_publish_declared";
export const MANUAL_PUBLISH_CONFIRMED_EVENT = "item.manual_publish_confirmed";

export const DECLARE_MANUAL_PUBLICATION_ACTION = "declare_manual_publication";

/**
 * The approver/substitute declares the downloaded item published. Declaring
 * the same version twice is a no-op result — the first declaration wins.
 */
export async function runDeclareManualPublication(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: DeclareManualPublicationPayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const loaded = await loadItemOrError(ctx, payload.itemId);
    if (!loaded.ok) return loaded;
    const scope = scopeOf(ctx);
    const item = loaded.value;
    if (!item.currentVersionHash) {
      return err("invalid_transition", `item ${item.id} has no current version`);
    }
    if (item.status === "published_declared" || item.status === "published_confirmed") {
      const declarations = await ctx.repos.receipts.listByObject(scope, "item", item.id);
      const first = declarations.find(
        (receipt) =>
          receipt.action === DECLARE_MANUAL_PUBLICATION_ACTION &&
          receipt.objectVersion === item.currentVersionHash,
      );
      return ok({ itemId: item.id, alreadyDeclared: true, receiptId: first?.id ?? null });
    }
    const receipts = await ctx.repos.receipts.listByObject(scope, "item", item.id);
    const state = domainStateOf(item, receipts);
    if (!state.ok) return state;
    const decided = declareManualPublished(state.value);
    if (!decided.ok) return decided;
    await ctx.repos.items.update(scope, item.id, { status: decided.value.state.status });
    const receipt = await writeReceipt(ctx, {
      objectType: "item",
      objectId: item.id,
      objectVersion: item.currentVersionHash,
      action: DECLARE_MANUAL_PUBLICATION_ACTION,
    });
    await appendEvent(ctx, {
      eventType: MANUAL_PUBLISH_DECLARED_EVENT,
      objectType: "item",
      objectId: item.id,
      payload: { versionHash: item.currentVersionHash, receiptId: receipt.id },
    });
    await requestNotification(ctx, {
      recipientRole: "strategist",
      templateKey: "manual.declared",
      detail: { itemId: item.id, receiptId: receipt.id },
    });
    return ok({ itemId: item.id, receiptId: receipt.id });
  });
}
