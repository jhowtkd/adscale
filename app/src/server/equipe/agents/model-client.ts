// Thin model-call surface over the app's OpenAI client (#550).
//
// Production goes through getOpenAI() — the same singleton the creative
// engine uses. Tests inject fakes implementing EquipeModelClient, so no
// agent test touches the network.

import type OpenAI from "openai";
import { getOpenAI } from "@/server/ai/utils";

export type ModelTextPart = { type: "text"; text: string };
export type ModelImagePart = { type: "image_url"; image_url: { url: string } };

export type ModelAssistantToolCall = {
  id: string;
  name: string;
  argumentsJson: string;
};

export type ModelMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | Array<ModelTextPart | ModelImagePart> }
  | { role: "assistant"; content: string | null; toolCalls?: ModelAssistantToolCall[] }
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
  /** Pass-through to `response_format` (e.g. zodResponseFormat output). */
  responseFormat?: unknown;
  maxTokens?: number;
};

export type ModelCallResponse = {
  content: string | null;
  toolCalls: ModelAssistantToolCall[];
  usage: { inputTokens: number; outputTokens: number };
};

export interface EquipeModelClient {
  chat(request: ModelCallRequest): Promise<ModelCallResponse>;
}

function toOpenAIMessages(messages: ModelMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
  return messages.map((message) => {
    switch (message.role) {
      case "system":
        return { role: "system", content: message.content };
      case "user":
        return { role: "user", content: message.content };
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

export class OpenAIEquipeModelClient implements EquipeModelClient {
  private readonly client: OpenAI;

  constructor(client?: OpenAI) {
    this.client = client ?? getOpenAI();
  }

  async chat(request: ModelCallRequest): Promise<ModelCallResponse> {
    const response = await this.client.chat.completions.create({
      model: request.model,
      messages: toOpenAIMessages(request.messages),
      ...(request.tools && request.tools.length > 0
        ? {
            tools: request.tools.map((tool) => ({
              type: "function" as const,
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
              },
            })),
          }
        : {}),
      ...(request.responseFormat !== undefined
        ? { response_format: request.responseFormat as never }
        : {}),
      ...(request.maxTokens !== undefined ? { max_completion_tokens: request.maxTokens } : {}),
    });
    const choice = response.choices[0];
    const toolCalls: ModelAssistantToolCall[] = (choice?.message?.tool_calls ?? [])
      .filter((call) => call.type === "function")
      .map((call) => ({
        id: call.id,
        name: call.function.name,
        argumentsJson: call.function.arguments,
      }));
    return {
      content: choice?.message?.content ?? null,
      toolCalls,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }
}
