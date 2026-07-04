export type AssistantStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_call"; id: string; name: string; argumentsJson: string }
  | { type: "done" };

export interface AssistantModelToolCall {
  id: string;
  name: string;
  argumentsJson: string;
}

/**
 * Discriminated union covering the three message roles the bounded agent loop
 * needs: plain user turns, assistant turns that may carry tool calls, and the
 * tool results that are appended back so the provider can ground its next step.
 */
export type AssistantModelMessage =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      toolCalls?: AssistantModelToolCall[];
    }
  | { role: "tool"; content: string; toolCallId: string };

export interface AssistantModelTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AssistantModelRequest {
  systemPrompt: string;
  messages: AssistantModelMessage[];
  tools?: AssistantModelTool[];
}

export interface AssistantModelClient {
  stream(request: AssistantModelRequest): AsyncIterable<AssistantStreamEvent>;
}
