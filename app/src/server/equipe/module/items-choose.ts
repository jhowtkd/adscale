// choose_piece (variant B — paid-media angles): the client choosing a Peça
// is a human Approval with receipt, distinct from agent Selection. It pins
// a new version on the chosen output and approves it in the same
// transaction; the export package becomes available, no intent is made.

import { z } from "zod";
import { actorId, approveItem, err, ok, type Result } from "../domain";
import type { EquipeModuleDeps } from "./ports";
import { choosePiecePayloadSchema } from "./envelope";
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
import {
  approvalReceiptFor,
  approvedByOf,
  domainStateOf,
  itemVersionHash,
  loadItemOrError,
  PIECE_CHOSEN_EVENT,
  storedDestinationOf,
  versionContentOf,
} from "./item-shared";

export type ChoosePiecePayload = z.infer<typeof choosePiecePayloadSchema>;

export async function runChoosePiece(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: ChoosePiecePayload,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    const account = await loadAccountOrError(ctx);
    if (!account.ok) return account;
    const loaded = await loadItemOrError(ctx, payload.itemId);
    if (!loaded.ok) return loaded;
    const scope = scopeOf(ctx);
    const item = loaded.value;
    const front = await ctx.repos.fronts.get(scope, item.frontId);
    if (!front || front.key !== "midia_paga") {
      return err("wrong_front", `item ${item.id} is not a paid-media angle`);
    }
    if (!item.currentVersionHash) {
      return err("invalid_transition", `item ${item.id} has no current version`);
    }
    if (payload.expectedVersionHash !== item.currentVersionHash) {
      return err("version_mismatch", "mudou desde que você abriu, revise de novo");
    }
    const first = await approvalReceiptFor(ctx, item.id, item.currentVersionHash);
    if (first) {
      return ok({ alreadyChosen: true, receiptId: first.id });
    }
    const output = await deps.gateway.getCreativeWorkOutput(payload.creativeWorkOutputId);
    if (!output || output.workspaceId !== ctx.workspaceId) {
      return err(
        "unknown_creative_output",
        `creative output ${payload.creativeWorkOutputId} is not in workspace ${ctx.workspaceId}`,
      );
    }
    if (!item.creativeWorkId || output.workId !== item.creativeWorkId) {
      return err(
        "output_work_mismatch",
        `creative output ${payload.creativeWorkOutputId} is not from this angle's work`,
      );
    }
    const current = await ctx.repos.itemVersions.getByHash(scope, item.id, item.currentVersionHash);
    if (!current) {
      return err("invalid_transition", `item ${item.id} has no current version`);
    }
    const destination = storedDestinationOf(item, current);
    if (!destination) {
      return err("invalid_transition", `item ${item.id} has no recorded destination account`);
    }
    const receipts = await ctx.repos.receipts.listByObject(scope, "item", item.id);
    const state = domainStateOf(item, receipts);
    if (!state.ok) return state;
    const versionHash = itemVersionHash({
      ...versionContentOf(current, destination),
      output: payload.creativeWorkOutputId,
    });
    await ctx.repos.itemVersions.create(scope, {
      itemId: item.id,
      versionHash,
      creativeWorkOutputId: payload.creativeWorkOutputId,
      caption: current.caption,
      scheduledFor: current.scheduledFor,
      destination,
      authorRole: "client_person",
      authorId: actorId(ctx.actor),
      reviewerFindings: null,
    });
    const decided = approveItem(
      { ...state.value, currentVersion: versionHash },
      { version: versionHash, approvedBy: approvedByOf(ctx), mode: "manual" },
    );
    if (!decided.ok) return decided;
    const receipt = await writeReceipt(ctx, {
      objectType: "item",
      objectId: item.id,
      objectVersion: versionHash,
      action: "choose_piece",
      detail: {
        creativeWorkOutputId: payload.creativeWorkOutputId,
        previousVersionHash: item.currentVersionHash,
      },
    });
    await ctx.repos.items.update(scope, item.id, {
      status: decided.value.state.status,
      destination,
      currentVersionHash: versionHash,
    });
    await appendEvent(ctx, {
      eventType: PIECE_CHOSEN_EVENT,
      objectType: "item",
      objectId: item.id,
      payload: {
        versionHash,
        creativeWorkOutputId: payload.creativeWorkOutputId,
        destinationAccount: destination,
        receiptId: receipt.id,
      },
    });
    await requestNotification(ctx, {
      recipientRole: "strategist",
      templateKey: "piece.chosen",
      detail: { itemId: item.id, versionHash },
    });
    return ok({ itemId: item.id, receiptId: receipt.id, versionHash });
  });
}
