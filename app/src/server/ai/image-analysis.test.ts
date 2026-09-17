import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.hoisted(() => vi.fn());
const chatCreate = vi.hoisted(() => vi.fn());

vi.mock("./utils", () => ({
  getOpenAI: () => ({ responses: { create }, chat: { completions: { create: chatCreate } } }),
  extractOutputText: (response: { output_text?: string }) => response.output_text,
}));

vi.mock("@/server/validation/env", () => ({ env: { OPENAI_TEXT_MODEL: "gpt-5.6-sol" } }));
vi.mock("@/server/ai/providers/e2e-controlled-provider", () => ({
  isE2EControlledProviderEnabled: () => false,
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { analyzeImageContent, analyzeImageStyle } from "./image-analysis";
import { analyzeSmartResize } from "./smart-resize";
import type { DiagnosticEventEnvelope } from "@/server/diagnostics/contract";
import { createDiagnosticContext, withDiagnosticContext } from "@/server/diagnostics/context";
import {
  __setModelCallEventSinkForTests,
  __setModelCallSpanStarterForTests,
} from "@/server/diagnostics/model-calls";

describe("analyzeImageContent", () => {
  it("uses the Responses vision input and parses its JSON output", async () => {
    create.mockResolvedValueOnce({ output_text: JSON.stringify({
      product: "Curso", offer: "20%", cta: { text: "Inscreva-se", style: "botão" },
      brandElements: ["CENBRAP"], keyVisual: "professor", textContent: { headline: "Ao vivo", bullets: [] }, format: "4:5",
    }) });

    await expect(analyzeImageContent(Buffer.from("image"), "image/png")).resolves.toMatchObject({ product: "Curso" });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      model: "gpt-5.6-sol",
      input: expect.arrayContaining([expect.objectContaining({ role: "user", content: expect.arrayContaining([
        expect.objectContaining({ type: "input_image", image_url: "data:image/png;base64,aW1hZ2U=" }),
      ]) })]),
      text: { format: { type: "json_object" } },
    }));
  });
});

function gptChatReply(payload: unknown) {
  chatCreate.mockResolvedValue({
    choices: [{ message: { content: JSON.stringify(payload) } }],
  });
}

describe("analyzeSmartResize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("asks the model for a 3:4 crop alongside the old ratios", async () => {
    gptChatReply({ crops: {}, safeZones: [], criticalElements: [], platformRecommendations: [] });
    await analyzeSmartResize("aGVsbG8=");
    const prompt = String(chatCreate.mock.calls[0]?.[0].messages[1].content[0].text);
    expect(prompt).toContain('"3:4"');
    expect(prompt).toContain('"4:5"');
    expect(prompt).toContain('"9:16"');
  });

  it("defaults a missing 3:4 crop to full canvas with a recorded issue", async () => {
    gptChatReply({
      crops: { "1:1": { x: 0, y: 0, width: 1, height: 1 } },
      safeZones: [],
      criticalElements: [],
      platformRecommendations: [],
    });
    const analysis = await analyzeSmartResize("aGVsbG8=");
    expect(analysis.crops["3:4"]).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    expect(analysis.validationIssues).toContain("Missing crop for 3:4; defaulted to full canvas");
  });

  it("keeps a valid 3:4 crop untouched", async () => {
    const crop = { x: 0.1, y: 0.05, width: 0.8, height: 0.9 };
    gptChatReply({
      crops: {
        "1:1": { x: 0, y: 0, width: 1, height: 1 },
        "4:5": { x: 0, y: 0, width: 1, height: 1 },
        "9:16": { x: 0, y: 0, width: 1, height: 1 },
        "3:4": crop,
      },
      safeZones: [],
      criticalElements: [],
      platformRecommendations: [],
    });
    const analysis = await analyzeSmartResize("aGVsbG8=");
    expect(analysis.crops["3:4"]).toEqual(crop);
    expect(analysis.validationIssues ?? []).not.toContain(expect.stringContaining("3:4"));
  });
});

describe("trace-389: source-analysis model-call observation", () => {
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
      workspaceId: "ws-source",
      workItemId: "work-source",
      operationId: "op-source",
      releaseSha: "test-sha",
      environment: "test",
      process: "web",
      dataOrigin: "test",
    });
  }

  const contentPayload = {
    product: "Curso", offer: "20%", cta: { text: "Inscreva-se", style: "botão" },
    brandElements: ["CENBRAP"], keyVisual: "professor",
    textContent: { headline: "Ao vivo", bullets: [] }, format: "4:5",
  };

  it("observes content analysis with provider-returned usage only", async () => {
    create.mockResolvedValueOnce({
      model: "gpt-5.6-sol",
      id: "resp-content",
      output_text: JSON.stringify(contentPayload),
      usage: { input_tokens: 900, output_tokens: 120 },
    });

    const brief = await withDiagnosticContext(testContext(), () =>
      analyzeImageContent(Buffer.from("image"), "image/png"),
    );

    expect(brief.product).toBe("Curso");
    const completed = captured.filter((event) => event.event === "model.call.completed");
    expect(completed).toHaveLength(1);
    expect(completed[0]!.stage).toBe("source_analysis");
    expect(completed[0]!.call).toMatchObject({
      provider: "openai",
      requestedModel: "gpt-5.6-sol",
      returnedModel: "gpt-5.6-sol",
      providerRequestId: "resp-content",
      inputTokens: 900,
      outputTokens: 120,
    });
  });

  it("records answered transport plus validation failure on invalid JSON", async () => {
    create.mockResolvedValueOnce({ output_text: "not-json{" });

    await expect(
      withDiagnosticContext(testContext(), () =>
        analyzeImageContent(Buffer.from("image"), "image/png"),
      ),
    ).rejects.toThrow(SyntaxError);
    expect(create).toHaveBeenCalledTimes(1);
    expect(captured.filter((event) => event.event === "model.call.completed")).toHaveLength(1);
    const validation = captured.filter((event) => event.event === "model.validation.failed");
    expect(validation).toHaveLength(1);
    expect(validation[0]!.error?.reason).toContain("invalid-json");
  });

  it("observes style analysis failures without inventing usage", async () => {
    create.mockRejectedValueOnce(Object.assign(new Error("Service unavailable"), {
      name: "InternalServerError",
      status: 500,
    }));

    await expect(
      withDiagnosticContext(testContext(), () =>
        analyzeImageStyle(Buffer.from("image"), "image/png"),
      ),
    ).rejects.toThrow("Service unavailable");
    const failed = captured.filter((event) => event.event === "model.call.failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]!.stage).toBe("source_analysis");
    expect(failed[0]!.error).toMatchObject({ errorClass: "InternalServerError", status: 500 });
    expect(failed[0]!.call?.providerRequestId).toBeNull();
  });
});
