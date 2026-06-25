import { describe, it, expect } from "vitest";
import {
  encodeAssistantSseEvent,
  type AssistantSseEventType,
} from "@/server/assistant/stream/sse";
import { parseAssistantSseFrame, readAssistantSseStream } from "./parse-sse";

const EVENTS: AssistantSseEventType[] = [
  "text_delta",
  "tool_summary",
  "action_card",
  "done",
  "error",
];

function encodeFrame(event: AssistantSseEventType, data: Record<string, unknown>) {
  return encodeAssistantSseEvent(event, data);
}

function responseFromChunks(chunks: Uint8Array[]): Response {
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
  return new Response(stream);
}

describe("parseAssistantSseFrame", () => {
  it("parses a single SSE frame", () => {
    const frame = parseAssistantSseFrame(
      'event: text_delta\ndata: {"text":"hi"}\n\n'
    );
    expect(frame).toEqual({
      event: "text_delta",
      data: { text: "hi" },
    });
  });

  it.each(EVENTS)("parses %s event type", (event) => {
    const payload = { key: event };
    const frame = parseAssistantSseFrame(
      `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`
    );
    expect(frame).toEqual({ event, data: payload });
  });

  it("returns null for empty or malformed blocks", () => {
    expect(parseAssistantSseFrame("")).toBeNull();
    expect(parseAssistantSseFrame("event: text_delta\n\n")).toBeNull();
    expect(parseAssistantSseFrame("data: {}\n\n")).toBeNull();
  });

  it("strips reasoning and thinking fields from data (AI-05)", () => {
    const frame = parseAssistantSseFrame(
      'event: text_delta\ndata: {"text":"hi","reasoning":"secret","thinking":"hidden"}\n\n'
    );
    expect(frame).toEqual({
      event: "text_delta",
      data: { text: "hi" },
    });
  });
});

describe("readAssistantSseStream", () => {
  it("yields multiple frames from one chunk", async () => {
    const chunk = new Uint8Array([
      ...encodeFrame("text_delta", { text: "a" }),
      ...encodeFrame("done", { messageId: "m1" }),
    ]);
    const response = responseFromChunks([chunk]);

    const frames = [];
    for await (const frame of readAssistantSseStream(response)) {
      frames.push(frame);
    }

    expect(frames).toEqual([
      { event: "text_delta", data: { text: "a" } },
      { event: "done", data: { messageId: "m1" } },
    ]);
  });

  it("reassembles frames split across chunks", async () => {
    const full = encodeFrame("text_delta", { text: "split" });
    const mid = Math.floor(full.length / 2);
    const response = responseFromChunks([
      full.slice(0, mid),
      full.slice(mid),
      encodeFrame("done", {}),
    ]);

    const frames = [];
    for await (const frame of readAssistantSseStream(response)) {
      frames.push(frame);
    }

    expect(frames).toEqual([
      { event: "text_delta", data: { text: "split" } },
      { event: "done", data: {} },
    ]);
  });

  it("aborts iteration when AbortSignal fires", async () => {
    const controller = new AbortController();
    const stream = new ReadableStream<Uint8Array>({
      async start(ctrl) {
        ctrl.enqueue(encodeFrame("text_delta", { text: "a" }));
        await new Promise((r) => setTimeout(r, 50));
        if (!controller.signal.aborted) {
          ctrl.enqueue(encodeFrame("text_delta", { text: "b" }));
        }
        ctrl.close();
      },
    });

    const frames: unknown[] = [];
    const consume = async () => {
      for await (const frame of readAssistantSseStream(
        new Response(stream),
        controller.signal
      )) {
        frames.push(frame);
        controller.abort();
      }
    };

    await consume();
    expect(frames).toHaveLength(1);
    expect(frames[0]).toEqual({
      event: "text_delta",
      data: { text: "a" },
    });
  });

  it("ignores unknown event types", async () => {
    const chunk = new TextEncoder().encode(
      'event: unknown\ndata: {"x":1}\n\n' +
        'event: text_delta\ndata: {"text":"ok"}\n\n'
    );
    const frames = [];
    for await (const frame of readAssistantSseStream(responseFromChunks([chunk]))) {
      frames.push(frame);
    }
    expect(frames).toEqual([{ event: "text_delta", data: { text: "ok" } }]);
  });
});
