// Test fake for the model client: scripted responses, no network.

import type {
  EquipeModelClient,
  ModelCallRequest,
  ModelCallResponse,
} from "./model-client";

export type FakeModelResponse = Partial<ModelCallResponse> & {
  content?: string | null;
};

export function textResponse(content: string): FakeModelResponse {
  return { content, toolCalls: [] };
}

/**
 * Scripted model client. Each chat() call consumes the next response;
 * requests are recorded for assertions. Usage defaults to zero tokens.
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
      usage: next.usage ?? { inputTokens: 0, outputTokens: 0 },
    };
  }
}
