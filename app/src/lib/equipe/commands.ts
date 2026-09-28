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

  constructor(message: string, status: number) {
    super(message);
    this.name = "EquipeCommandError";
    this.status = status;
  }
}

async function postEquipeCommand(
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
  } | null;
  if (!response.ok) {
    throw new EquipeCommandError(
      body?.error ?? "Erro ao enviar comando",
      response.status,
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
