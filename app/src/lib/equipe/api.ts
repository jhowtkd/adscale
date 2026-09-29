// Typed readers for the Equipe client API (#552 contract).
//
// GET /api/equipe/accounts → the workspace's accounts (404 when the
// workspace is not in the pilot — that 404 is the client-side gate).
// Every other reader is scoped to one account. Dates arrive as ISO strings.

import { apiFetch } from "@/lib/api-client";

export class EquipeDisabledError extends Error {
  constructor() {
    super("equipe_not_enabled");
    this.name = "EquipeDisabledError";
  }
}

export class EquipeApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "EquipeApiError";
    this.status = status;
  }
}

async function getJson<T>(path: string, { gate404 = false }: { gate404?: boolean } = {}): Promise<T> {
  const response = await apiFetch(path, { method: "GET" });
  if (!response.ok) {
    if (gate404 && response.status === 404) throw new EquipeDisabledError();
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new EquipeApiError(body?.error ?? `GET ${path} failed`, response.status);
  }
  return (await response.json()) as T;
}

// JSON views: same shape as the module views, Dates as ISO strings.

export type EquipeAccountJson = {
  id: string;
  workspaceId: string;
  clientProfileId: string;
  status: string;
  launchedAt: string | null;
  closedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  /** Brand name from the client profile; null when the profile is gone. */
  clientProfileName: string | null;
  /** True while the account holds a decision for the client. */
  pendingDecisions: boolean;
};

