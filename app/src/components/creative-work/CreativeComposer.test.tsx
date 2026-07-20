import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/components/layout/ActiveBrandSwitcher", () => ({
  default: ({ id }: { id?: string }) => <select id={id ?? "active-brand-switcher"} aria-label="Marca ativa"><option>Escolha</option></select>,
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string, values?: Record<string, number>) => ({
  requestLabel: "Pedido criativo", placeholder: "Descreva", addArt: "Adicionar arte", dropHint: "Solte aqui",
  restyleTitle: "Copiar o estilo da referência", restyleSubtitle: "Adicione a arte original e a referência de estilo.",
  variationsTitle: "Gere variações a partir de uma arte", variationsSubtitle: "Envie uma arte para a IA analisar.",
  variationAnalysisTitle: "Leitura da IA", variationContentTitle: "Conteúdo identificado", variationStyleTitle: "Estilo identificado",
  variationAnalysisUnavailable: "Nenhuma informação identificada.", variationInstructionsLabel: "O que você quer variar?",
  variationInstructionsHint: "Opcional. Escreva livremente ou use uma linha para cada mudança.",
  variationInstructionsPlaceholder: "Ex.:\n- Criar uma copy mais direta\n- Sugerir novos CTAs\n- Destacar a oferta",
  formatAdaptationTitle: "Adapte uma arte para outros formatos", formatAdaptationSubtitle: "Envie a arte original e escolha os formatos.",
  originalArt: "Arte original", styleReference: "Referência de estilo", fullBriefing: "Briefing visual sugerido pela IA",
  restyleAddArt: "Adicionar arte original", addStyleReference: "Adicionar referência de estilo", generateRestyle: "Gerar reestilização · 5 créditos",
  actionSaving: "Salvando", actionPreparing: "Preparando", actionSubmitting: "Enviando para geração", actionGenerating: "Gerando",
  optionalSettings: "Ajustes opcionais", format: "Formato", formatAuto: "Automático (agora: 4:5)", targetFormats: "Formatos de destino",
  brandTrainingSuggestion: "Treine referências visuais para aproximar futuros resultados da marca.", brandTrainingCta: "Treinar marca",
  sourceOrigin_upload: "Upload", sourceOrigin_template: "Template", sourceOrigin_approved_work: "Trabalho aprovado",
  removeSource: "Remover", removeSourceAria: "Remover fonte", sourceUsageAria: "Usar arte como",
  sourceUsage_content: "Conteúdo", sourceUsage_style: "Estilo", sourceUsage_both: "Ambos",
  sourceUsageRequired: "Escolha como esta arte será usada.", sourceStatus_uploaded: "Aguardando análise",
  sourceStatus_analyzing: "Analisando arte", sourceStatus_ready: "Análise concluída", sourceStatus_failed: "Falha na análise",
  extractedData: "Dados extraídos", retrySource: "Tentar novamente",
  brand: "Marca", noBrand: "Selecione uma marca", inspirationsSlot: "Inspirações",
  selectBrandMessage: "Selecione uma marca para começar", invalidWork: "Trabalho não encontrado", startNew: "Começar nova criação",
}[key] ?? (key === "generate" ? `Gerar ${values?.count} variações · ${values?.credits} créditos` : key)) }));

import { CreativeComposer } from "./CreativeComposer";
import type { CreativeComposerModel, CreativeComposerViewModel } from "./useCreativeComposer";

function composer(overrides = {}) {
  return {
    composerRef: { current: null }, request: "", setRequest: vi.fn(), intent: "variations", selectIntent: vi.fn(),
    format: "4:5", formatMode: "manual", setFormat: vi.fn(), setFormatAuto: vi.fn(), targetFormats: [], toggleTargetFormat: vi.fn(), state: "empty", actionPhase: "idle",
    workId: null, brandName: "Marca A", sources: [], outputs: [], quote: { unitCount: 3, credits: 15 },
    campaignId: null, campaigns: [], linkCampaign: vi.fn(), retryOutput: vi.fn(), retryRevisionOutput: vi.fn(), approveOutput: vi.fn(),
    downloadOutput: vi.fn(), reviseOutput: vi.fn(), isRetryingOutput: vi.fn(), isApprovingOutput: vi.fn(), isRevisingOutput: vi.fn(),
    canGenerate: true, isUploading: false, error: null, announcement: "", brandTrainingSuggestion: null, requiresBrandSelection: false,
    retryInitialTemplate: null,
    workError: false,
    addFiles: vi.fn(), updateSource: vi.fn(), retrySource: vi.fn(), removeSource: vi.fn(), generate: vi.fn(),
    ...overrides,
  };
}

const readySource = {
  id: "source-1",
  name: "arte.png",
  origin: "upload" as const,
  usage: "both" as const,
  usageConfirmed: true,
  status: "ready" as const,
  contentAnalysis: {
    product: "Tênis",
    offer: "20%",
    cta: { text: "Comprar", style: "botão" },
    brandElements: [],
    keyVisual: "Produto",
    textContent: { headline: "Oferta", bullets: [] },
    format: "4:5",
  },
  styleAnalysis: {
    colorPalette: { dominant: ["preto"], accents: ["verde"], gradients: "" },
    typography: { personality: "forte", effects: [] },
    textures: [],
    composition: "central",
    mood: "urbano",
    decorativeElements: [],
    photoTreatment: "contraste alto",
  },
};

