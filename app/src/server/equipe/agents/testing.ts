// Test fake for the model client: scripted responses, no network.

import type {
  EquipeModelClient,
  ModelCallRequest,
  ModelCallResponse,
  ModelUsage,
} from "./model-client";

export type FakeModelResponse = Omit<Partial<ModelCallResponse>, "usage"> & {
  content?: string | null;
  usage?: Partial<ModelUsage>;
};

export function textResponse(content: string): FakeModelResponse {
  return { content, toolCalls: [] };
}

/**
 * Scripted model client. Each chat() call consumes the next response;
 * requests are recorded for assertions. Usage defaults to zero tokens,
 * stopReason to "stop".
 */
export class FakeModelClient implements EquipeModelClient {
  readonly requests: ModelCallRequest[] = [];

  constructor(private readonly script: FakeModelResponse[]) {}

  async chat(request: ModelCallRequest): Promise<ModelCallResponse> {
    this.requests.push(request);
    const next = this.script.shift();
    if (!next) throw new Error("fakeModelClientOutOfResponses");
    return {
      content: next.content ?? null,
      toolCalls: next.toolCalls ?? [],
      usage: {
        inputTokens: next.usage?.inputTokens ?? 0,
        outputTokens: next.usage?.outputTokens ?? 0,
        cacheReadTokens: next.usage?.cacheReadTokens ?? 0,
        cacheWriteTokens: next.usage?.cacheWriteTokens ?? 0,
      },
      stopReason: next.stopReason ?? "stop",
      ...(next.providerContent !== undefined ? { providerContent: next.providerContent } : {}),
    };
  }
}
