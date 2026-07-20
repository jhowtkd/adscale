import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    ({
      variationAnalysisTitle: "Leitura da IA",
      variationContentTitle: "Conteúdo identificado",
      variationStyleTitle: "Estilo identificado",
      variationAnalysisUnavailable: "Nenhuma informação identificada.",
      variationInstructionsLabel: "O que você quer variar?",
      variationInstructionsHint:
        "Opcional. Escreva livremente ou use uma linha para cada mudança.",
      variationInstructionsPlaceholder:
        "Ex.:\n- Criar uma copy mais direta\n- Sugerir novos CTAs\n- Destacar a oferta",
    })[key] ?? key,
}));

import {
  CreativeVariationBrief,
  summarizeVariationContent,
  summarizeVariationStyle,
} from "./CreativeVariationBrief";

const source = {
  id: "source-1",
  workspaceId: "workspace-1",
  workItemId: "work-1",
  assetId: "asset-1",
  templateId: null,
  name: "arte.png",
  previewUrl: "/api/workspace/assets/asset-1/file",
  origin: "upload" as const,
  usage: "both" as const,
  usageConfirmed: true,
  status: "ready" as const,
  failureCode: null,
  createdAt: "2026-07-20T12:00:00.000Z",
  updatedAt: "2026-07-20T12:00:00.000Z",
  contentAnalysis: {
    product: "Curso de Psiquiatria",
    offer: "Vagas limitadas",
    cta: { text: "Inscreva-se", style: "botão verde" },
    brandElements: ["Cenbrap"],
    keyVisual: "Médica",
    textContent: {
      headline: "Nova turma em agosto",
      bullets: ["Início em 22 de agosto"],
    },
    format: "4:5",
  },
  styleAnalysis: {
    colorPalette: {
      dominant: ["verde", "preto"],
      accents: ["branco"],
      gradients: "nenhum",
    },
    typography: { personality: "institucional", effects: [] },
    textures: [],
    composition: "centralizada",
    mood: "profissional",
    decorativeElements: [],
    photoTreatment: "alto contraste",
  },
};

describe("CreativeVariationBrief", () => {
  it("projects structured analysis into concise readable text", () => {
    expect(summarizeVariationContent(source)).toBe(
      "Produto: Curso de Psiquiatria · Headline: Nova turma em agosto · Oferta: Vagas limitadas · CTA: Inscreva-se",
    );
    expect(summarizeVariationStyle(source)).toBe(
      "Clima: profissional · Composição: centralizada · Cores: verde, preto, branco · Tipografia: institucional",
    );
  });

  it("omits empty analysis values without exposing JSON", () => {
    expect(
      summarizeVariationContent({
        ...source,
        contentAnalysis: {
          ...source.contentAnalysis,
          offer: "",
          cta: { text: "", style: "" },
        },
      }),
    ).toBe(
      "Produto: Curso de Psiquiatria · Headline: Nova turma em agosto",
    );
  });

  it("accepts free text with dashes and line breaks without parsing it", () => {
    const onChange = vi.fn();

    render(
      <CreativeVariationBrief
        source={source}
        value=""
        onChange={onChange}
      />,
    );

    const instructions = screen.getByRole("textbox", {
      name: "O que você quer variar?",
    });

    fireEvent.change(instructions, {
      target: {
        value: "- Criar uma copy mais direta\n- Sugerir novos CTAs",
      },
    });

    expect(onChange).toHaveBeenCalledWith(
      "- Criar uma copy mais direta\n- Sugerir novos CTAs",
    );
  });
});
