// Anthropic Messages API client for the Equipe agents (#588).
//
// Runs the orchestration (strategist) and quality-gate (reviewer) models.
// Authoritative facts for `claude-opus-5-5`, do not "fix" them:
// - system is a top-level string, never a message;
// - effort lives in output_config (low|medium|high|xhigh|max), always sent
//   explicitly — the API default is medium;
// - NO `thinking` field (always on; disabled/budget is a 400) and NO
//   temperature/top_p/top_k (400);
// - NO tool_choice any/tool (400) — it stays unset;
// - max_tokens covers thinking + answer;
// - response content is read by block type, never by position.

import Anthropic from "@anthropic-ai/sdk";
import { zodResponseFormat } from "openai/helpers/zod";
import { env } from "@/server/validation/env";
import type {
  EquipeModelClient,
  ModelAssistantToolCall,
  ModelCallRequest,
  ModelCallResponse,
  ModelMessage,
  ModelStopReason,
} from "./model-client";
import type { EquipeEffort } from "./provider";

/** Minimal response shape the client reads. The real SDK type fits it. */
export type AnthropicResponseBlock = {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
};

export type AnthropicMessageResponse = {
  content: AnthropicResponseBlock[];
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  };
};

/**
 * Structural seam for the SDK: production passes a real `Anthropic`
 * instance, tests pass a fake. Method shorthand keeps the params
 * bivariant so both fit.
 */
export type AnthropicSdkLike = {
  messages: {
    create(params: Anthropic.MessageCreateParamsNonStreaming, options?: { maxRetries?: number }): Promise<AnthropicMessageResponse>;
  };
};

export type AnthropicEquipeModelClientDeps = {
  sdk?: AnthropicSdkLike;
  apiKey?: string;
};

/**
 * 3 SDK retries + the initial attempt = 4 attempts, matching the Meta
 * client. The SDK retries 429/5xx on its own — never double-retry here.
 */
export const ANTHROPIC_MAX_RETRIES = 3;

/** Fallback when the caller sends no limit; every agent passes its own. */
export const ANTHROPIC_DEFAULT_MAX_TOKENS = 16000;

export function createAnthropicSdk(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, maxRetries: ANTHROPIC_MAX_RETRIES });
}

function toSystem(messages: ModelMessage[]): string | undefined {
  const parts = messages.flatMap((message) => (message.role === "system" ? [message.content] : []));
  return parts.length > 0 ? parts.join("\n\n") : undefined;
}

function toImageBlock(url: string): Anthropic.ImageBlockParam {
  const dataUrl = /^data:([^;,]+);base64,(.*)$/.exec(url);
  if (dataUrl) {
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: dataUrl[1] as Anthropic.Base64ImageSource["media_type"],
        data: dataUrl[2] ?? "",
      },
    };
  }
  return { type: "image", source: { type: "url", url } };
}

function toUserContent(
  content: string | Array<{ type: string; text?: string; cacheBreakpoint?: boolean; image_url?: { url: string } }>,
): Anthropic.MessageParam["content"] {
  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }
  return content.map((part) =>
    part.type === "image_url" && part.image_url
      ? toImageBlock(part.image_url.url)
      : {
          type: "text",
          text: part.text ?? "",
          ...(part.cacheBreakpoint === true ? { cache_control: { type: "ephemeral" as const } } : {}),
        },
  );
}

function parseToolInput(argumentsJson: string): unknown {
  try {
    return JSON.parse(argumentsJson || "{}");
  } catch {
    // The tool already ran with an error for bad JSON; replaying must not
    // crash the loop. History rebuild only (live turns replay verbatim).
    return {};
  }
}

function toAssistantContent(message: {
  content: string | null;
  toolCalls?: ModelAssistantToolCall[];
  providerContent?: unknown;
}): Anthropic.MessageParam["content"] {
  // PRESERVED THINKING: replay the previous turn byte-for-byte, thinking
  // blocks included, or later requests in the loop fail.
  if (Array.isArray(message.providerContent)) {
    return message.providerContent as Anthropic.ContentBlockParam[];
  }
  const blocks: Anthropic.ContentBlockParam[] = [];
  if (message.content !== null) {
    blocks.push({ type: "text", text: message.content });
  }
  for (const call of message.toolCalls ?? []) {
    blocks.push({ type: "tool_use", id: call.id, name: call.name, input: parseToolInput(call.argumentsJson) });
  }
  // The API rejects empty content; unreachable in practice (the loop only
  // appends assistant turns that carried tool calls).
  if (blocks.length === 0) {
    blocks.push({ type: "text", text: "" });
  }
  return blocks;
}

