import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/validation/env", () => ({
  env: { OPENAI_API_KEY: "sk-test", OPENAI_IMAGE_MODEL: "gpt-image-2-2026-04-21" },
}));

const mockOpenAIImages = vi.hoisted(() => ({
  edit: vi.fn(),
  generate: vi.fn(),
}));
vi.mock("openai", () => {
  return {
    default: class {
      images = { edit: mockOpenAIImages.edit, generate: mockOpenAIImages.generate };
    },
    toFile: vi.fn(async (buffer: Buffer, name: string) => ({ buffer, name })),
  };
});

import { OpenAIImageProvider, resolveOpenAISize } from "./openai-image-provider";
import type { DiagnosticEventEnvelope } from "@/server/diagnostics/contract";
import { createDiagnosticContext, withDiagnosticContext } from "@/server/diagnostics/context";
import {
  __setModelCallEventSinkForTests,
  __setModelCallSpanStarterForTests,
} from "@/server/diagnostics/model-calls";

const { edit: mockEdit, generate: mockGenerate } = mockOpenAIImages;

const TRANSPORT = { timeout: 180_000, maxRetries: 0 };

describe("OpenAIImageProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls images.generate when no references provided", async () => {
    mockGenerate.mockResolvedValue({
      data: [{ b64_json: Buffer.from("png-bytes").toString("base64") }],
      _request_id: "req-image-1",
    });
    const provider = new OpenAIImageProvider();
    const result = await provider.generate({
      prompt: "a hero image",
      dimensions: { width: 1080, height: 1080 },
      referenceImages: [],
      generationMode: "art_variation",
      outputPrefix: "derivations/test",
      quality: "medium",
    });
    expect(mockGenerate).toHaveBeenCalledOnce();
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ quality: "medium", size: "1088x1088" }),
      TRANSPORT,
    );
    expect(mockEdit).not.toHaveBeenCalled();
    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.providerMeta.provider).toBe("openai");
    expect(result.providerMeta.rawRequestId).toBe("req-image-1");
  });

  it("calls images.edit when at least one reference is provided", async () => {
    mockEdit.mockResolvedValue({
      data: [{ b64_json: Buffer.from("edited").toString("base64") }],
    });
    const provider = new OpenAIImageProvider();
    const result = await provider.generate({
      prompt: "with ref",
      dimensions: { width: 1080, height: 1350 },
      referenceImages: [
        { buffer: Buffer.from("ref"), mimeType: "image/png", name: "r.png" },
      ],
      generationMode: "restyling",
      outputPrefix: "derivations/test",
    });
    expect(mockEdit).toHaveBeenCalledOnce();
    expect(mockEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-image-2-2026-04-21",
        size: "1088x1360",
      }),
      TRANSPORT,
    );
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(result.providerMeta.model).toBe("gpt-image-2-2026-04-21");
  });

  it("throws a clear error when the response has no image data", async () => {
    mockGenerate.mockResolvedValue({ data: [] });
    const provider = new OpenAIImageProvider();
    await expect(
      provider.generate({
        prompt: "x",
        dimensions: { width: 1080, height: 1080 },
        referenceImages: [],
        generationMode: "art_variation",
        outputPrefix: "p",
      }),
    ).rejects.toThrow(/No image data/);
  });

  it("uses timeout above the 2-minute worst case and zero SDK retries", async () => {
    mockGenerate.mockResolvedValue({
      data: [{ b64_json: Buffer.from("png").toString("base64") }],
    });
    const provider = new OpenAIImageProvider();
    await provider.generate({
      prompt: "x",
      dimensions: { width: 1080, height: 1080 },
      referenceImages: [],
      generationMode: "art_variation",
      outputPrefix: "p",
    });
    // maxRetries: 0 — SDK HTTP retries would bill extra image gens outside the
    // upstream 2-call creative budget.
    expect(mockGenerate.mock.calls[0][1]).toEqual(TRANSPORT);
    expect(TRANSPORT.timeout).toBeGreaterThan(120_000);
    expect(TRANSPORT.maxRetries).toBe(0);
  });

  it.each([
    { label: "1:1", dims: { width: 1080, height: 1080 }, size: "1088x1088" },
    { label: "4:5", dims: { width: 1080, height: 1350 }, size: "1088x1360" },
    { label: "9:16", dims: { width: 1080, height: 1920 }, size: "1152x2048" },
    { label: "3:4", dims: { width: 1080, height: 1440 }, size: "1152x1536" },
    { label: "landscape 1.91:1", dims: { width: 1200, height: 628 }, size: "2048x1072" },
    { label: "landscape 16:9", dims: { width: 1920, height: 1080 }, size: "2048x1152" },
  ])("requests $size for $label", async ({ dims, size }) => {
    mockGenerate.mockResolvedValue({
      data: [{ b64_json: Buffer.from("png").toString("base64") }],
    });
    const provider = new OpenAIImageProvider();
    await provider.generate({
      prompt: "x",
      dimensions: dims,
      referenceImages: [],
      generationMode: "art_variation",
      outputPrefix: "p",
    });
    expect(mockGenerate.mock.calls[0][0]).toEqual(
      expect.objectContaining({ size }),
    );
  });

  it.each(["high", "xhigh", "max"] as const)("sends explicit Sunburst %s with one call", async quality => {
    mockGenerate.mockResolvedValue({ data: [{ b64_json: Buffer.from("png").toString("base64") }], usage: { output_tokens: 12 } });
    const result = await new OpenAIImageProvider().generate({
      prompt: "hero", dimensions: { width: 1080, height: 1350 }, referenceImages: [],
      generationMode: "art_variation", outputPrefix: "test/sunburst",
      renderPolicy: { version: 1, model: "gpt-image-2.5-sunburst-2026-09-08", quality },
    });
    expect(mockGenerate).toHaveBeenCalledOnce();
    expect(mockGenerate).toHaveBeenCalledWith(expect.objectContaining({ model: "gpt-image-2.5-sunburst-2026-09-08", quality }), TRANSPORT);
    expect(mockGenerate.mock.calls[0]?.[0]).not.toHaveProperty("input_fidelity");
    expect(result.providerMeta.observation?.usage).toEqual({ output_tokens: 12 });
  });

  it("sends explicit Sunburst edit with one call", async () => {
    mockEdit.mockResolvedValue({ data: [{ b64_json: Buffer.from("png").toString("base64") }], usage: { output_tokens: 12 } });
    const result = await new OpenAIImageProvider().generate({
      prompt: "hero",
      dimensions: { width: 1080, height: 1350 },
      referenceImages: [
        { buffer: Buffer.from("ref"), mimeType: "image/png", name: "r.png" },
      ],
      generationMode: "art_variation",
      outputPrefix: "test/sunburst",
      renderPolicy: { version: 1, model: "gpt-image-2.5-sunburst-2026-09-08", quality: "max" },
    });
    expect(mockEdit).toHaveBeenCalledOnce();
    expect(mockEdit).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-image-2.5-sunburst-2026-09-08", quality: "max" }),
      TRANSPORT,
    );
    expect(mockEdit.mock.calls[0]?.[0]).not.toHaveProperty("input_fidelity");
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(result.providerMeta.observation?.usage).toEqual({ output_tokens: 12 });
  });

  it.each([
    { operation: "generate" as const, referenceImages: [] as { buffer: Buffer; mimeType: string; name: string }[] },
    {
      operation: "edit" as const,
      referenceImages: [{ buffer: Buffer.from("ref"), mimeType: "image/png", name: "r.png" }],
    },
  ])("prefers frozen renderPolicy max over legacy medium on $operation", async ({ operation, referenceImages }) => {
    const mockCall = operation === "generate" ? mockGenerate : mockEdit;
    mockCall.mockResolvedValue({ data: [{ b64_json: Buffer.from("png").toString("base64") }] });
    await new OpenAIImageProvider().generate({
      prompt: "hero",
      dimensions: { width: 1080, height: 1350 },
      referenceImages,
      generationMode: "art_variation",
      outputPrefix: "test/sunburst",
      quality: "medium",
      renderPolicy: { version: 1, model: "gpt-image-2.5-sunburst-2026-09-08", quality: "max" },
    });
    expect(mockCall).toHaveBeenCalledOnce();
    expect(mockCall).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-image-2.5-sunburst-2026-09-08", quality: "max" }),
      TRANSPORT,
    );
    expect(mockCall.mock.calls[0]?.[0]).not.toHaveProperty("input_fidelity");
    expect(mockCall.mock.calls[0]?.[0].quality).not.toBe("medium");
    if (operation === "generate") {
      expect(mockEdit).not.toHaveBeenCalled();
    } else {
      expect(mockGenerate).not.toHaveBeenCalled();
    }
  });

  it("fails closed on legacy models with 3:4 dims instead of mapping to 2:3 portrait", () => {
    const base = {
      prompt: "x",
      referenceImages: [],
      generationMode: "art_variation",
      outputPrefix: "p",
    } as const;
    for (const dimensions of [
      { width: 1080, height: 1440 },
      { width: 1152, height: 1536 },
      { width: 270, height: 360 },
    ]) {
      expect(() => resolveOpenAISize({ ...base, dimensions }, "gpt-image-1")).toThrow(
        /format_requires_gpt_image_2/
      );
    }
  });

  it("keeps legacy non-3:4 sizes and gpt-image-2 sizes unchanged", () => {
    const base = {
      prompt: "x",
      referenceImages: [],
      generationMode: "art_variation",
      outputPrefix: "p",
    } as const;
    expect(
      resolveOpenAISize({ ...base, dimensions: { width: 1024, height: 1024 } }, "gpt-image-1")
    ).toBe("1024x1024");
    expect(
      resolveOpenAISize({ ...base, dimensions: { width: 1024, height: 1536 } }, "gpt-image-1")
    ).toBe("1024x1536");
    expect(
      resolveOpenAISize({ ...base, dimensions: { width: 1536, height: 1024 } }, "gpt-image-1")
    ).toBe("1536x1024");
    expect(
      resolveOpenAISize({ ...base, dimensions: { width: 1080, height: 1440 } }, "gpt-image-2-2026-04-21")
    ).toBe("1152x1536");
  });

  it("rejects a legacy-model policy before any billable call", async () => {
    const provider = new OpenAIImageProvider();
    await expect(
      provider.generate({
        prompt: "x",
        dimensions: { width: 1080, height: 1440 },
        referenceImages: [],
        generationMode: "art_variation",
        outputPrefix: "p",
        // Cast: the schema is the runtime gate for untyped callers.
        renderPolicy: { version: 1, model: "gpt-image-1" as "gpt-image-2", quality: "medium" },
      }),
    ).rejects.toThrow(/gpt-image-2/);
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockEdit).not.toHaveBeenCalled();
  });
});