export type EquipeFrontJson = {
  id: string;
  key: string;
  status: string;
  calibrationSequence: number;
  roundsUsed: number;
  releasedAt: string | null;
  calibrationStartedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EquipeBatchJson = {
  id: string;
  frontId: string | null;
  title: string;
  status: string;
  approveByAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EquipeItemJson = {
  id: string;
  frontId: string;
  batchId: string | null;
  creativeWorkId: string | null;
  status: string;
  scheduledFor: string | null;
  deadlineAt: string | null;
  destination: string | null;
  currentVersionHash: string | null;
  publishedOutputId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EquipeItemVersionJson = {
  id: string;
  itemId: string;
  versionHash: string;
  creativeWorkOutputId: string | null;
  caption: string;
  scheduledFor: string | null;
  destination: string | null;
  destinationIgUserId?: string | null;
  authorRole: string;
  authorId: string | null;
  reviewerFindings: unknown;
  createdAt: string;
};

export type EquipeReceiptJson = {
  id: string;
  personKind: string;
  personId: string | null;
  personRole: string | null;
  objectType: string;
  objectId: string;
  objectVersion: string | null;
  action: string;
  detail: unknown;
  createdAt: string;
};

export type EquipeIdeaJson = {
  id: string;
  kind: string;
  status: string;
  payload: Record<string, unknown>;
  resultingPlanVersion: number | null;
  resultingMandateVersion: number | null;
  decidedAt: string | null;
  receiptId: string | null;
  createdAt: string;
  updatedAt: string;
  /** The hash `decide_idea` verifies — set only while the idea is open. */
  versionHash: string | null;
};

export type EquipePauseJson = {
  id: string;
  frontId: string | null;
  level: string;
  scope: string;
  origin: string;
  resumableBy: string;
  status: string;
  reason: string | null;
  liftedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EquipeContextFieldJson = {
  status: string;
  value?: unknown;
  source?: string;
};

export type GoalsDecisionsJson = {
  scope: { confirmed: boolean; digest: string | null; note: string | null };
  materials: Array<{ assetId: string; kind: string; origin: string | null }>;
  contextSections: Array<{
    section: string;
    version: number;
    versionId: string;
    versionHash: string;
    fields: Record<string, EquipeContextFieldJson>;
  }>;
  conflicts: Array<{
    section: string;
    version: number;
    versionId: string;
    field: string;
    question: string;
  }>;
  plan: { id: string; version: number; versionHash: string } | null;
  mandates: Array<{ id: string; version: number; versionHash: string; activation?: boolean }>;
  brandVoice: { approved: boolean; versionHash: string | null };
  connection: { verified: boolean; manualAgreed: boolean };
  publication: {
    mode: "manual" | "automatic";
    canApprove: boolean;
    blockedReason: string | null;
    versionHash: string | null;
    igAccount: string | null;
    mandateVersion: number | null;
    receiptId: string | null;
  };
};

export type EquipePlanJson = {
  id: string;
  version: number;
  status: string;
  content: Record<string, unknown>;
  receiptId: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EquipeMandateJson = {
  id: string;
  frontId: string | null;
  version: number;
  status: string;
  shadow: boolean;
  limits: unknown;
  window: unknown;
  validFrom: string | null;
  validUntil: string | null;
  stopCondition: unknown;
  receiptId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EquipeOnboardingStepJson = {
  id: string;
  step: string;
  status: string;
  owner: string | null;
  dueAt: string | null;
  remindersSent: number;
  remindersCap: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ItemReviewJson = {
  flags: {
    blocked: boolean;
    editedInReview: boolean;
    editWarning: boolean;
    needsConfirmation: boolean;
  };
  status: string;
  batchApprovable: boolean;
  triage: {
    versionHash: string;
    natures: string[];
    path: string;
    warnings: string[];
    qualityRecheckPending: boolean;
  } | null;
};

export type PipelineItemJson = {
  item: EquipeItemJson;
  batch: EquipeBatchJson | null;
  displayState: string;
  review: ItemReviewJson;
  preview: {
    versionHash: string;
    caption: string;
    creativeWorkOutputId: string | null;
  } | null;
};

export type ClientPipelineJson = {
  workspaceId: string;
  accountId: string;
  columns: Array<{ key: string; itemIds: string[] }>;
  items: PipelineItemJson[];
};

export type ItemDetailJson = {
  workspaceId: string;
  accountId: string;
  item: EquipeItemJson;
  batch: EquipeBatchJson | null;
  versions: EquipeItemVersionJson[];
  receipts: EquipeReceiptJson[];
  review: ItemReviewJson;
  destinationAccount: string | null;
  findings: Array<{ versionHash: string; findings: unknown }>;
  triage: Array<{ id: string; eventType: string; payload: unknown; createdAt: string }>;
  activeIntent: {
    id: string;
    status: string;
    versionHash: string;
    scheduledFor: string | null;
    lastError?: string | null;
  } | null;
};

export type IdeasViewJson = {
  workspaceId: string;
  accountId: string;
  ideas: EquipeIdeaJson[];
};

export type GoalsViewJson = {
  workspaceId: string;
  accountId: string;
  plan: EquipePlanJson | null;
  mandates: EquipeMandateJson[];
  onboarding: EquipeOnboardingStepJson[];
  decisions: GoalsDecisionsJson;
};

export type AccountStateJson = {
  workspaceId: string;
  accountId: string;
  status: string;
  fronts: EquipeFrontJson[];
  pendingSteps: EquipeOnboardingStepJson[];
  activePauses: EquipePauseJson[];
};

export async function fetchEquipeAccounts(): Promise<{ accounts: EquipeAccountJson[] }> {
  return getJson<{ accounts: EquipeAccountJson[] }>("/api/equipe/accounts", { gate404: true });
}

export async function fetchAccountState(accountId: string): Promise<AccountStateJson> {
  return getJson<AccountStateJson>(`/api/equipe/accounts/${accountId}`, { gate404: true });
}

export async function fetchPipeline(accountId: string): Promise<ClientPipelineJson> {
  return getJson<ClientPipelineJson>(`/api/equipe/accounts/${accountId}/pipeline`);
}

export async function fetchIdeas(accountId: string): Promise<IdeasViewJson> {
  return getJson<IdeasViewJson>(`/api/equipe/accounts/${accountId}/ideas`);
}

export async function fetchGoals(accountId: string): Promise<GoalsViewJson> {
  return getJson<GoalsViewJson>(`/api/equipe/accounts/${accountId}/goals`);
}

export async function fetchItemDetail(accountId: string, itemId: string): Promise<ItemDetailJson> {
  return getJson<ItemDetailJson>(`/api/equipe/accounts/${accountId}/items/${itemId}`);
}

/**
 * Which of the workspace's accounts holds this item, by asking the
 * existing item endpoints in turn — no new route (convergence freeze).
 * Bare `/pipeline?item=` links from notifications resolve here; unknown
 * ids answer null and the pipeline falls back to the default account.
 * Only the workspace's own accounts are scanned, never another's.
 */
export async function resolveEquipeItemAccount(
  accounts: EquipeAccountJson[],
  itemId: string,
): Promise<string | null> {
  for (const account of accounts) {
    try {
      await fetchItemDetail(account.id, itemId);
      return account.id;
    } catch {
      // Not this account's — keep scanning the workspace's accounts.
    }
  }
  return null;
}

/** Final-image URL for an item version (302 redirect, works as <img src>). */
export function itemImageUrl(
  item: EquipeItemJson,
  version: Pick<EquipeItemVersionJson, "creativeWorkOutputId"> | null,
): string | null {
  if (!item.creativeWorkId || !version?.creativeWorkOutputId) return null;
  return `/api/creative-work/${item.creativeWorkId}/outputs/${version.creativeWorkOutputId}/download`;
}

export function currentVersionOf(detail: ItemDetailJson): EquipeItemVersionJson | null {
  if (!detail.item.currentVersionHash) return null;
  return detail.versions.find((v) => v.versionHash === detail.item.currentVersionHash) ?? null;
}

/** 1-based "vN" label from version order (oldest first, as the API returns). */
export function versionLabel(versions: EquipeItemVersionJson[], versionHash: string | null): string | null {
  if (!versionHash) return null;
  const index = versions.findIndex((v) => v.versionHash === versionHash);
  return index >= 0 ? `v${index + 1}` : null;
}

/**
 * The single state per item, mirroring the server rule: the review status
 * while awaiting a decision, else the lifecycle state.
 */
export function displayStateOf(itemStatus: string, reviewStatus: string): string {
  return itemStatus === "awaiting_approval" || reviewStatus !== "ready" ? reviewStatus : itemStatus;
}
