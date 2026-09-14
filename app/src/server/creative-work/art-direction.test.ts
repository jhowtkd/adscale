import { beforeEach, expect, it, vi } from "vitest";

const create = vi.hoisted(() => vi.fn());
const controlled = vi.hoisted(() => vi.fn());
vi.mock("@/server/ai/utils", () => ({ getOpenAI: () => ({ chat: { completions: { create } } }) }));
vi.mock("@/server/ai/providers/e2e-controlled-provider", () => ({ isE2EControlledProviderEnabled: controlled }));
vi.mock("@/server/validation/env", () => ({ env: { OPENAI_TEXT_MODEL: "test-text-model" } }));

import { createSinglePieceArtDirection, type ArtDirectionInput } from "./art-direction";

const input: ArtDirectionInput = {
  format: "4:5",
  copy: { headline: "Marca Demo", body: "Conteúdo aprovado", cta: "Saiba mais" },
  inputSnapshot: {
    request: "Pedido integral", settings: { targetFormats: [] },
    sources: [{ sourceId: "s1", updatedAt: "now", assetKey: "PRIVATE_STORAGE_SENTINEL", mimeType: "image/png", usage: "both", content: null, style: null }],
  },
  factPack: null,
  identitySnapshot: {
    clientProfileId: null, confirmedAt: "now",
    assets: [{ referenceId: "logo", assetKey: "PRIVATE_ASSET_SENTINEL", label: "Logo aprovado", category: "logo", usageMode: "exact", analysis: null, mimeType: "image/png", hasAlpha: true, placement: { gravity: "southeast", widthRatio: 0.18 } }],
    brandKit: { colors: ["#123456"], fonts: ["Inter"], toneOfVoice: "Direto", requiredElements: "Logo", prohibitedElements: "Clipart" },
  },
  creativeLevel: "balanced", revisionInstruction: "Aumente o título", directionInstruction: "Hierarquia clara", references: [],
};

beforeEach(() => {
  vi.resetAllMocks();
  controlled.mockReturnValue(false);
});

it("preserves a valid brief and sends only projected context without private storage keys", async () => {
  const brief = "Retrato editorial com hierarquia clara e espaço livre para o logo.";
  create.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ brief }) } }] });
  expect(await createSinglePieceArtDirection(input)).toEqual({ text: brief, source: "model" });
  expect(create).toHaveBeenCalledTimes(1);
  expect(create.mock.calls[0][1]).toEqual({ timeout: 30_000, maxRetries: 0 });
  const context = JSON.parse(create.mock.calls[0][0].messages[1].content);
  expect(context).toMatchObject({ format: "4:5", copy: input.copy, request: input.inputSnapshot.request, directionInstruction: input.directionInstruction, revisionInstruction: input.revisionInstruction });
  expect(JSON.stringify(context)).not.toContain("PRIVATE_");
  expect(context).not.toHaveProperty("inputSnapshot");
});

it("passes the frozen visual direction to the art-direction model", async () => {
  create.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ brief: "Composição editorial." }) } }] });
  const visualDirection = {
    languageId: "language-1",
    ruleIds: ["rule-1"],
    dominantIdea: "Dar escala ao título",
    composition: "Respiro generoso ao redor do foco",
    typography: "Caixa alta condensada",
    finish: "Acabamento fosco editorial",
    preserve: ["Dois focos em competição"],
  };
  await createSinglePieceArtDirection({
    ...input,
    inputSnapshot: { ...input.inputSnapshot, visualDirection },
  });

  const context = JSON.parse(create.mock.calls[0][0].messages[1].content);
  expect(context.visualDirection).toEqual({
    dominantIdea: visualDirection.dominantIdea,
    composition: visualDirection.composition,
    typography: visualDirection.typography,
    finish: visualDirection.finish,
    preserve: visualDirection.preserve,
  });
});

it.each(["", "not json", "null", JSON.stringify({ brief: "" }), JSON.stringify({ brief: Array(121).fill("palavra").join(" ") }), JSON.stringify({ brief: "certo", extra: "não" })])("uses explicit invalid-response fallback for %s", async (content) => {
  create.mockResolvedValue({ choices: [{ message: { content } }] });
  expect(await createSinglePieceArtDirection(input)).toEqual({ text: null, source: "fallback", reason: "invalid_response" });
  expect(create).toHaveBeenCalledTimes(1);
});

it("does not retry an unavailable text provider", async () => {
  create.mockRejectedValue(new Error("timeout"));
  expect(await createSinglePieceArtDirection(input)).toEqual({ text: null, source: "fallback", reason: "unavailable" });
  expect(create).toHaveBeenCalledTimes(1);
});

it("keeps full copy and request outside the 120-word visual-brief limit", async () => {
  create.mockResolvedValue({ choices: [{ message: { content: '{"brief":"Composição editorial."}' } }] });
  const longText = Array(160).fill("fato").join(" ");
  await createSinglePieceArtDirection({ ...input, copy: { ...input.copy, body: longText }, inputSnapshot: { ...input.inputSnapshot, request: longText } });
  const context = JSON.parse(create.mock.calls[0][0].messages[1].content);
  expect(context.copy.body).toBe(longText);
  expect(context.request).toBe(longText);
});

it("uses controlled art direction without accessing the text SDK", async () => {
  controlled.mockReturnValue(true);
  const result = await createSinglePieceArtDirection(input);
  expect(result.source).toBe("controlled");
  expect(result.text?.split(/\s+/u).length).toBeLessThanOrEqual(120);
  expect(create).not.toHaveBeenCalled();
});
