// Fakes for the load run: seeded RNG, load publisher (latency + failure
// rates), load model client (latency per role + token counts for the cost
// ledger), and the in-memory notification sink. No network anywhere.

import {
  PublisherFailedError,
  PublisherUncertainError,
  type PublishContainerInput,
  type Publisher,
  type RecentMedia,
  type RecentMediaInput,
} from "../../src/server/equipe/module/ports";
import type {
  EquipeModelClient,
  ModelCallRequest,
  ModelCallResponse,
} from "../../src/server/equipe/agents/model-client";
import type { NotificationDeliveryAdapters } from "../../src/server/equipe/jobs/notification-delivery";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Deterministic RNG (mulberry32) so runs are reproducible from --seed. */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 1;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  uniform(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  int(min: number, max: number): number {
    return Math.floor(this.uniform(min, max + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }
}

export type PublisherLoadOptions = {
  latencyMinMs: number;
  latencyMaxMs: number;
  failRate: number;
  uncertainRate: number;
  /** Share of uncertain sends that actually went through (reconcile finds). */
  uncertainActuallyPublishedRate?: number;
  /** Sim clock for takenAt: reconcile matches against sim time, not wall time. */
  now?: () => Date;
};

/**
 * Publisher fake with configurable latency and failure/uncertain rates.
 * Uncertain sends land "verifying"; most actually published, so reconcile
 * confirms them via findRecentMedia; the rest escalate after 1 h.
 */
export class LoadPublisher implements Publisher {
  attempts = 0;
  uncertain = 0;
  failed = 0;
  latenciesMs: number[] = [];
  private containers = 0;
  private media = 0;
  /** containerId → published media (only when the send went through). */
  private readonly published = new Map<string, RecentMedia & { caption: string }>();

  constructor(
    private readonly rng: Rng,
    private readonly options: PublisherLoadOptions,
  ) {}

  private takenAt(): Date {
    return this.options.now ? this.options.now() : new Date();
  }

  private async latency(): Promise<void> {
    const ms = this.rng.uniform(this.options.latencyMinMs, this.options.latencyMaxMs);
    this.latenciesMs.push(Math.round(ms * 10) / 10);
    await sleep(ms);
  }

  private roll(step: string): void {
    this.attempts += 1;
    if (this.rng.chance(this.options.failRate)) {
      this.failed += 1;
      throw new PublisherFailedError(`load ${step} recusado`, "publish_failed");
    }
    if (this.rng.chance(this.options.uncertainRate)) {
      this.uncertain += 1;
      throw new PublisherUncertainError(`load ${step} ambíguo (tempo esgotado)`);
    }
  }

  async createContainer(): Promise<{ containerId: string }> {
    await this.latency();
    this.roll("create");
    this.containers += 1;
    return { containerId: `load_container_${this.containers}` };
  }

  async publishContainer(
    input: PublishContainerInput,
  ): Promise<{ externalId: string; permalink?: string }> {
    await this.latency();
    try {
      this.roll("publish");
    } catch (error) {
      if (error instanceof PublisherUncertainError) {
        const rate = this.options.uncertainActuallyPublishedRate ?? 0.7;
        if (this.rng.chance(rate)) {
          this.media += 1;
          this.published.set(input.containerId, {
            externalId: `ig_media_${this.media}`,
            caption: input.caption,
            permalink: `https://instagram.test/p/${this.media}`,
            takenAt: this.takenAt(),
          });
        }
      }
      throw error;
    }
    this.media += 1;
    const externalId = `ig_media_${this.media}`;
    this.published.set(input.containerId, {
      externalId,
      caption: input.caption,
      permalink: `https://instagram.test/p/${this.media}`,
      takenAt: this.takenAt(),
    });
    return { externalId, permalink: `https://instagram.test/p/${this.media}` };
  }

  async findRecentMedia(input: RecentMediaInput): Promise<RecentMedia[]> {
    await this.latency();
    const direct =
      input.containerId != null ? this.published.get(input.containerId) : undefined;
    if (direct) {
      return [
        {
          externalId: direct.externalId,
          caption: direct.caption,
          permalink: direct.permalink,
          takenAt: direct.takenAt,
        },
      ];
    }
    const matches: RecentMedia[] = [];
    for (const row of this.published.values()) {
      if (row.caption === input.caption) {
        matches.push({
          externalId: row.externalId,
          caption: row.caption,
          permalink: row.permalink,
          takenAt: row.takenAt,
        });
      }
    }
    return matches;
  }

  async deleteMedia(): Promise<{ deleted: boolean }> {
    await this.latency();
    return { deleted: true };
  }
}

export type AgentRoleLoad = {
  latencyMs: [number, number];
  inputTokens: number;
  outputTokens: number;
};

export type ModelLoadOptions = {
  timeScale: number;
  failureRate: number;
  strategist: AgentRoleLoad;
  research: AgentRoleLoad;
  reviewer: AgentRoleLoad;
};

function formatNameOf(request: ModelCallRequest): string | null {
  const format = request.responseFormat as { json_schema?: { name?: unknown } } | null;
  const name = format?.json_schema?.name;
  return typeof name === "string" ? name : null;
}

/**
 * Scripted model client with per-role latency (scaled by --time-scale) and
 * fixed token usage per call, so the #550 cost ledger records realistic
 * spend. Responses satisfy the reviewers/research zod schemas; strategist
 * turns do one read-only tool call (get_account_state) then finish.
 */
export class LoadModelClient implements EquipeModelClient {
  calls: Array<{ role: string; model: string; inputTokens: number; outputTokens: number }> = [];

  constructor(
    private readonly rng: Rng,
    private readonly options: ModelLoadOptions,
  ) {}

  private roleOf(request: ModelCallRequest): { key: "strategist" | "research" | "reviewer"; load: AgentRoleLoad } {
    const format = formatNameOf(request);
    if (format === "equipe_research") return { key: "research", load: this.options.research };
    if (format === "equipe_text_review" || format === "equipe_visual_review") {
      return { key: "reviewer", load: this.options.reviewer };
    }
    if (request.tools && request.tools.length > 0) {
      return { key: "strategist", load: this.options.strategist };
    }
    if (request.maxTokens === 1500) return { key: "reviewer", load: this.options.reviewer };
    if (request.maxTokens === 2000) return { key: "research", load: this.options.research };
    return { key: "strategist", load: this.options.strategist };
  }

  async chat(request: ModelCallRequest): Promise<ModelCallResponse> {
    const { key, load } = this.roleOf(request);
    const scaled = this.rng.uniform(load.latencyMs[0], load.latencyMs[1]) / this.options.timeScale;
    await sleep(Math.max(0, scaled));
    if (this.rng.chance(this.options.failureRate)) {
      throw new Error("load_model_transient");
    }
    this.calls.push({
      role: key,
      model: request.model,
      inputTokens: load.inputTokens,
      outputTokens: load.outputTokens,
    });
    const usage = { inputTokens: load.inputTokens, outputTokens: load.outputTokens };
    if (key === "research") {
      return {
        content: JSON.stringify({
          facts: [{ claim: "carga sintética", source: "material-1", section: "oferta" }],
          diagnosis: "Conta sintética do spike de carga; fatos de exemplo.",
        }),
        toolCalls: [],
        usage,
      };
    }
    if (key === "reviewer") {
      return {
        content: JSON.stringify({
          findings: [
            {
              severity: "info",
              area: "text",
              message: "Legenda sintética dentro do padrão.",
              suggestion: null,
            },
          ],
          summary: "Sem bloqueios.",
        }),
        toolCalls: [],
        usage,
      };
    }
    const sawAssistant = request.messages.some((message) => message.role === "assistant");
    if (!sawAssistant) {
      return {
        content: null,
        toolCalls: [{ id: `call_${this.calls.length}`, name: "get_account_state", argumentsJson: "{}" }],
        usage,
      };
    }
    return {
      content: "Leitura semanal registrada. Nada pendente além das aprovações em aberto.",
      toolCalls: [],
      usage,
    };
  }
}

export type NotificationSinkRecord =
  | { channel: "inbox"; userId: string; workspaceId: string; type: string }
  | { channel: "email"; to: string; subject: string };

/** In-memory notification sink: every recipient "exists", nothing leaves. */
export class NotificationSink {
  readonly records: NotificationSinkRecord[] = [];

  adapters(): NotificationDeliveryAdapters {
    return {
      users: {
        get: async (userId: string) => ({
          email: `${userId}@load.test`,
          emailVerified: true,
          emailNotificationsEnabled: true,
        }),
      },
      inbox: {
        insert: async (input) => {
          this.records.push({
            channel: "inbox",
            userId: input.userId,
            workspaceId: input.workspaceId,
            type: input.type,
          });
        },
      },
      mailer: {
        send: async (input) => {
          this.records.push({ channel: "email", to: input.to, subject: input.subject });
        },
      },
    };
  }
}
