// Test fake of the Anthropic SDK: replays scripted Messages API responses in the real wire format
// (content blocks, stop_reason, usage with the cache fields) through the real AnthropicEquipeModelClient.

import type Anthropic from "@anthropic-ai/sdk";
import { AnthropicEquipeModelClient, type AnthropicMessageResponse, type AnthropicResponseBlock, type AnthropicSdkLike } from "./anthropic-client";

export class FakeAnthropicSdk implements AnthropicSdkLike {
  readonly params: Anthropic.MessageCreateParamsNonStreaming[] = [];
  constructor(private readonly script: AnthropicMessageResponse[]) {}
  messages = {
    create: async (params: Anthropic.MessageCreateParamsNonStreaming): Promise<AnthropicMessageResponse> => {
      this.params.push(structuredClone(params));
      const next = this.script.shift();
      if (!next) throw new Error("fakeAnthropicOutOfResponses");
      return next;
    },
  };
}

export const thinking = (text = "raciocínio interno"): AnthropicResponseBlock => ({ type: "thinking", thinking: text, signature: "sig-1" } as AnthropicResponseBlock);
export const redactedThinking = (): AnthropicResponseBlock => ({ type: "redacted_thinking", data: "opaque" } as AnthropicResponseBlock);
export const textBlock = (text: string): AnthropicResponseBlock => ({ type: "text", text });
export const toolUse = (name: string, input: unknown, id = `toolu-${name}`): AnthropicResponseBlock =>
  ({ type: "tool_use", id, name, input } as AnthropicResponseBlock);

/** One Messages API response: `stop_reason` defaults to what the API sends (`tool_use` when a tool block is there). */
export function reply(content: AnthropicResponseBlock[], stopReason?: string): AnthropicMessageResponse {
  return {
    content,
    stop_reason: stopReason ?? (content.some(block => block.type === "tool_use") ? "tool_use" : "end_turn"),
    usage: { input_tokens: 1200, output_tokens: 300, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  } as AnthropicMessageResponse;
}

export function anthropicClient(script: AnthropicMessageResponse[]) {
  const sdk = new FakeAnthropicSdk(script);
  return { sdk, client: new AnthropicEquipeModelClient({ sdk }) };
}
