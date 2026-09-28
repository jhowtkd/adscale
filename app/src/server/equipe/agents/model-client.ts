// Model-call surface for the Equipe agents (#550, multi-provider #588).
//
// Agents talk to `EquipeModelClient` only. Production routes each role to
// one client per provider (see runner.ts); tests inject fakes, so no agent
// test touches the network.
//
// Providers: OpenAI (the app's shared singleton), Meta (an OpenAI-SDK
// instance on the Meta Model API base URL — never the singleton), and
// Anthropic (anthropic-client.ts, Messages API).

import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { ZodType } from "zod";
import { getOpenAI } from "@/server/ai/utils";
import { env } from "@/server/validation/env";
import type { EquipeEffort } from "./provider";

export type ModelTextPart = {
  type: "text";
  text: string;
  /**
   * Anthropic-only hint: put a prompt-cache breakpoint on this block.
   * The OpenAI/Meta mappers strip it — it never reaches their wire.
   */
  cacheBreakpoint?: boolean;
};
export type ModelImagePart = { type: "image_url"; image_url: { url: string } };

export type ModelAssistantToolCall = {
  id: string;
  name: string;
  argumentsJson: string;
};

export type ModelMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | Array<ModelTextPart | ModelImagePart> }
  | {
      role: "assistant";
      content: string | null;
      toolCalls?: ModelAssistantToolCall[];
      /**
       * Opaque provider payload the mapper replays verbatim (Anthropic
       * preserved thinking). Clients that don't need it ignore it.
       */
      providerContent?: unknown;
    }
  | { role: "tool"; toolCallId: string; content: string };

export type ModelTool = {
  name: string;
  description: string;
  /** JSON Schema for the function arguments. */
  parameters: Record<string, unknown>;
};

export type ModelCallRequest = {
  model: string;
  messages: ModelMessage[];
  tools?: ModelTool[];
  /**
   * Provider-neutral structured output: each client maps the zod schema
   * to its own wire format (OpenAI/Meta: response_format, Anthropic:
   * output_config.format).
   */
  output?: { name: string; schema: ZodType };
  /** Reasoning level; the runner fills it from the role config. */
  effort?: EquipeEffort;
  maxTokens?: number;
  /**
   * Anthropic-only hint: "auto" sends top-level cache_control so the
   * request reuses the previous request's cached prefix (tools →
   * system → messages). The OpenAI/Meta clients ignore it.
   */
  cache?: "auto";
};

export type ModelStopReason = "stop" | "tool_calls" | "max_tokens" | "refusal";

