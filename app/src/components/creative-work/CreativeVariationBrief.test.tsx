import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    ({
      variationAnalysisTitle: "Leitura da IA",
      variationContentTitle: "Conteúdo identificado",
      variationStyleTitle: "Estilo identificado",
      variationAnalysisUnavailable: "Nenhuma informação identificada.",
      literalTextTitle: "Texto literal da peça",
      identifiedEntities: "Entidades identificadas",
      paletteAria: "Amostras da paleta",
      moodAria: "Clima visual",
      compositionDiagramAria: "Esquema visual da composição",
      provenanceTitle: "Origens da leitura",
      provenanceRequest: "Pedido",
      provenanceSource: "Arte",
      provenanceBrand: "Marca",
      provenanceInference: "Inferência",
      provenanceUnknown: "Desconhecido",
      provenanceVisualOnly: "Referência visual não fornece fatos.",
      unknownValue: "Não informado",
      editAnalysis: "Corrigir leitura",
      saveAnalysis: "Salvar leitura",
      cancelAnalysis: "Cancelar",
      retryAnalysis: "Tentar salvar novamente",
      savingAnalysis: "Salvando leitura",
      savedAnalysis: "Leitura salva",
      saveAnalysisError: "Não foi possível salvar. Sua edição continua aqui.",
      product: "Produto",
      headline: "Headline",
      offer: "Oferta ou preço",
      ctaText: "CTA",
      keyVisual: "Visual principal",
      literalTextTitle: "Texto literal da peça",
      complementaryText: "Datas e condições",
      mood: "Clima",
      composition: "Composição",
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

  it("keeps the collapsed reading under an accessible disclosure toggle", () => {
    render(<CreativeVariationBrief source={source} />);

    const toggle = document.querySelector("summary");
    expect(toggle).toHaveTextContent("Leitura da IA");
    expect(toggle).toContainElement(screen.getByTestId("variation-analysis-summary"));
    expect(screen.getByTestId("variation-analysis-summary")).toHaveClass("line-clamp-2");
  });

  it("does not render the legacy free-form instructions textarea", () => {
    // The variations journey supervises the batch through direction chips and
    // the collapsed manual directions; the old "O que você quer variar?"
    // textarea was removed so it no longer competes with the manual direction.
    render(<CreativeVariationBrief source={source} />);

    expect(screen.queryByRole("textbox", { name: "O que você quer variar?" })).not.toBeInTheDocument();
    expect(screen.getByTestId("variation-analysis-summary")).toHaveTextContent(
      "Produto: Curso de Psiquiatria · Headline: Nova turma em agosto · Oferta: Vagas limitadas · CTA: Inscreva-se",
    );
    expect(screen.getByTestId("variation-analysis-summary")).toBeVisible();
  });

  it("shows localized fields, literal text, palette samples, mood chips, and composition schematic", () => {
    render(
      <CreativeVariationBrief
        source={{
          ...source,
          contentAnalysis: {
            ...source.contentAnalysis,
            summaryPt: "Resumo em português",
            literalText: "Inscreva-se agora!",
            entities: ["Cenbrap", "agosto"],
          },
          styleAnalysis: {
            ...source.styleAnalysis,
            palette: [{ hex: "#123456", labelPt: "azul profundo" }],
            moodChipsPt: ["profissional", "acolhedor"],
            compositionPt: "hierarquia central",
            typography: { ...source.styleAnalysis.typography, stylePt: "institucional" },
          },
        }}
        value=""
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Resumo em português")).toBeInTheDocument();
    expect(screen.getByText("Inscreva-se agora!")).toBeInTheDocument();
    expect(screen.getByText("azul profundo")).toBeInTheDocument();
    expect(screen.getByText("acolhedor")).toBeInTheDocument();
    expect(screen.getByLabelText("Esquema visual da composição")).toBeInTheDocument();
  });

  it("distinguishes request, art, brand, inference and unknown origins", () => {
    render(
      <CreativeVariationBrief
        source={{ ...source, contentAnalysis: { ...source.contentAnalysis, offer: "" } }}
        request="Criar uma variação sóbria"
        brandName="Cenbrap"
      />,
    );

    expect(screen.getByText("Criar uma variação sóbria")).toHaveAttribute("data-origin", "request");
    expect(screen.getByText("arte.png")).toHaveAttribute("data-origin", "source");
    expect(screen.getByText("Cenbrap")).toHaveAttribute("data-origin", "brand");
    expect(screen.getAllByText("profissional").every((node) => node.dataset.origin === "inferred")).toBe(true);
    expect(screen.getByTestId("variation-field-offer")).toHaveAttribute("data-origin", "unknown");
    expect(screen.getByTestId("variation-field-offer")).toHaveTextContent("Não informado");
    expect(screen.getByTestId("variation-field-offer")).toHaveTextContent("Desconhecido");
  });

  it("never treats a visual-only reference as a factual source", () => {
    render(
      <CreativeVariationBrief
        source={{ ...source, usage: "style", contentAnalysis: { ...source.contentAnalysis, offer: "20%" } }}
        request=""
        brandName={null}
      />,
    );

    expect(screen.getByText("Referência visual não fornece fatos.")).toBeInTheDocument();
    expect(screen.queryByText("20%")).not.toBeInTheDocument();
  });

  it("preserves a failed local edit and retries the same confirmed reading", async () => {
    const onSave = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<CreativeVariationBrief source={source} request="" brandName="Cenbrap" onSave={onSave} />);

    fireEvent.click(screen.getByRole("button", { name: "Corrigir leitura" }));
    fireEvent.change(screen.getByLabelText("Oferta ou preço"), { target: { value: "30%" } });
    fireEvent.change(screen.getByLabelText("Datas e condições"), { target: { value: "Até 30 de agosto\nVagas limitadas" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar leitura" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Sua edição continua aqui");
    expect(screen.getByLabelText("Oferta ou preço")).toHaveValue("30%");
    fireEvent.click(screen.getByRole("button", { name: "Tentar salvar novamente" }));

    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({
      contentAnalysis: expect.objectContaining({
        offer: "30%",
        textContent: expect.objectContaining({ bullets: ["Até 30 de agosto", "Vagas limitadas"] }),
      }),
    }));
    expect(await screen.findByText("Leitura salva")).toBeInTheDocument();
    expect(screen.getByTestId("variation-field-conditions")).toHaveTextContent("Até 30 de agosto · Vagas limitadas");
  });
});
