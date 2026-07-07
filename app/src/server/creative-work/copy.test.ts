import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SocialPostBrief } from "./contracts";

const openAiCreateMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/ai/utils", () => ({
  getOpenAI: () => ({
    chat: {
      completions: {
        create: openAiCreateMock,
      },
    },
  }),
}));

vi.mock("@/server/validation/env", () => ({
  env: {
    OPENAI_TEXT_MODEL: "gpt-4o-mini",
    OPENAI_API_KEY: "test-key",
  },
}));

import { generateSocialPostCopy } from "./copy";

const brief: SocialPostBrief = {
  theme: "Novo produto",
  objective: "Gerar interesse",
  audience: "Empreendedores digitais",
  offer: "Teste gratuito",
};

describe("generateSocialPostCopy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns structured editable copy", async () => {
    openAiCreateMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: '{"headline":"Comece agora","body":"Conheça a solução.","cta":"Teste grátis"}',
          },
        },
      ],
    });

    await expect(
      generateSocialPostCopy({
        brief,
        brandName: "Acme",
        toneOfVoice: "Direto",
        requiredElements: null,
        prohibitedElements: null,
      }),
    ).resolves.toEqual({
      headline: "Comece agora",
      body: "Conheça a solução.",
      cta: "Teste grátis",
    });
  });

  it("calls the OpenAI chat completion with the env model, json_object format, and brief + voice inputs", async () => {
    openAiCreateMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: '{"headline":"Comece agora","body":"Conheça a solução.","cta":"Teste grátis"}',
          },
        },
      ],
    });

    await generateSocialPostCopy({
      brief,
      brandName: "Acme",
      toneOfVoice: "Direto e caloroso",
      requiredElements: "Logo no canto",
      prohibitedElements: "Sem clipart",
    });

    expect(openAiCreateMock).toHaveBeenCalledTimes(1);
    const call = openAiCreateMock.mock.calls[0]?.[0] as {
      model?: string;
      response_format?: { type?: string };
      messages?: Array<{ role: string; content: string }>;
    };
    expect(call.model).toBe("gpt-4o-mini");
    expect(call.response_format).toEqual({ type: "json_object" });

    const messages = call.messages ?? [];
    const systemMessage = messages.find((m) => m.role === "system");
    const userMessage = messages.find((m) => m.role === "user");
    expect(systemMessage?.content.toLowerCase()).toContain("json");
    expect(userMessage?.content).toContain("Acme");
    expect(userMessage?.content).toContain("Direto e caloroso");
    expect(userMessage?.content).toContain("Logo no canto");
    expect(userMessage?.content).toContain("Sem clipart");
    expect(userMessage?.content).toContain(brief.theme);
    expect(userMessage?.content).toContain(brief.offer);
  });

  it("fails loudly when the model returns invalid JSON that does not match the schema", async () => {
    openAiCreateMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: '{"headline":"Comece agora"}',
          },
        },
      ],
    });

    await expect(
      generateSocialPostCopy({
        brief,
        brandName: "Acme",
        toneOfVoice: null,
        requiredElements: null,
        prohibitedElements: null,
      }),
    ).rejects.toThrow();
  });
});