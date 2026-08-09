import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SocialPostBrief } from "./contracts";
import { buildCreativeWorkFactPack } from "./fact-pack";

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

import { CreativeCopyContextError, generateSocialPostCopy } from "./copy";

const brief: SocialPostBrief = {
  theme: "Novo produto",
  objective: "Gerar interesse",
  audience: "Empreendedores digitais",
  offer: "Teste gratuito",
};

const PSICOLOGIA_REQUEST =
  "Post para o consultório de Psicologia: grupo de terapia começa em agosto, vagas limitadas, atendimento online. " +
  "Queremos um texto acolhedor que explique como funciona o grupo, quem conduz os encontros e por que começar agora.";

const factPack = buildCreativeWorkFactPack({
  request: PSICOLOGIA_REQUEST,
  mode: "social_post",
  sources: [{
    sourceId: "source-1",
    usage: "content",
    content: {
      product: "Grupo de terapia",
      offer: "Inscrições abertas",
      cta: { text: "Inscreva-se", style: "botão" },
      brandElements: [],
      keyVisual: "roda de conversa",
      textContent: { headline: "Cuide da sua mente", bullets: [] },
      format: "4:5",
    },
  }],
  brand: { name: "Cenbrap", requiredElements: null, prohibitedElements: "Sem promessas de cura" },
  clientProfileId: "profile-1",
});

function mockCopyResponse(copy: { headline: string; body: string; cta: string }) {
  openAiCreateMock.mockResolvedValueOnce({
    choices: [{ message: { content: JSON.stringify(copy) } }],
  });
}

