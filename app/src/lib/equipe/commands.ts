// Client calls against the Equipe commands endpoint (#552 contract).
//
// POST /api/equipe/accounts/[accountId]/commands with the typed { type,
// payload } envelope. The chat cards use this for the approval confirmation
// — the chat itself never approves; the endpoint runs the module command.

import { apiFetch } from "@/lib/api-client";

export type EquipeApprovalRef = {
  itemId: string;
  versionHash: string;
};

export class EquipeCommandError extends Error {
  readonly status: number;
  /** The module error code (version_mismatch, item_not_ready, …). */
  readonly code: string | null;
  /** The API's reason, when it carries one (409 details). */
  readonly detail: string | null;

  constructor(message: string, status: number, code: string | null = null, detail: string | null = null) {
    super(message);
    this.name = "EquipeCommandError";
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

export async function postEquipeCommand(
  accountId: string,
  command: { type: string; payload: Record<string, unknown> },
): Promise<unknown> {
  const response = await apiFetch(`/api/equipe/accounts/${accountId}/commands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  const body = (await response.json().catch(() => null)) as {
    error?: string;
    code?: string;
    details?: { message?: unknown };
  } | null;
  if (!response.ok) {
    const detail = body?.details;
    throw new EquipeCommandError(
      body?.error ?? "Erro ao enviar comando",
      response.status,
      typeof body?.code === "string" ? body.code : null,
      typeof detail?.message === "string" ? detail.message : null,
    );
  }
  return body;
}

/** Approve the closed list of item versions (approve_batch). */
export async function approveEquipeBatch(
  accountId: string,
  items: EquipeApprovalRef[],
): Promise<unknown> {
  return postEquipeCommand(accountId, {
    type: "approve_batch",
    payload: {
      items: items.map((item) => ({ itemId: item.itemId, versionHash: item.versionHash })),
    },
  });
}

/** Approve one item version (approve_item). */
export async function approveEquipeItem(
  accountId: string,
  item: EquipeApprovalRef,
): Promise<unknown> {
  return postEquipeCommand(accountId, {
    type: "approve_item",
    payload: { itemId: item.itemId, expectedVersionHash: item.versionHash },
  });
}

export type EquipeBatchItemResult = {
  itemId: string;
  outcome: "approved" | "changed_since_opened" | "not_ready" | "already_decided" | "unknown_item";
  receiptId?: string;
  reviewStatus?: string;
  conferencePending?: true;
};

/** Closed-list batch approval result, per item. */
export function parseBatchResults(value: unknown): EquipeBatchItemResult[] {
  if (!value || typeof value !== "object") return [];
  const results = (value as Record<string, unknown>).results;
  if (!Array.isArray(results)) return [];
  return results.flatMap((entry): EquipeBatchItemResult[] => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    if (typeof row.itemId !== "string") return [];
    if (
      row.outcome !== "approved" &&
      row.outcome !== "changed_since_opened" &&
      row.outcome !== "not_ready" &&
      row.outcome !== "already_decided" &&
      row.outcome !== "unknown_item"
    ) {
      return [];
    }
    return [
      {
        itemId: row.itemId,
        outcome: row.outcome,
        ...(typeof row.receiptId === "string" ? { receiptId: row.receiptId } : {}),
        ...(typeof row.reviewStatus === "string" ? { reviewStatus: row.reviewStatus } : {}),
        ...(row.conferencePending === true ? { conferencePending: true as const } : {}),
      },
    ];
  });
}

export type AdjustmentCategory = "fact" | "brand" | "voice" | "visual" | "other";

/** Categorized adjustment request: the IA produces a new version. */
export async function requestEquipeAdjustment(
  accountId: string,
  input: { itemId: string; category: AdjustmentCategory; note?: string },
): Promise<unknown> {
  return postEquipeCommand(accountId, {
    type: "request_adjustment",
    payload: {
      itemId: input.itemId,
      category: input.category,
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    },
  });
}

/** Client caption edit: births a new immutable version ("editada por você"). */
export async function editEquipeCaption(
  accountId: string,
  input: { itemId: string; caption: string },
): Promise<unknown> {
  return postEquipeCommand(accountId, {
    type: "edit_caption",
    payload: { itemId: input.itemId, caption: input.caption },
  });
}

/** Confirm an asserted permanent fact at the exact version seen. */
export async function confirmEquipeBusinessFact(
  accountId: string,
  input: { itemId: string; expectedVersionHash: string },
): Promise<unknown> {
  return postEquipeCommand(accountId, {
    type: "confirm_business_fact",
    payload: { itemId: input.itemId, expectedVersionHash: input.expectedVersionHash },
  });
}

/** Drop the item from the calendar with a reason ("não publicar"). */
export async function declineEquipePublish(
  accountId: string,
  input: { itemId: string; reason: string },
): Promise<unknown> {
  return postEquipeCommand(accountId, {
    type: "decline_publish",
    payload: { itemId: input.itemId, reason: input.reason },
  });
}

/** Cancel a scheduled item before dispatch. */
export async function cancelEquipeScheduled(
  accountId: string,
  input: { itemId: string },
): Promise<unknown> {
  return postEquipeCommand(accountId, {
    type: "cancel_scheduled",
    payload: { itemId: input.itemId },
  });
}

/** Report a problem on an item: opens an escalation. */
export async function reportEquipeItemProblem(
  accountId: string,
  input: { itemId: string; note: string },
): Promise<unknown> {
  return postEquipeCommand(accountId, {
    type: "report_item_problem",
    payload: { itemId: input.itemId, note: input.note },
  });
}

/** Client pause: holds every scheduled item on the account. */
export async function pauseEquipePublications(
  accountId: string,
  input: { reason?: string } = {},
): Promise<unknown> {
  return postEquipeCommand(accountId, {
    type: "pause_publications",
    payload: { ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}) },
  });
}

/** "Falar com uma pessoa": opens a support exception. */
export async function requestEquipeSupport(
  accountId: string,
  input: { note?: string } = {},
): Promise<unknown> {
  return postEquipeCommand(accountId, {
    type: "request_support",
    payload: { ...(input.note?.trim() ? { note: input.note.trim() } : {}) },
  });
}

/** Implantação step 1: the approver/substitute confirms the contract scope. */
export async function confirmEquipeScope(
  accountId: string,
  input: { scopeDigest: string; note?: string },
): Promise<unknown> {
  return postEquipeCommand(accountId, {
    type: "confirm_scope",
    payload: {
      scopeDigest: input.scopeDigest,
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    },
  });
}

/** Implantação step 2: reference an existing workspace asset as material. */
export async function registerEquipeMaterial(
  accountId: string,
  input: { assetId: string; kind: string; origin?: string },
): Promise<unknown> {
  return postEquipeCommand(accountId, {
    type: "register_material",
    payload: {
      assetId: input.assetId,
      kind: input.kind,
      ...(input.origin?.trim() ? { origin: input.origin.trim() } : {}),
    },
  });
}

/** Approve a proposed context section at the exact version seen. */
export async function approveEquipeContextSection(
  accountId: string,
  input: { section: string; expectedVersionHash: string },
): Promise<unknown> {
  return postEquipeCommand(accountId, {
    type: "approve_context_section",
    payload: { section: input.section, expectedVersionHash: input.expectedVersionHash },
  });
}

/** Answer an open fact conflict on a context section. */
export async function answerEquipeConflict(
  accountId: string,
  input: { section: string; field: string; answer: string },
): Promise<unknown> {
  return postEquipeCommand(accountId, {
    type: "answer_conflict",
    payload: { section: input.section, field: input.field, answer: input.answer },
  });
}

/** Approve the open plan at the exact version seen. */
export async function approveEquipePlan(
  accountId: string,
  input: { expectedVersionHash: string },
): Promise<unknown> {
  return postEquipeCommand(accountId, {
    type: "approve_plan",
    payload: { expectedVersionHash: input.expectedVersionHash },
  });
}

/** Approve the open mandate at the exact version seen. */
export async function approveEquipeMandate(
  accountId: string,
  input: { expectedVersionHash: string },
): Promise<unknown> {
  return postEquipeCommand(accountId, {
    type: "approve_mandate",
    payload: { expectedVersionHash: input.expectedVersionHash },
  });
}

/** Approve the brand voice text agreed with the Strategist. */
export async function approveEquipeBrandVoice(
  accountId: string,
  input: { voice: string },
): Promise<unknown> {
  return postEquipeCommand(accountId, {
    type: "approve_brand_voice",
    payload: { voice: input.voice },
  });
}

/** Agree to run the account in manual mode (no verified connection). */
export async function agreeEquipeManualMode(accountId: string): Promise<unknown> {
  return postEquipeCommand(accountId, { type: "agree_manual_mode", payload: {} });
}

export async function approveEquipeAutomaticPublication(
  accountId: string,
  input: { expectedVersionHash: string },
): Promise<unknown> {
  return postEquipeCommand(accountId, { type: "approve_automatic_publication", payload: input });
}

/** Decide an open Strategist idea at the exact version seen. */
export async function decideEquipeIdea(
  accountId: string,
  input: { ideaId: string; decision: "approve" | "reject"; expectedVersionHash: string; reason?: string },
): Promise<unknown> {
  return postEquipeCommand(accountId, {
    type: "decide_idea",
    payload: {
      ideaId: input.ideaId,
      decision: input.decision,
      expectedVersionHash: input.expectedVersionHash,
      ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
    },
  });
}

/** Lift one pause (the module decides who may resume each origin). */
export async function resumeEquipePause(
  accountId: string,
  input: { pauseId: string },
): Promise<unknown> {
  return postEquipeCommand(accountId, {
    type: "resume_pause",
    payload: { pauseId: input.pauseId },
  });
}