export type ModelUsage = {
  /** Uncached input tokens only — cache reads are reported separately. */
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

/** Per-call usage the agents report to the runner's ledger hook. */
export type ModelCallUsage = { model: string } & ModelUsage;

export type ModelCallResponse = {
  content: string | null;
  toolCalls: ModelAssistantToolCall[];
  usage: ModelUsage;
  stopReason: ModelStopReason;
  /**
   * Opaque provider payload for the NEXT request (Anthropic returns the
   * raw response content so the tool loop can replay it verbatim).
   */
  providerContent?: unknown;
};

export interface EquipeModelClient {
  chat(request: ModelCallRequest): Promise<ModelCallResponse>;
}

/**
 * The model hit the output limit before finishing. Retryable: the caller
 * failed the task, and a retry (or a larger limit) may complete it.
 */
export class EquipeModelTruncatedError extends Error {
  readonly retryable = true as const;

  constructor(message = "equipe_model_truncated") {
    super(message);
    this.name = "EquipeModelTruncatedError";
  }
}

/** The model refused the request (safety). Never retried. */
export class EquipeModelRefusalError extends Error {
  readonly retryable = false as const;

  constructor(message = "equipe_model_refused") {
    super(message);
    this.name = "EquipeModelRefusalError";
  }
}

export function toOpenAIMessages(messages: ModelMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
  return messages.map((message) => {
    switch (message.role) {
      case "system":
        return { role: "system", content: message.content };
      case "user":
        // Rebuilt part by part so the Anthropic-only cacheBreakpoint
        // hint never leaks onto the Chat Completions wire.
        return {
          role: "user",
          content:
            typeof message.content === "string"
              ? message.content
              : message.content.map((part) =>
                  part.type === "image_url"
                    ? { type: "image_url" as const, image_url: { url: part.image_url.url } }
                    : { type: "text" as const, text: part.text },
                ),
        };
      case "tool":
        return { role: "tool", tool_call_id: message.toolCallId, content: message.content };
      default:
        return {
          role: "assistant",
          content: message.content,
          ...(message.toolCalls && message.toolCalls.length > 0
            ? {
                tool_calls: message.toolCalls.map((call) => ({
                  id: call.id,
                  type: "function" as const,
                  function: { name: call.name, arguments: call.argumentsJson },
                })),
              }
            : {}),
        };
    }
  });
}

export function toOpenAITools(tools: ModelTool[]): OpenAI.Chat.ChatCompletionTool[] {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

/**
 * Shared Chat Completions body: OpenAI and Meta differ only in transport.
 * The Anthropic-only `cache` hint is ignored here (never spread in).
 */
export function toChatCompletionsParams(request: ModelCallRequest): {
  model: string;
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  tools?: OpenAI.Chat.ChatCompletionTool[];
  response_format?: OpenAI.ResponseFormatJSONSchema;
  max_completion_tokens?: number;
} {
  return {
    model: request.model,
    messages: toOpenAIMessages(request.messages),
    ...(request.tools && request.tools.length > 0 ? { tools: toOpenAITools(request.tools) } : {}),
    ...(request.output !== undefined
      ? { response_format: zodResponseFormat(request.output.schema, request.output.name) }
      : {}),
    ...(request.maxTokens !== undefined ? { max_completion_tokens: request.maxTokens } : {}),
  };
}

type ChatCompletionsWireResponse = Pick<OpenAI.Chat.ChatCompletion, "choices" | "usage">;

export function toModelResponse(response: ChatCompletionsWireResponse): ModelCallResponse {
  const choice = response.choices[0];
  const toolCalls: ModelAssistantToolCall[] = (choice?.message?.tool_calls ?? [])
    .filter((call) => call.type === "function")
    .map((call) => ({
      id: call.id,
      name: call.function.name,
      argumentsJson: call.function.arguments,
    }));
  const finishReason = choice?.finish_reason;
  // prompt_tokens INCLUDES cached tokens on this API: subtract so the
  // ledger never double-counts. No write surcharge on Meta/OpenAI.
  const cacheReadTokens = response.usage?.prompt_tokens_details?.cached_tokens ?? 0;
  return {
    content: choice?.message?.content ?? null,
    toolCalls,
    usage: {
      inputTokens: Math.max(0, (response.usage?.prompt_tokens ?? 0) - cacheReadTokens),
      outputTokens: response.usage?.completion_tokens ?? 0,
      cacheReadTokens,
      cacheWriteTokens: 0,
    },
    stopReason:
      finishReason === "length"
        ? "max_tokens"
        : finishReason === "content_filter"
          ? "refusal"
          : finishReason === "tool_calls" || finishReason === "function_call"
            ? "tool_calls"
            : "stop",
  };
}

export class OpenAIEquipeModelClient implements EquipeModelClient {
  private readonly client: OpenAI;

  constructor(client?: OpenAI) {
    this.client = client ?? getOpenAI();
  }

  async chat(request: ModelCallRequest): Promise<ModelCallResponse> {
    // Effort is a Meta/Anthropic control; OpenAI pilot models use
    // provider defaults, so the request field is ignored here.
    const response = await this.client.chat.completions.create(toChatCompletionsParams(request));
    return toModelResponse(response);
  }
}

export const META_MODEL_API_BASE_URL = "https://api.meta.ai/v1";

/** Dedicated Meta instance — never the shared getOpenAI() singleton. */
export function createMetaSdk(apiKey: string): OpenAI {
  // maxRetries: 0 because the client's retry loop owns the policy.
  return new OpenAI({ baseURL: META_MODEL_API_BASE_URL, apiKey, maxRetries: 0 });
}

/** 4 attempts total: the initial call plus 3 backoff retries. */
const META_MAX_ATTEMPTS = 4;
const META_RETRY_BASE_DELAY_MS = 500;

export type MetaEquipeModelClientDeps = {
  client?: OpenAI;
  apiKey?: string;
  /** Injected in tests to skip real waiting. */
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isMetaRetryable(error: unknown): boolean {
  // Typed SDK error only — no message matching. The Contributor tier is
  // 100 requests/min per team, so 429s are expected under load.
  return (
    error instanceof OpenAI.APIError &&
    (error.status === 429 || (typeof error.status === "number" && error.status >= 500))
  );
}

export class MetaEquipeModelClient implements EquipeModelClient {
  private sdk: OpenAI | null;
  private readonly apiKey: string | undefined;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(deps?: MetaEquipeModelClientDeps) {
    this.sdk = deps?.client ?? null;
    this.apiKey = deps?.apiKey;
    this.sleep = deps?.sleep ?? defaultSleep;
  }

  private getSdk(): OpenAI {
    if (!this.sdk) {
      const apiKey = this.apiKey ?? env.META_MODEL_API_KEY;
      if (!apiKey) {
        throw new Error("meta_model_api_key_missing");
      }
      this.sdk = createMetaSdk(apiKey);
    }
    return this.sdk;
  }

  async chat(request: ModelCallRequest): Promise<ModelCallResponse> {
    // Muse Spark always reasons: "none" is a 400, so the type doesn't
    // even offer it, and an unset effort falls back to medium.
    const reasoningEffort = request.effort ?? "medium";
    const params = toChatCompletionsParams(request);
    let attempt = 0;
    for (;;) {
      attempt += 1;
      try {
        const response = await this.getSdk().chat.completions.create({
          ...params,
          // Meta Standard also accepts "max", which the OpenAI SDK type
          // omits — hence the cast at this one boundary.
          reasoning_effort: reasoningEffort as OpenAI.ReasoningEffort,
        });
        return toModelResponse(response);
      } catch (error) {
        if (!isMetaRetryable(error) || attempt >= META_MAX_ATTEMPTS) {
          throw error;
        }
        const delayMs =
          META_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
        await this.sleep(delayMs);
      }
    }
  }
}
