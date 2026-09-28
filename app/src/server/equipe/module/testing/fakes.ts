// Test fakes for the module ports: in-memory gateway, recording notifier,
// fixed-response agents, recording publisher.

import {
  PublisherFailedError,
  PublisherUncertainError,
  type AdscaleAssetRef,
  type AdscaleClientProfileRef,
  type AdscaleCreativeWorkOutputRef,
  type AdscaleCreativeWorkRef,
  type AdscaleGateway,
  type AdscaleOfferRef,
  type Agents,
  type AgentTask,
  type AgentTaskResult,
  type CreateContainerInput,
  type DeleteMediaInput,
  type EquipeNotification,
  type Notifier,
  type PublishContainerInput,
  type Publisher,
  type RecentMedia,
  type RecentMediaInput,
} from "../ports";

export class FakeAdscaleGateway implements AdscaleGateway {
  profiles = new Map<string, AdscaleClientProfileRef>();
  assets = new Map<string, AdscaleAssetRef>();
  works = new Map<string, AdscaleCreativeWorkRef>();
  outputs = new Map<string, AdscaleCreativeWorkOutputRef>();
  offers = new Map<string, AdscaleOfferRef>();

  addProfile(ref: AdscaleClientProfileRef): void {
    this.profiles.set(ref.id, ref);
  }

  addAsset(ref: AdscaleAssetRef): void {
    this.assets.set(ref.id, ref);
  }

  async getClientProfile(
    workspaceId: string,
    clientProfileId: string,
  ): Promise<AdscaleClientProfileRef | null> {
    const found = this.profiles.get(clientProfileId);
    return found && found.workspaceId === workspaceId ? found : null;
  }

  async getAsset(assetId: string): Promise<AdscaleAssetRef | null> {
    return this.assets.get(assetId) ?? null;
  }

  async getCreativeWork(workId: string): Promise<AdscaleCreativeWorkRef | null> {
    return this.works.get(workId) ?? null;
  }

  addOutput(ref: AdscaleCreativeWorkOutputRef): void {
    this.outputs.set(ref.id, ref);
  }

  async getCreativeWorkOutput(outputId: string): Promise<AdscaleCreativeWorkOutputRef | null> {
    return this.outputs.get(outputId) ?? null;
  }

  async getOffer(offerId: string): Promise<AdscaleOfferRef | null> {
    return this.offers.get(offerId) ?? null;
  }
}

/** Records notifications; commands must never call it (see ports.ts). */
export class RecordingNotifier implements Notifier {
  sends: EquipeNotification[] = [];

  async send(notification: EquipeNotification): Promise<void> {
    this.sends.push(notification);
  }
}

export class FixedAgents implements Agents {
  constructor(private readonly outputs: Record<string, unknown> = {}) {}

  async runTask(task: AgentTask): Promise<AgentTaskResult> {
    if (!(task.kind in this.outputs)) {
      return { ok: false, error: `no stub for agent task ${task.kind}` };
    }
    return { ok: true, output: this.outputs[task.kind] };
  }
}

export type FakePublisherBehavior =
  | { kind: "succeed" }
  | { kind: "fail"; code?: string; message?: string }
  | { kind: "uncertain"; message?: string };

/**
 * Recording two-step publisher (#548). Every call is recorded; behaviors
 * are scriptable per step (default: succeed). `fail` throws
 * PublisherFailedError (definitive), `uncertain` throws
 * PublisherUncertainError (timeout/ambiguous → verifying).
 */
export class FakePublisher implements Publisher {
  creates: CreateContainerInput[] = [];
  publishes: PublishContainerInput[] = [];
  lookups: RecentMediaInput[] = [];
  deletes: DeleteMediaInput[] = [];
  recentMedia: RecentMedia[] = [];
  deleteResult: { deleted: boolean } = { deleted: true };
  createBehavior: FakePublisherBehavior = { kind: "succeed" };
  publishBehavior: FakePublisherBehavior = { kind: "succeed" };
  private containers = 0;
  private media = 0;

  /** Queued one-shot behaviors, consumed before the sticky behavior. */
  private readonly queued = new Map<"create" | "publish", FakePublisherBehavior[]>();

  /** Total publish attempts (every call, whatever the outcome). */
  get publishAttempts(): number {
    return this.publishes.length;
  }

  failNext(step: "create" | "publish", behavior: FakePublisherBehavior): void {
    const list = this.queued.get(step) ?? [];
    list.push(behavior);
    this.queued.set(step, list);
  }

  private nextBehavior(step: "create" | "publish"): FakePublisherBehavior {
    const list = this.queued.get(step);
    const oneShot = list?.shift();
    if (oneShot) return oneShot;
    return step === "create" ? this.createBehavior : this.publishBehavior;
  }

  private throwFor(behavior: FakePublisherBehavior): never {
    if (behavior.kind === "uncertain") {
      throw new PublisherUncertainError(behavior.message ?? "tempo esgotado no Instagram");
    }
    if (behavior.kind === "fail") {
      throw new PublisherFailedError(
        behavior.message ?? "o Instagram recusou a publicação",
        behavior.code ?? "publish_failed",
      );
    }
    throw new PublisherFailedError("o Instagram recusou a publicação", "publish_failed");
  }

  async createContainer(input: CreateContainerInput): Promise<{ containerId: string }> {
    this.creates.push(input);
    const behavior = this.nextBehavior("create");
    if (behavior.kind !== "succeed") this.throwFor(behavior);
    this.containers += 1;
    return { containerId: `container_${this.containers}` };
  }

  async publishContainer(
    input: PublishContainerInput,
  ): Promise<{ externalId: string; permalink?: string }> {
    this.publishes.push(input);
    const behavior = this.nextBehavior("publish");
    if (behavior.kind !== "succeed") this.throwFor(behavior);
    this.media += 1;
    return {
      externalId: `ig_media_${this.media}`,
      permalink: `https://instagram.test/p/${this.media}`,
    };
  }

  async findRecentMedia(input: RecentMediaInput): Promise<RecentMedia[]> {
    this.lookups.push(input);
    return this.recentMedia.map((row) => ({ ...row }));
  }

  async deleteMedia(input: DeleteMediaInput): Promise<{ deleted: boolean }> {
    this.deletes.push(input);
    return { ...this.deleteResult };
  }
}
