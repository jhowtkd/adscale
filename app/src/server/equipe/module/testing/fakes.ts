// Test fakes for the module ports: in-memory gateway, recording notifier,
// fixed-response agents, recording publisher.

import type {
  AdscaleAssetRef,
  AdscaleClientProfileRef,
  AdscaleCreativeWorkOutputRef,
  AdscaleCreativeWorkRef,
  AdscaleGateway,
  AdscaleOfferRef,
  Agents,
  AgentTask,
  AgentTaskResult,
  EquipeNotification,
  Notifier,
  Publisher,
  PublishPostInput,
  PublishPostResult,
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

export class FakePublisher implements Publisher {
  published: PublishPostInput[] = [];

  async publishPost(input: PublishPostInput): Promise<PublishPostResult> {
    this.published.push(input);
    return { externalId: `ig_${this.published.length}` };
  }
}