export function toAnthropicMessages(messages: ModelMessage[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  let pendingToolResults: Anthropic.ToolResultBlockParam[] = [];
  const flushToolResults = () => {
    if (pendingToolResults.length > 0) {
      // ALL consecutive tool results go in ONE user message.
      out.push({ role: "user", content: pendingToolResults });
      pendingToolResults = [];
    }
  };
  for (const message of messages) {
    if (message.role === "system") continue;
    if (message.role === "tool") {
      pendingToolResults.push({
        type: "tool_result",
        tool_use_id: message.toolCallId,
        content: message.content,
      });
      continue;
    }
    flushToolResults();
    if (message.role === "user") {
      out.push({ role: "user", content: toUserContent(message.content) });
    } else {
      out.push({ role: "assistant", content: toAssistantContent(message) });
    }
  }
  flushToolResults();
  return out;
}

export function toAnthropicEffort(
  effort: EquipeEffort | undefined,
): NonNullable<Anthropic.OutputConfig["effort"]> {
  // Env validation refuses minimal for Anthropic models; map it anyway so
  // the client stays total (minimal is not an Anthropic level).
  if (effort === undefined || effort === "minimal") return "medium";
  return effort;
}

function toOutputFormat(output: { name: string; schema: Parameters<typeof zodResponseFormat>[0] }) {
  // The SDK's zodOutputFormat requires zod v4 and crashes on the Equipe's
  // zod v3 schemas, so convert through the OpenAI helper (which handles
  // v3) and send the identical wire shape {type, schema} that .create()
  // expects. The helper's parse fn is only used by .parse(); the agents
  // parse the JSON text block themselves, as before.
  const converted = zodResponseFormat(output.schema, output.name);
  return {
    type: "json_schema" as const,
    schema: converted.json_schema.schema as { [key: string]: unknown },
  };
}

function toStopReason(stopReason: string | null, toolCalls: ModelAssistantToolCall[]): ModelStopReason {
  // Check the reason before reading content: refusal wins over blocks.
  if (stopReason === "refusal") return "refusal";
  if (stopReason === "max_tokens") return "max_tokens";
  if (stopReason === "tool_use" || toolCalls.length > 0) return "tool_calls";
  return "stop";
}

function toAnthropicModelResponse(response: AnthropicMessageResponse): ModelCallResponse {
  const toolCalls: ModelAssistantToolCall[] = [];
  const texts: string[] = [];
  for (const block of response.content) {
    if (block.type === "tool_use" && block.id && block.name) {
      toolCalls.push({ id: block.id, name: block.name, argumentsJson: JSON.stringify(block.input ?? {}) });
    } else if (block.type === "text" && typeof block.text === "string") {
      texts.push(block.text);
    }
    // thinking/redacted_thinking: ignored for content, preserved below.
  }
  return {
    content: texts.length > 0 ? texts.join("") : null,
    toolCalls,
    usage: {
      // input_tokens is uncached-only on this API: cache reads and
      // writes arrive in their own fields, never folded in (so the
      // ledger prices each at its own rate, never double-counted).
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
    },
    stopReason: toStopReason(response.stop_reason, toolCalls),
    providerContent: response.content,
  };
}

export class AnthropicEquipeModelClient implements EquipeModelClient {
  private sdk: AnthropicSdkLike | null;
  private readonly apiKey: string | undefined;

  constructor(deps?: AnthropicEquipeModelClientDeps) {
    this.sdk = deps?.sdk ?? null;
    this.apiKey = deps?.apiKey;
  }

  private getSdk(): AnthropicSdkLike {
    if (!this.sdk) {
      const apiKey = this.apiKey ?? env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error("anthropic_api_key_missing");
      }
      this.sdk = createAnthropicSdk(apiKey);
    }
    return this.sdk;
  }

  async chat(request: ModelCallRequest): Promise<ModelCallResponse> {
    const system = toSystem(request.messages);
    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: request.model,
      max_tokens: request.maxTokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS,
      // Top-level automatic caching: marks the last cacheable block so
      // a loop reuses the previous iteration's prefix (tools → system
      // → history). Sent only when the caller opts in via cache: auto.
      ...(request.cache === "auto" ? { cache_control: { type: "ephemeral" as const } } : {}),
      ...(system !== undefined ? { system } : {}),
      messages: toAnthropicMessages(request.messages),
      ...(request.tools && request.tools.length > 0
        ? {
            tools: request.tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              input_schema: tool.parameters as Anthropic.Tool.InputSchema,
            })),
          }
        : {}),
      output_config: {
        effort: toAnthropicEffort(request.effort),
        ...(request.output !== undefined ? { format: toOutputFormat(request.output) } : {}),
      },
    };
    // No try/catch: the SDK retries 429/5xx itself (maxRetries above) and
    // anything else propagates typed (Anthropic.APIError, …) to the runner.
    const response = await this.getSdk().messages.create(params, request.noRetries ? { maxRetries: 0 } : undefined);
    return toAnthropicModelResponse(response);
  }
}
