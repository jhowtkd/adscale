// Ports of the Equipe module ("Operação da conta").
//
// Only repositories/unit of work, the Clock and the AdscaleGateway are used
// by the implantação commands in this ticket. Notifier, Agents and Publisher
// are the seams the plan names, defined here so later tickets (#549+) can
// plug the real adapters; test fakes live in ./testing.

import type { Clock } from "../domain";
import type { EquipeUnitOfWork } from "../data";

/** Read-only lookups into Trabalho, Peça, oferta and marca. */
export type AdscaleClientProfileRef = {
  id: string;
  workspaceId: string;
  /** Brand name for the client screens; absent in old fakes. */
  name?: string | null;
};

export type AdscaleAssetRef = {
  id: string;
  workspaceId: string;
  kind: string;
};

export type AdscaleCreativeWorkRef = {
  id: string;
  workspaceId: string;
};

export type AdscaleCreativeWorkOutputRef = {
  id: string;
  workspaceId: string;
  workId: string;
  /** Existing media URL, for visual review of a submitted Peça. */
  imageUrl?: string;
};

export type AdscaleOfferRef = {
  id: string;
  workspaceId: string;
};

// #582 — directory reads for the internal open-account form: workspace
// names, the workspace's brands, and its members (user id + name + email).
export type AdscaleWorkspaceRef = {
  id: string;
  name: string;
};

export type AdscaleWorkspaceMemberRef = {
  userId: string;
  name: string | null;
  email: string | null;
};

export interface AdscaleGateway {
  getClientProfile(workspaceId: string, clientProfileId: string): Promise<AdscaleClientProfileRef | null>;
  getAsset(assetId: string): Promise<AdscaleAssetRef | null>;
  /** Unused in #544; kept for the approval/publication commands. */
  getCreativeWork(workId: string): Promise<AdscaleCreativeWorkRef | null>;
  /** Output (Peça) behind an item version; checked against its work. */
  getCreativeWorkOutput(outputId: string): Promise<AdscaleCreativeWorkOutputRef | null>;
  /** Unused in #544; kept for caption triage against the catalog. */
  getOffer(offerId: string): Promise<AdscaleOfferRef | null>;
  // #582 — directory reads for the internal open-account form. Same
  // workspace scoping as the lookups above: a mismatched workspace reads
  // as absent, so the gateway can never leak another workspace.
  getWorkspace(workspaceId: string): Promise<AdscaleWorkspaceRef | null>;
  listClientProfiles(workspaceId: string): Promise<AdscaleClientProfileRef[]>;
  listWorkspaceMembers(workspaceId: string): Promise<AdscaleWorkspaceMemberRef[]>;
}

/**
 * Notification sender. NEVER called inside a command transaction: commands
 * record `notification.requested` events in the same transaction as the
 * state change, and a later job (#549) reads those events and calls this.
 */
export type EquipeNotification = {
  workspaceId: string;
  accountId: string;
  recipientRole: string;
  templateKey: string;
  detail?: unknown;
};

export interface Notifier {
  send(notification: EquipeNotification): Promise<void>;
}

/**
 * Agent runner seam (Estrategista IA / Especialistas IA). Unused in #544:
 * proposals arrive in command payloads and jobs trigger agents later.
 */
export type AgentTask = {
  kind: string;
  workspaceId: string;
  accountId: string;
  input: unknown;
};

export type AgentTaskResult = {
  ok: boolean;
  output?: unknown;
  error?: string;
};

export interface Agents {
  runTask(task: AgentTask): Promise<AgentTaskResult>;
}

/**
 * Instagram publisher seam (#548). Two steps, like the Graph content
 * publishing API: create the container, then publish it. The dispatch
 * persists the container id between the two calls, so a retry reuses the
 * stored container and never creates another. Called OUTSIDE command
 * transactions — never from inside `transact`.
 */
export type CreateContainerInput = {
  workspaceId: string;
  accountId: string;
  itemId: string;
  versionHash: string;
  destinationIgUserId: string;
  caption: string;
  /** Creative-work output id; the publisher resolves the media URL. */
  mediaRef: string;
};

export type PublishContainerInput = CreateContainerInput & {
  containerId: string;
};

export type RecentMediaInput = {
  workspaceId: string;
  accountId: string;
  destinationIgUserId: string | null;
  /** Media id returned by our publish request, if it was durably recorded. */
  externalId?: string | null;
  /** Stored container id, when the send reached the container step. */
  containerId?: string | null;
  caption: string;
  /** Only media at or after this instant counts as a match candidate. */
  since?: Date;
};

export type RecentMedia = {
  externalId: string;
  /** Identity of the account whose media was read with the scoped credential. */
  igUserId?: string;
  /** Only set when the provider itself proves the container→media relationship. */
  containerId?: string;
  caption: string | null;
  permalink: string | null;
  takenAt: Date | null;
};

export type DeleteMediaInput = {
  workspaceId: string;
  accountId: string;
  externalId: string;
};

export interface Publisher {
  createContainer(input: CreateContainerInput): Promise<{ containerId: string }>;
  publishContainer(input: PublishContainerInput): Promise<{ externalId: string; permalink?: string }>;
  findRecentMedia(input: RecentMediaInput): Promise<RecentMedia[]>;
  deleteMedia(input: DeleteMediaInput): Promise<{ deleted: boolean }>;
}

/**
 * The send may or may not have happened (timeout, network failure, 5xx):
 * the item goes to `verifying` and reconcile looks the media up. NEVER a
 * blind re-publish on this error.
 */
export class PublisherUncertainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublisherUncertainError";
  }
}

/**
 * The send definitively did not happen (validation, auth). `code` names
 * the cause: `connection_expired` / `connection_revoked` also flip the
 * stored connection state; anything else is a plain send failure.
 */
export class PublisherFailedError extends Error {
  constructor(
    message: string,
    readonly code: string = "publish_failed",
  ) {
    super(message);
    this.name = "PublisherFailedError";
  }
}

export const PUBLISHER_CONNECTION_EXPIRED = "connection_expired";
export const PUBLISHER_CONNECTION_REVOKED = "connection_revoked";

export type EquipeTaskEvent = { id: string; name: string; data: Record<string, unknown> };

export type EquipeModuleDeps = {
  sendTaskEvent?: (event: EquipeTaskEvent) => Promise<unknown>;
  uow: EquipeUnitOfWork;
  clock: Clock;
  gateway: AdscaleGateway;
  /** Delivery seam; stored for later tickets, never called in transactions. */
  notifier?: Notifier;
  agents?: Agents;
  publisher?: Publisher;
  /**
   * Workspace gate override. Defaults to the env-based
   * `isEquipeEnabledForWorkspace`; tests inject a stub.
   */
  isEnabledForWorkspace?: (workspaceId: string) => boolean;
  /**
   * Publication kill-switch override (#548). Defaults to the env-based
   * `isEquipePublishEnabled`; tests inject a stub.
   */
  isPublishEnabled?: () => boolean;
};
