import type { z } from "zod";
import type { AccountScope, EquipeMandate, EquipeRepositories } from "../data";
import { err, ok, type Result } from "../domain";
import { approveAutomaticPublicationPayloadSchema } from "./envelope";
import { instagramIdentityOf } from "./instagram-destination";
import { mandateRuleOf, mandateVersionHash } from "./plan-mandate";
import type { EquipeModuleDeps } from "./ports";
import {
  appendEvent,
  requireActivationAccount,
  scopeOf,
  transact,
  versionHash,
  writeReceipt,
  type CommandSuccess,
  type TxBase,
} from "./shared";

export const MANUAL_MODE_AGREED_EVENT = "connection.manual_mode_agreed";
export const AUTOMATIC_PUBLICATION_APPROVED_EVENT = "connection.automatic_publication_approved";

/** Resolve receipted client decisions, including manual agreements made before #595. */
export async function readPublicationMode(repos: EquipeRepositories, scope: AccountScope) {
  const manual = await repos.events.list(scope, { eventType: MANUAL_MODE_AGREED_EVENT });
  const automatic = await repos.events.list(scope, { eventType: AUTOMATIC_PUBLICATION_APPROVED_EVENT });
  const receipts = await repos.receipts.listByObject(scope, "connection", scope.accountId);
  const events = [...manual, ...automatic].sort((a, b) =>
    b.occurredAt.getTime() - a.occurredAt.getTime() ||
    // Only manual → automatic is supported; automatic follows manual on the same clock tick.
    Number(b.eventType === AUTOMATIC_PUBLICATION_APPROVED_EVENT) -
      Number(a.eventType === AUTOMATIC_PUBLICATION_APPROVED_EVENT) || b.id.localeCompare(a.id),
  );
  for (const event of events) {
    if (event.objectType !== "account" || event.objectId !== scope.accountId ||
        event.actorType !== "client_person" ||
        (event.actorRole !== "approver" && event.actorRole !== "substitute")) continue;
    const isManual = event.eventType === MANUAL_MODE_AGREED_EVENT;
    const payload = event.payload as { receiptId?: unknown; versionHash?: unknown } | null;
    const hash = isManual ? versionHash({ mode: "manual" }) : payload?.versionHash;
    const receipt = receipts.find((row) =>
      row.action === (isManual ? "agree_manual_mode" : "approve_automatic_publication") &&
      row.objectVersion === hash && row.personKind === "client_person" &&
      row.personId === event.actorId && row.personRole === event.actorRole &&
      ((isManual && payload?.receiptId == null) || row.id === payload?.receiptId),
    );
    if (receipt) return { mode: isManual ? "manual" as const : "automatic" as const, event, receipt };
  }
  return { mode: "automatic" as const, event: null, receipt: null };
}

export type PublicationMode = Awaited<ReturnType<typeof readPublicationMode>>;

type AutomaticPublicationProposal = {
  versionHash: string;
  mandateVersion: number;
  detail: {
    from: "manual";
    to: "automatic";
    previousTransitionId: string;
    connectionId: string;
    destinationIgUserId: string;
    igUsername: string | null;
    mandateId: string;
    mandateVersionHash: string;
  };
};

/** The exact connection and live mandate the client will approve in Metas. */
export async function automaticPublicationProposal(
  repos: EquipeRepositories,
  scope: AccountScope,
  mode: PublicationMode,
  now: Date,
  forUpdate = false,
): Promise<Result<AutomaticPublicationProposal>> {
  if (mode.mode !== "manual" || !mode.event) return err("invalid_transition", "A conta já está no modo automático.");
  const connections = await repos.connections.list(scope);
  const connected = connections.find((row) => row.provider === "instagram");
  const connection = connected && forUpdate
    ? await repos.connections.get(scope, connected.id, { forUpdate: true }) : connected;
  const identity = instagramIdentityOf(connection ?? null);
  if (!connection || connection.status !== "active" || !identity) {
    return err("automatic_publication_requires_connection", "Conecte um perfil ativo do Instagram antes de aprovar a publicação automática.");
  }
  const fronts = await repos.fronts.list(scope);
  const social = fronts.find((front) => front.key === "social_instagram");
  const mandates = await repos.mandates.list(scope);
  const eligible = (row: EquipeMandate) =>
    row.status === "approved" && !row.shadow && row.receiptId &&
    (row.frontId === null || row.frontId === social?.id) &&
    (!row.validFrom || row.validFrom <= now) && (!row.validUntil || row.validUntil >= now);
  const approved = mandates.filter(eligible).sort((a, b) => b.version - a.version)[0];
  const mandate = approved && forUpdate
    ? await repos.mandates.get(scope, approved.id, { forUpdate: true }) : approved;
  if (!mandate || !eligible(mandate)) {
    return err("automatic_publication_requires_mandate", "Aprove um mandato de publicação válido fora do modo sombra antes de mudar para automático.");
  }
  const detail = {
    from: "manual" as const, to: "automatic" as const, previousTransitionId: mode.event.id,
    connectionId: connection.id, destinationIgUserId: identity.igUserId,
    igUsername: identity.igUsername, mandateId: mandate.id,
    mandateVersionHash: mandateVersionHash(mandateRuleOf(mandate)),
  };
  return ok({ versionHash: versionHash(detail), detail, mandateVersion: mandate.version });
}

export async function runApproveAutomaticPublication(
  deps: EquipeModuleDeps,
  base: TxBase,
  payload: z.infer<typeof approveAutomaticPublicationPayloadSchema>,
): Promise<Result<CommandSuccess>> {
  return transact(deps, base, async (ctx) => {
    // Serialize mode decisions from the approver and substitute, including retries.
    const account = await ctx.repos.accounts.get(ctx.workspaceId, ctx.accountId, { forUpdate: true });
    if (!account) return err("unknown_account", `unknown account ${ctx.accountId}`);
    const allowed = requireActivationAccount(account);
    if (!allowed.ok) return allowed;
    const scope = scopeOf(ctx);
    const mode = await readPublicationMode(ctx.repos, scope);
    if (mode.mode === "automatic" && mode.receipt?.objectVersion === payload.expectedVersionHash) {
      return ok({ alreadyApproved: true, receiptId: mode.receipt.id });
    }
    const proposal = await automaticPublicationProposal(ctx.repos, scope, mode, ctx.now, true);
    if (!proposal.ok) return proposal;
    if (proposal.value.versionHash !== payload.expectedVersionHash) {
      return err("stale_version", "Mudou desde que você abriu, revise de novo.");
    }
    const receipt = await writeReceipt(ctx, {
      objectType: "connection", objectId: ctx.accountId,
      objectVersion: proposal.value.versionHash, action: "approve_automatic_publication",
      detail: proposal.value.detail,
    });
    await appendEvent(ctx, {
      eventType: AUTOMATIC_PUBLICATION_APPROVED_EVENT, objectType: "account", objectId: ctx.accountId,
      payload: { ...proposal.value.detail, versionHash: proposal.value.versionHash, receiptId: receipt.id },
    });
    return ok({ receiptId: receipt.id });
  });
}