function renderComposer(value = composer()) {
  const { composerRef, ...viewModel } = value;
  return render(
    <CreativeComposer
      composer={viewModel as CreativeComposerViewModel}
      composerRef={composerRef as CreativeComposerModel["composerRef"]}
    />,
  );
}

describe("CreativeComposer", () => {
  it("keeps Enter as a newline in Peça única and never generates from the textarea", () => {
    const value = composer({ intent: "single", quote: { unitCount: 1, credits: 5 } });
    renderComposer(value);
    const textarea = screen.getByRole("textbox", { name: /pedido criativo/i });

    fireEvent.change(textarea, { target: { value: "Linha 1\nLinha 2" } });
    fireEvent.keyDown(textarea, { key: "Enter", code: "Enter" });

    expect(value.setRequest).toHaveBeenCalledWith("Linha 1\nLinha 2");
    expect(value.generate).not.toHaveBeenCalled();
  });

  it("shows concise analysis and optional free-form instructions only for variations", () => {
    const value = composer({
      intent: "variations",
      request: "- Criar uma copy mais direta",
      sources: [readySource],
    });

    renderComposer(value);

    expect(screen.getByText("Leitura da IA")).toBeInTheDocument();
    expect(screen.getByText(/Produto: Tênis/)).toBeInTheDocument();
    expect(screen.getByText(/Clima: urbano/)).toBeInTheDocument();

    const instructions = screen.getByRole("textbox", {
      name: "O que você quer variar?",
    });

    expect(instructions).toHaveValue("- Criar uma copy mais direta");

    fireEvent.change(instructions, {
      target: { value: "- Trocar copy\n- Adicionar CTA" },
    });

    expect(value.setRequest).toHaveBeenCalledWith(
      "- Trocar copy\n- Adicionar CTA",
    );

    expect(
      screen.queryByRole("textbox", { name: "Produto" }),
    ).not.toBeInTheDocument();
  });

  it.each(["single", "format_adaptation", "restyle"] as const)(
    "does not show variation instructions for %s",
    (intent) => {
      renderComposer(composer({ intent, sources: [readySource] }));

      expect(
        screen.queryByRole("textbox", {
          name: "O que você quer variar?",
        }),
      ).not.toBeInTheDocument();
    },
  );

  it("shows the canonical paid CTA and sends dropped files to the same composer", () => {
    const value = composer();
    renderComposer(value);
    const file = new File(["image"], "arte.png", { type: "image/png" });

    expect(screen.getByRole("button", { name: "Gerar 3 variações · 15 créditos" })).toBeInTheDocument();
    fireEvent.drop(screen.getByTestId("creative-composer-dropzone"), { dataTransfer: { files: [file] } });
    expect(value.addFiles).toHaveBeenCalledWith([file]);
    expect(screen.getByLabelText("Adicionar arte", { selector: "input" })).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });

  it("turns restyle into a direct two-image action without extra choices", () => {
    const source = {
      id: "source-1", name: "referencia.png", origin: "upload", usage: "both", status: "ready",
      usageConfirmed: false, contentAnalysis: null, styleAnalysis: null,
    };
    renderComposer(composer({ intent: "restyle", sources: [source], quote: { unitCount: 1, credits: 5 } }));

    expect(screen.getByRole("heading", { name: "Copiar o estilo da referência" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /pedido criativo/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gerar reestilização · 5 créditos" })).toBeInTheDocument();
    expect(screen.getByLabelText("Adicionar arte original", { selector: "input" })).toBeInTheDocument();
    expect(screen.getByLabelText("Adicionar referência de estilo", { selector: "input" })).toBeInTheDocument();
    expect(screen.queryByText("Ajustes opcionais")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Usar arte como" })).not.toBeInTheDocument();
    expect(screen.queryByText("Escolha como esta arte será usada.")).not.toBeInTheDocument();
  });

  it("uses a source-only composer for format adaptation", () => {
    renderComposer(composer({
      intent: "format_adaptation",
      targetFormats: ["1:1", "9:16"],
      quote: { unitCount: 2, credits: 10 },
    }));

    expect(screen.getByRole("heading", { name: "Adapte uma arte para outros formatos" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /pedido criativo/i })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Formatos de destino" })).toBeInTheDocument();
  });

  it("shows generation feedback in the button and visible status", () => {
    renderComposer(composer({ actionPhase: "preparing", state: "analyzing", canGenerate: false }));

    expect(screen.getByRole("button", { name: "Preparando" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Preparando");
    expect(screen.getByRole("status")).not.toHaveClass("sr-only");
  });

  it("renders CreativeSourceChip and dispatches its actions", () => {
    const source = {
      id: "source-1", name: "arte.png", origin: "upload", usage: "content", status: "failed",
      usageConfirmed: true, contentAnalysis: null, styleAnalysis: null,
    };
    const value = composer({ intent: "single", sources: [source] });
    renderComposer(value);

    fireEvent.click(screen.getByRole("button", { name: "Estilo" }));
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(value.updateSource).toHaveBeenCalledWith("source-1", "style");
    expect(value.retrySource).toHaveBeenCalledWith("source-1");
  });

  it("shows automatic format as a distinct choice so 4:5 can be pinned", () => {
    const value = composer({ format: "4:5", formatMode: "auto" });
    renderComposer(value);

    const select = screen.getByRole("combobox", { name: "Formato" });
    expect(select).toHaveValue("auto");
    fireEvent.change(select, { target: { value: "4:5" } });
    expect(value.setFormat).toHaveBeenCalledWith("4:5");
  });

  it("renders the hydrated model without applying a second preset state", () => {
    const value = composer({ workId: "work-1", intent: "single", quote: { unitCount: 1, credits: 5 } });
    renderComposer(value);
    expect(value.selectIntent).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Gerar 1 variações · 5 créditos" })).toBeInTheDocument();
  });

  it("renders a focusable inline brand choice and disables paid work for a new draft", () => {
    const value = composer({
      brandName: null, canGenerate: false, requiresBrandSelection: true, workId: null,
    });
    renderComposer(value);
    expect(screen.getByText("Selecione uma marca para começar")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Marca ativa" })).toHaveAttribute("id", "active-brand-switcher-inline");
    expect(screen.getByRole("button", { name: /Gerar/ })).toBeDisabled();
  });

  it("renders an explicit invalid-work recovery instead of a locked composer", () => {
    const value = composer({ workError: true, workId: "missing" });
    renderComposer(value);
    expect(screen.getByRole("alert")).toHaveTextContent("Trabalho não encontrado");
    expect(screen.getByRole("link", { name: "Começar nova criação" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("textbox", { name: /pedido criativo/i })).not.toBeInTheDocument();
  });

  it("offers an explicit retry when the initial template attach fails", () => {
    const retryInitialTemplate = vi.fn();
    const value = composer({ error: "Falha ao adicionar inspiração", retryInitialTemplate });
    renderComposer(value);

    fireEvent.click(screen.getByRole("button", { name: "retryTemplate" }));
    expect(retryInitialTemplate).toHaveBeenCalledOnce();
  });

  it("shows the optional brand training suggestion without blocking results", () => {
    renderComposer(composer({
      clientProfileId: "profile-a",
      brandTrainingSuggestion: "Treine referências visuais para aproximar futuros resultados da marca.",
    }));

    expect(screen.getByText(/Treine referências visuais/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Treinar marca" })).toHaveAttribute(
      "href",
      "/brand-kit?mode=training&clientProfileId=profile-a",
    );
  });

  it("shows completed results immediately while another output keeps its own processing status", () => {
    const baseOutput = {
      id: "output-1", workspaceId: "ws-1", workItemId: "work-1", creativeLevel: "conservative",
      targetFormat: "4:5", versionNumber: 1, parentOutputId: null, revisionInstruction: null,
      revisionAssetId: null, retryCount: 0, operationKey: "conservative:4:5:1", status: "completed",
      outputKey: "out/1.png", cost: 5, failureCode: null, quality: null, isSelected: false,
      createdAt: new Date(), updatedAt: new Date(),
    };
    const value = composer({
      workId: "work-1",
      outputs: [
        baseOutput,
        { ...baseOutput, id: "output-2", creativeLevel: "balanced", operationKey: "balanced:4:5:1" },
        { ...baseOutput, id: "output-3", creativeLevel: "bold", operationKey: "bold:4:5:1", status: "processing", outputKey: null },
      ],
    });
    renderComposer(value);

    expect(screen.getAllByRole("img")).toHaveLength(2);
    expect(screen.getByText("Gerando...")).toBeVisible();
    fireEvent.click(screen.getAllByRole("button", { name: "Aprovar" })[0]);
    expect(value.approveOutput).toHaveBeenCalledWith("output-1");
    expect(screen.getAllByRole("button", { name: "Baixar" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Editar" })).toHaveLength(2);
  });

  it("groups an existing campaign without creating one", () => {
    const value = composer({
      workId: "work-1",
      outputs: [{
        id: "output-1", workspaceId: "ws-1", workItemId: "work-1", creativeLevel: "balanced",
        targetFormat: "4:5", versionNumber: 1, parentOutputId: null, revisionInstruction: null,
        revisionAssetId: null, retryCount: 0, operationKey: "balanced:4:5:1", status: "completed",
        outputKey: "out/1.png", cost: 5, failureCode: null, quality: null, isSelected: false,
        createdAt: new Date(), updatedAt: new Date(),
      }],
      campaigns: [{ id: "campaign-1", name: "Matrículas" }],
    });
    renderComposer(value);
    fireEvent.change(screen.getByRole("combobox", { name: "Agrupar em campanha" }), { target: { value: "campaign-1" } });
    expect(value.linkCampaign).toHaveBeenCalledWith("campaign-1");
  });
});
