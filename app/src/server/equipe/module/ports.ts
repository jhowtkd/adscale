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
};

export type AdscaleOfferRef = {
  id: string;
  workspaceId: string;
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

/** Instagram publisher seam. Unused in #544; the dispatch job calls it. */
export type PublishPostInput = {
  workspaceId: string;
  accountId: string;
  itemId: string;
  versionHash: string;
  caption: string;
  mediaRef: string;
};

export type PublishPostResult = {
  externalId: string;
};

export interface Publisher {
  publishPost(input: PublishPostInput): Promise<PublishPostResult>;
}

export type EquipeModuleDeps = {
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
};