describe("trace-389: image model-call observation", () => {
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
      workspaceId: "ws-image",
      workItemId: "work-image",
      operationId: "op-image",
      releaseSha: "test-sha",
      environment: "test",
      process: "web",
      dataOrigin: "test",
    });
  }

  function generateInput() {
    return {
      prompt: "a hero image",
      dimensions: { width: 1080, height: 1080 },
      referenceImages: [],
      generationMode: "art_variation" as const,
      outputPrefix: "work/test",
      quality: "medium" as const,
    };
  }

  it("observes image generation with requested model and provider request id", async () => {
    mockGenerate.mockResolvedValue({
      data: [{ b64_json: Buffer.from("png-bytes").toString("base64") }],
      _request_id: "req-image-1",
    });

    const result = await withDiagnosticContext(testContext(), () =>
      new OpenAIImageProvider().generate(generateInput()),
    );

    expect(result.buffer.length).toBeGreaterThan(0);
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    const completed = captured.filter((event) => event.event === "model.call.completed");
    expect(completed).toHaveLength(1);
    expect(completed[0]!.stage).toBe("image");
    expect(completed[0]!.call).toMatchObject({
      provider: "openai",
      requestedModel: "gpt-image-2-2026-04-21",
      returnedModel: null,
      providerRequestId: "req-image-1",
    });
  });

  it("records a normalized transport failure without re-invoking the SDK", async () => {
    const failure = Object.assign(new Error("Rate limit reached"), {
      name: "RateLimitError",
      status: 429,
    });
    mockGenerate.mockRejectedValueOnce(failure);

    await expect(
      withDiagnosticContext(testContext(), () => new OpenAIImageProvider().generate(generateInput())),
    ).rejects.toBe(failure);
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    const failed = captured.filter((event) => event.event === "model.call.failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]!.error).toMatchObject({
      errorClass: "RateLimitError",
      status: 429,
      reason: "Rate limit reached",
    });
  });

  it("records empty image data as a validation failure, not a network outage", async () => {
    mockGenerate.mockResolvedValue({ data: [], _request_id: "req-empty" });

    await expect(
      withDiagnosticContext(testContext(), () => new OpenAIImageProvider().generate(generateInput())),
    ).rejects.toThrow("No image data returned from OpenAI");
    expect(captured.filter((event) => event.event === "model.call.completed")).toHaveLength(1);
    expect(captured.filter((event) => event.event === "model.call.failed")).toHaveLength(0);
    const validation = captured.filter((event) => event.event === "model.validation.failed");
    expect(validation).toHaveLength(1);
    expect(validation[0]!.error?.reason).toContain("empty-content");
  });
});
