import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/validation/env", () => ({
  env: { OPENAI_API_KEY: "sk-test" },
}));

const mockOpenAIImages = vi.hoisted(() => ({
  edit: vi.fn(),
}));
vi.mock("openai", () => {
  return {
    default: class {
      images = { edit: mockOpenAIImages.edit };
    },
    toFile: vi.fn(async (buffer: Buffer, name: string) => ({ buffer, name })),
  };
});

import { normalizeLayerCandidate, OpenAILayerRegenerationProvider } from "./openai-provider";
import type { DiagnosticEventEnvelope } from "@/server/diagnostics/contract";
import { createDiagnosticContext, withDiagnosticContext } from "@/server/diagnostics/context";
import {
  __setModelCallEventSinkForTests,
  __setModelCallSpanStarterForTests,
} from "@/server/diagnostics/model-calls";

const { edit } = mockOpenAIImages;

describe("normalizeLayerCandidate", () => {
  it("returns a transparent PNG exactly source-sized with the candidate centered", async () => {
    const foreground = await sharp({ create: { width: 20, height: 10, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
    const source = await sharp({ create: { width: 40, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: foreground, left: 10, top: 5 }]).png().toBuffer();
    const normalized = await normalizeLayerCandidate(source, { width: 100, height: 100 });
    const image = sharp(normalized);
    const metadata = await image.metadata();
    const raw = await image.raw().toBuffer({ resolveWithObject: true });

    expect(metadata).toMatchObject({ format: "png", width: 100, height: 100, hasAlpha: true });
    const alphaAt = (x: number, y: number) => raw.data[(y * 100 + x) * raw.info.channels + 3];
    expect(alphaAt(50, 50)).toBeGreaterThan(0);
    expect(alphaAt(50, 5)).toBe(0);
  });

  it("rejects a PNG with an alpha channel whose pixels are all opaque", async () => {
    const opaque = await sharp({ create: { width: 20, height: 20, channels: 4, background: { r: 20, g: 30, b: 40, alpha: 1 } } }).png().toBuffer();
    await expect(normalizeLayerCandidate(opaque, { width: 20, height: 20 })).rejects.toThrow(/transparency/i);
  });
});

describe("OpenAILayerRegenerationProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends Sunburst max as a single transparent edit", async () => {
    edit.mockResolvedValue({
      data: [{ b64_json: Buffer.from("png").toString("base64") }],
      _request_id: "req-layer",
      usage: { output_tokens: 30 },
    });
    const result = await new OpenAILayerRegenerationProvider().regenerate({
      instruction: "make it red",
      selectedLayer: Buffer.from("layer"),
      composite: Buffer.from("composite"),
      bounds: { width: 40, height: 40 },
      renderPolicy: { version: 1, model: "gpt-image-2.5-sunburst-2026-09-08", quality: "max" },
    });
    expect(edit).toHaveBeenCalledOnce();
    expect(edit).toHaveBeenCalledWith(expect.objectContaining({
      model: "gpt-image-2.5-sunburst-2026-09-08", quality: "max", background: "transparent", output_format: "png", n: 1,
    }), { timeout: 180_000, maxRetries: 0 });
    expect(result.observation?.requestId).toBe("req-layer");
    expect(result.observation?.usage).toEqual({ output_tokens: 30 });
  });
});

describe("trace-389: layer-regeneration model-call observation", () => {
  let captured: DiagnosticEventEnvelope[];

  beforeEach(() => {
    vi.clearAllMocks();
    captured = [];
    __setModelCallEventSinkForTests((event) => {
      captured.push(event);
    });
    __setModelCallSpanStarterForTests(() => undefined);
  });

  function testContext() {
    return createDiagnosticContext({
      workspaceId: "ws-layer",
      workItemId: "work-layer",
      operationId: "op-layer",
      releaseSha: "test-sha",
      environment: "test",
      process: "web",
      dataOrigin: "test",
    });
  }

  function regenerateInput() {
    return {
      instruction: "make it red",
      selectedLayer: Buffer.from("layer"),
      composite: Buffer.from("composite"),
      bounds: { width: 40, height: 40 },
    };
  }

  it("observes the layer edit on the revision stage", async () => {
    edit.mockResolvedValue({
      data: [{ b64_json: Buffer.from("png").toString("base64") }],
      _request_id: "req-layer",
      usage: { output_tokens: 30 },
    });

    const result = await withDiagnosticContext(testContext(), () =>
      new OpenAILayerRegenerationProvider().regenerate(regenerateInput()),
    );

    expect(result.requestId).toBe("req-layer");
    expect(edit).toHaveBeenCalledTimes(1);
    const completed = captured.filter((event) => event.event === "model.call.completed");
    expect(completed).toHaveLength(1);
    expect(completed[0]!.stage).toBe("revision");
    expect(completed[0]!.call).toMatchObject({
      provider: "openai",
      requestedModel: "gpt-image-2",
      providerRequestId: "req-layer",
      outputTokens: 30,
    });
  });

  it("records a timeout as unknown remote outcome without re-invoking the edit", async () => {
    const timeout = Object.assign(new Error("Request timed out."), {
      name: "APIConnectionTimeoutError",
    });
    edit.mockRejectedValueOnce(timeout);

    await expect(
      withDiagnosticContext(testContext(), () =>
        new OpenAILayerRegenerationProvider().regenerate(regenerateInput()),
      ),
    ).rejects.toBe(timeout);
    expect(edit).toHaveBeenCalledTimes(1);
    const failed = captured.filter((event) => event.event === "model.call.failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]!.error?.errorClass).toBe("APIConnectionTimeoutError");
    expect(failed[0]!.attributes).toMatchObject({ timeout: true, remoteOutcome: "unknown" });
  });
});
