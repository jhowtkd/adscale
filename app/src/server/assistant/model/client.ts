export type AssistantStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_call"; id: string; name: string; argumentsJson: string }
  | { type: "done" };

export interface AssistantModelMessage {
  role: "user" | "assistant";
  content: string;
}

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