describe("generateSocialPostCopy with a fact pack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates from the full request and sourced facts, not the reduced brief", async () => {
    mockCopyResponse({
      headline: "Grupo de terapia em agosto",
      body: "Cuide da sua mente. Vagas limitadas, atendimento online.",
      cta: "Inscreva-se",
    });

    const copy = await generateSocialPostCopy({
      brief,
      factPack,
      brandName: "Cenbrap",
      toneOfVoice: "Acolhedor",
      requiredElements: null,
      prohibitedElements: "Sem promessas de cura",
    });

    expect(copy.headline).toContain("agosto");
    expect(openAiCreateMock).toHaveBeenCalledTimes(1);
    const call = openAiCreateMock.mock.calls[0]?.[0] as {
      messages?: Array<{ role: string; content: string }>;
    };
    const system = call.messages?.find((message) => message.role === "system")?.content ?? "";
    const user = call.messages?.find((message) => message.role === "user")?.content ?? "";
    expect(system).toContain("NEVER invent");
    expect(user).toContain(PSICOLOGIA_REQUEST);
    expect(user).toContain('"Grupo de terapia"');
    expect(user).toContain("source source-1");
    expect(user).toContain("Sem promessas de cura");
    expect(user).not.toContain("Público da marca");
  });

  it("rewrites an unbacked claim exactly once and returns the grounded rewrite", async () => {
    mockCopyResponse({
      headline: "50% de desconto em agosto",
      body: "Vagas limitadas no grupo de terapia.",
      cta: "Inscreva-se",
    });
    mockCopyResponse({
      headline: "Grupo de terapia em agosto",
      body: "Vagas limitadas no grupo de terapia.",
      cta: "Inscreva-se",
    });

    const copy = await generateSocialPostCopy({
      brief,
      factPack,
      brandName: "Cenbrap",
      toneOfVoice: null,
      requiredElements: null,
      prohibitedElements: null,
    });

    expect(copy.headline).toBe("Grupo de terapia em agosto");
    expect(openAiCreateMock).toHaveBeenCalledTimes(2);
    const rewriteCall = openAiCreateMock.mock.calls[1]?.[0] as {
      messages?: Array<{ role: string; content: string }>;
    };
    const rewriteUser = rewriteCall.messages?.find((message) => message.role === "user")?.content ?? "";
    expect(rewriteUser).toContain("Claims without origin");
    expect(rewriteUser).toContain('"50%"');
  });

  it("blocks with CreativeCopyContextError when the rewrite keeps the invented claim", async () => {
    const invented = {
      headline: "50% de desconto em agosto",
      body: "Vagas limitadas no grupo de terapia.",
      cta: "Inscreva-se",
    };
    mockCopyResponse(invented);
    mockCopyResponse(invented);

    await expect(
      generateSocialPostCopy({
        brief,
        factPack,
        brandName: "Cenbrap",
        toneOfVoice: null,
        requiredElements: null,
        prohibitedElements: null,
      }),
    ).rejects.toMatchObject({
      name: "CreativeCopyContextError",
      code: "invalid_context",
      violations: expect.arrayContaining([
        expect.objectContaining({ class: "price", value: "50%", field: "headline" }),
      ]),
    });
    // Exactly one rewrite attempt — never a third call.
    expect(openAiCreateMock).toHaveBeenCalledTimes(2);
  });

  it("blocks with CreativeCopyContextError when the rewrite keeps an invented modality", async () => {
    // The origins state "atendimento online"; a copy inventing "presencial"
    // must be flagged and, surviving the single rewrite, blocked.
    const invented = {
      headline: "Grupo de terapia presencial",
      body: "Vagas limitadas no grupo de terapia.",
      cta: "Inscreva-se",
    };
    mockCopyResponse(invented);
    mockCopyResponse(invented);

    await expect(
      generateSocialPostCopy({
        brief,
        factPack,
        brandName: "Cenbrap",
        toneOfVoice: null,
        requiredElements: null,
        prohibitedElements: null,
      }),
    ).rejects.toMatchObject({
      name: "CreativeCopyContextError",
      code: "invalid_context",
      violations: expect.arrayContaining([
        expect.objectContaining({ class: "modality", value: "presencial", field: "headline" }),
      ]),
    });
    expect(openAiCreateMock).toHaveBeenCalledTimes(2);
  });

  it("fails as invalid_context when the rewrite cannot be validated safely", async () => {
    mockCopyResponse({
      headline: "50% de desconto em agosto",
      body: "Vagas limitadas.",
      cta: "Inscreva-se",
    });
    openAiCreateMock.mockRejectedValueOnce(new Error("provider timeout"));

    await expect(
      generateSocialPostCopy({
        brief,
        factPack,
        brandName: "Cenbrap",
        toneOfVoice: null,
        requiredElements: null,
        prohibitedElements: null,
      }),
    ).rejects.toBeInstanceOf(CreativeCopyContextError);
    expect(openAiCreateMock).toHaveBeenCalledTimes(2);
  });
});

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
      prohibitedElements: "Sem clipart; Sem promessas de cura",
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
    // Visual brand rules never reach the copywriter.
    expect(userMessage?.content).not.toContain("Logo no canto");
    expect(userMessage?.content).not.toContain("Sem clipart");
    expect(userMessage?.content).toContain("Sem promessas de cura");
    expect(userMessage?.content).toContain(brief.theme);
    expect(userMessage?.content).toContain(brief.offer);
  });

  it("never ships PreceptorIA visual rules into the copy prompt", async () => {
    mockCopyResponse({
      headline: "PreceptorIA já está disponível para teste",
      body: "Apoio à decisão: não substitui avaliação e julgamento médico. Não inclua dados identificáveis de pacientes.",
      cta: "Comece o teste",
    });

    const preceptoriaPack = buildCreativeWorkFactPack({
      request: "PreceptorIA já está disponível para teste",
      mode: "social_post",
      sources: [],
      brand: {
        name: "PreceptorIA",
        requiredElements:
          "inclua o logo oficial PreceptorIA; fundo azul-marinho (#071522) com amarelo (#FFC914); Apoio à decisão: não substitui avaliação e julgamento médico. Não inclua dados identificáveis de pacientes.",
        prohibitedElements: "Não alterar proporções do logo",
      },
      clientProfileId: "profile-1",
    });

    await generateSocialPostCopy({
      brief,
      factPack: preceptoriaPack,
      brandName: "PreceptorIA",
      toneOfVoice: "Clínico e claro",
      requiredElements: preceptoriaPack.brand.requiredElements.join("; "),
      prohibitedElements: preceptoriaPack.brand.prohibitedElements.join("; "),
    });

    const call = openAiCreateMock.mock.calls[0]?.[0] as {
      messages?: Array<{ role: string; content: string }>;
    };
    const user = call.messages?.find((message) => message.role === "user")?.content ?? "";
    expect(user).not.toMatch(/#071522|#FFC914/i);
    expect(user).not.toMatch(/logo oficial/i);
    expect(user).not.toMatch(/proporções do logo/i);
    expect(user).toMatch(/não substitui avaliação e julgamento médico/i);
    expect(user).toContain("Clínico e claro");
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