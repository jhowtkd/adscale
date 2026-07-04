import type OpenAI from "openai";
import type { ChatCompletionChunk } from "openai/resources/chat/completions";
import { env } from "@/server/validation/env";
import type {
  AssistantModelClient,
  AssistantModelRequest,
  AssistantStreamEvent,
} from "./client";
import { getMiniMaxClient } from "./minimax-client";
import { stripReasoningFromDelta } from "./reasoning-sanitizer";

interface ToolCallAccumulator {
  id: string;
  name: string;
  argumentsJson: string;
}

export interface MiniMaxModelAdapterOptions {
  client?: OpenAI;
}

export class MiniMaxModelAdapter implements AssistantModelClient {
  private readonly client: OpenAI;

  constructor(options: MiniMaxModelAdapterOptions = {}) {
    this.client = options.client ?? getMiniMaxClient();
  }

  async *stream(request: AssistantModelRequest): AsyncIterable<AssistantStreamEvent> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: request.systemPrompt },
      ...request.messages.map((message) => {
        if (message.role === "user") {
          return { role: "user" as const, content: message.content };
        }
        if (message.role === "tool") {
          return {
            role: "tool" as const,
            tool_call_id: message.toolCallId,
            content: message.content,
          };
        }
        // assistant turn: map tool calls to the OpenAI tool_calls shape.
        if (message.toolCalls && message.toolCalls.length > 0) {
          return {
            role: "assistant" as const,
            content: message.content ?? null,
            tool_calls: message.toolCalls.map((call) => ({
              id: call.id,
              type: "function" as const,
              function: {
                name: call.name,
                arguments: call.argumentsJson || "{}",
              },
            })),
          };
        }
        return {
          role: "assistant" as const,
          content: message.content ?? "",
        };
      }),
    ];

    const tools = request.tools?.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));

    const stream = await this.client.chat.completions.create({
      model: env.MINIMAX_MODEL,
      stream: true,
      messages,
      ...(tools && tools.length > 0 ? { tools } : {}),
      extra_body: { thinking: { type: "disabled" } },
    } as Parameters<OpenAI["chat"]["completions"]["create"]>[0]);

    const toolCalls = new Map<number, ToolCallAccumulator>();

    for await (const chunk of stream as AsyncIterable<ChatCompletionChunk>) {
      const choice = chunk.choices[0];
      if (!choice?.delta) continue;

      const delta = stripReasoningFromDelta(
        choice.delta as unknown as Record<string, unknown>
      );

      if (delta.content) {
        yield { type: "text_delta", text: delta.content };
      }

      if (delta.tool_calls) {
        for (const partial of delta.tool_calls) {
          const index = partial.index ?? 0;
          const existing = toolCalls.get(index) ?? {
            id: partial.id ?? "",
            name: partial.function?.name ?? "",
            argumentsJson: "",
          };

          if (partial.id) existing.id = partial.id;
          if (partial.function?.name) existing.name = partial.function.name;
          if (partial.function?.arguments) {
            existing.argumentsJson += partial.function.arguments;
          }

          toolCalls.set(index, existing);
        }
      }

      if (choice.finish_reason === "tool_calls" || choice.finish_reason === "stop") {
        for (const accumulated of toolCalls.values()) {
          if (accumulated.id && accumulated.name) {
            yield {
              type: "tool_call",
              id: accumulated.id,
              name: accumulated.name,
              argumentsJson: accumulated.argumentsJson || "{}",
            };
          }
        }
        toolCalls.clear();
      }
    }

    yield { type: "done" };
  }
}

export function createMiniMaxModelAdapter(
  options?: MiniMaxModelAdapterOptions
): AssistantModelClient {
  return new MiniMaxModelAdapter(options);
}
