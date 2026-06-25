import type { ChatCompletionChunk } from "openai/resources/chat/completions";

export const minimaxStreamChunks: ChatCompletionChunk[] = [
  {
    id: "chunk-1",
    object: "chat.completion.chunk",
    created: 0,
    model: "MiniMax-M3",
    choices: [
      {
        index: 0,
        delta: {
          content: "Hello",
          reasoning_details: [{ text: "should not appear" }],
        } as Record<string, unknown>,
        finish_reason: null,
      },
    ],
  },
  {
    id: "chunk-2",
    object: "chat.completion.chunk",
    created: 0,
    model: "MiniMax-M3",
    choices: [
      {
        index: 0,
        delta: {
          thinking: "internal thought",
        } as Record<string, unknown>,
        finish_reason: null,
      },
    ],
  },
  {
    id: "chunk-3",
    object: "chat.completion.chunk",
    created: 0,
    model: "MiniMax-M3",
    choices: [
      {
        index: 0,
        delta: {
          content: " world",
        },
        finish_reason: null,
      },
    ],
  },
  {
    id: "chunk-4",
    object: "chat.completion.chunk",
    created: 0,
    model: "MiniMax-M3",
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: [
            {
              index: 0,
              id: "call_abc",
              type: "function",
              function: { name: "get_thread_context", arguments: "" },
            },
          ],
        },
        finish_reason: null,
      },
    ],
  },
  {
    id: "chunk-5",
    object: "chat.completion.chunk",
    created: 0,
    model: "MiniMax-M3",
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: [
            {
              index: 0,
              function: { arguments: "{}" },
            },
          ],
        },
        finish_reason: null,
      },
    ],
  },
  {
    id: "chunk-6",
    object: "chat.completion.chunk",
    created: 0,
    model: "MiniMax-M3",
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: "stop",
      },
    ],
  },
];
