import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/components/layout/ActiveBrandSwitcher", () => ({
  default: ({ id }: { id?: string }) => <select id={id ?? "active-brand-switcher"} aria-label="Marca ativa"><option>Escolha</option></select>,
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string, values?: Record<string, string | number>) => ({
  requestLabel: "Pedido criativo", placeholder: "Descreva", addArt: "Adicionar arte", dropHint: "Solte aqui",
  restyleTitle: "Copiar o estilo da referência", restyleSubtitle: "Adicione a arte original e a referência de estilo.",
  variationsTitle: "Gere variações a partir de uma arte", variationsSubtitle: "Envie uma arte para a IA analisar.",
  variationAnalysisTitle: "Leitura da IA", variationContentTitle: "Conteúdo identificado", variationStyleTitle: "Estilo identificado",
  variationAnalysisUnavailable: "Nenhuma informação identificada.", variationInstructionsLabel: "O que você quer variar?",
  variationInstructionsHint: "Opcional. Escreva livremente ou use uma linha para cada mudança.",
  variationInstructionsPlaceholder: "Ex.:\n- Criar uma copy mais direta\n- Sugerir novos CTAs\n- Destacar a oferta",
  formatAdaptationTitle: "Adapte uma arte para outros formatos", formatAdaptationSubtitle: "Envie a arte original e escolha os formatos.",
  originalArt: "Arte original", styleReference: "Referência de estilo", fullBriefing: "Briefing visual sugerido pela IA",
  inferredBriefingTitle: "Briefing inferido",
  inferredBriefingSentence: `A IA entendeu assim: ${values?.message}; objetivo ${values?.objective}; público ${values?.audience}; oferta ${values?.offer}; tom ${values?.tone}; restrições ${values?.constraints}.`,
  briefingProvenance: "Proveniência", briefingProvenanceRequest: "Pedido do operador",
  briefingProvenanceBrand: `Marca: ${values?.brand}`, briefingProvenanceSource: `Fonte: ${values?.source}`,
  briefingFieldsLabel: "Campos do briefing inferido", briefingMessage: "Mensagem", briefingObjective: "Objetivo",
  briefingAudience: "Público", briefingOffer: "Oferta", briefingTone: "Tom", briefingConstraints: "Restrições",
  briefingUnknown: "Não informado", briefingStateSourced: "Fonte factual", briefingStateInferred: "Hipótese da IA",
  briefingStateUnknown: "Desconhecido", briefingStatus: "Prontidão e confiança do briefing", briefingReadiness: "Prontidão",
  briefingReadinessReady: "Pronto", briefingReadinessExploratory: "Exploratório", briefingReadinessBlocked: "Bloqueado",
  briefingConfidence: "Confiança", briefingConfidenceHigh: "Alta", briefingConfidenceMedium: "Média", briefingConfidenceLow: "Baixa",
  addOriginalArt: "Adicionar arte original", addStyleArt: "Adicionar referência de estilo",
  removeOriginalArt: "Remover arte original", removeStyleArt: "Remover referência de estilo",
  previewUnavailable: "Imagem indisponível", sourceUploading: "Enviando imagem", sourceReady: "Imagem pronta",
  restyleAddArt: "Adicionar arte original", addStyleReference: "Adicionar referência de estilo", generateRestyle: "Gerar reestilização",
  actionSaving: "Salvando", actionPreparing: "Preparando", actionSubmitting: "Enviando para geração", actionGenerating: "Gerando",
  factoryActiveLabel: "Fábrica criativa em atividade", factoryQueuedTitle: "Aquecendo as máquinas",
  factoryQueuedDescription: "Sua peça entrou na linha de produção.", factoryProcessingTitle: "Aplicando tinta fresca",
  factoryProcessingDescription: "As engrenagens estão montando seu criativo.",
  optionalSettings: "Ajustes opcionais", format: "Formato", formatAuto: "Automático (agora: 4:5)", targetFormats: "Formatos de destino",
  textLayout: "Posição do texto", textLayout_top: "Superior", textLayout_center: "Central", textLayout_bottom: "Inferior",
  brandFont: "Fonte da marca", brandFontChoose: "Escolha uma fonte",
  directionHelpLabel: `Ajuda sobre ${values?.direction}`, directionHelp: `Usa a orientação ${values?.instruction}`,
  formatHelpLabel: "Ajuda sobre formato", formatHelp: "Define a proporção da peça.",
  targetFormatsHelpLabel: "Ajuda sobre formatos de destino", targetFormatsHelp: "Cria uma versão para cada formato marcado.",
  brandTrainingSuggestion: "Treine referências visuais para aproximar futuros resultados da marca.", brandTrainingCta: "Treinar marca",
  brandIdentityTitle: "Identidade aplicada", brandIdentityPublished: `Córtex da Marca v${values?.version}`,
  brandIdentityLegacy: "Fluxo legado da marca", brandIdentityFrozen: "Congelada neste trabalho",
  brandIdentityLive: "Versão ativa atual", brandIdentityExact: "exato", brandIdentityReference: "referência", brandIdentityRule: "regra",
  sourceOrigin_upload: "Upload", sourceOrigin_template: "Template", sourceOrigin_approved_work: "Trabalho aprovado",
  removeSource: "Remover", removeSourceAria: "Remover fonte", sourceUsageAria: "Usar arte como",
  sourceUsage_content: "Conteúdo", sourceUsage_style: "Estilo", sourceUsage_both: "Ambos",
  sourceUsageRequired: "Escolha como esta arte será usada.", sourceStatus_uploaded: "Aguardando análise",
  sourceStatus_analyzing: "Analisando arte", sourceStatus_ready: "Análise concluída", sourceStatus_failed: "Falha na análise",
  extractedData: "Dados extraídos", retrySource: "Tentar novamente",
  brand: "Marca", noBrand: "Selecione uma marca", inspirationsSlot: "Inspirações",
  selectBrandMessage: "Selecione uma marca para começar", invalidWork: "Trabalho não encontrado", startNew: "Começar nova criação",
  brandConflictTitle: "Qual marca vale nesta peça?",
  brandConflictDescription: `A arte de conteúdo é da marca ${values?.brand}, diferente da marca ativa.`,
  brandConflictChoiceSource: `Usar a marca da arte (${values?.brand})`,
  brandConflictChoiceSourceAria: `Usar a marca da arte, ${values?.brand}, como autoridade de marca`,
  brandConflictChoiceActive: `Manter a marca ativa (${values?.brand})`,
  brandConflictChoiceActiveAria: `Manter a marca ativa, ${values?.brand}, como autoridade de marca`,
}[key] ?? (key === "generate" ? `Gerar ${values?.count} variações` : key)) }));

import { CreativeComposer } from "./CreativeComposer";
import type { CreativeComposerModel, CreativeComposerViewModel } from "./useCreativeComposer";

function composer(overrides = {}) {
  const directionPool = {
    version: 1,
    directions: [
      { id: "00000000-0000-4000-8000-000000000001", label: "Conservadora", instruction: "Preservar", order: 0, safetyBand: "safe" as const, provenance: "default" as const },
      { id: "00000000-0000-4000-8000-000000000002", label: "Equilibrada", instruction: "Equilibrar", order: 1, safetyBand: "safe" as const, provenance: "default" as const },
      { id: "00000000-0000-4000-8000-000000000003", label: "Ousada", instruction: "Explorar", order: 2, safetyBand: "experimental" as const, provenance: "default" as const },
    ],
    selectedIds: [
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000003",
    ],
    manualInstruction: null,
  };
  return {
    composerRef: { current: null }, request: "", setRequest: vi.fn(), intent: "variations", selectIntent: vi.fn(),
    format: "4:5", formatMode: "manual", setFormat: vi.fn(), setFormatAuto: vi.fn(), targetFormats: [], toggleTargetFormat: vi.fn(),
    textLayout: "top", setTextLayout: vi.fn(), fontAssetKey: null, setFontAssetKey: vi.fn(), fontOptions: [],
    directionPool, toggleDirection: vi.fn(), setManualDirectionInstruction: vi.fn(), directionSuggestionState: "idle", pendingDirectionSuggestions: null, applyDirectionSuggestions: vi.fn(), requestDirectionSuggestions: vi.fn(), keepCurrentDirections: vi.fn(), state: "empty", actionPhase: "idle",
    workId: null, brandName: "Marca A", sources: [], outputs: [], quote: { unitCount: 3, credits: 15 },
    inferredBriefing: null, briefingFactPack: null, briefingOverrides: {}, briefingEditState: "idle", editBriefingField: vi.fn(),
    campaignId: null, campaigns: [], linkCampaign: vi.fn(), retryOutput: vi.fn(), retryRevisionOutput: vi.fn(), approveOutput: vi.fn(),
    downloadOutput: vi.fn(), reviseOutput: vi.fn(), isRetryingOutput: vi.fn(), isApprovingOutput: vi.fn(), approvalErrorOutputId: null, isRevisingOutput: vi.fn(),
    canGenerate: true, isUploading: false, settingsLocked: false, error: null, announcement: "", brandTrainingSuggestion: null, brandIdentity: null, requiresBrandSelection: false,
    brandConflict: null, resolveBrandConflict: vi.fn(), isResolvingBrandConflict: false,
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

function renderComposer(value = composer(), props: { hideSourceUpload?: boolean; layout?: "studio" | "piece" } = {}) {
  const { composerRef, ...viewModel } = value;
  return render(
    <CreativeComposer
      composer={viewModel as CreativeComposerViewModel}
      composerRef={composerRef as CreativeComposerModel["composerRef"]}
      {...props}
    />,
  );
}

describe("CreativeComposer", () => {
  it("shows the versioned inferred briefing with states, readiness and unknown offer", () => {
    renderComposer(composer({
      intent: "single",
      sources: [readySource],
      inferredBriefing: {
        version: 1,
        message: { value: "Algo moderno", state: "sourced" },
        objective: { value: "Gerar interesse", state: "inferred", confidence: "medium" },
        audience: { value: null, state: "unknown" },
        offer: { value: null, state: "unknown" },
        tone: { value: "Direto", state: "sourced" },
        constraints: { value: null, state: "unknown" },
        readiness: "exploratory",
        confidence: "low",
      },
      briefingFactPack: {
        version: 1,
        request: "Algo moderno",
        facts: [
          { value: "Algo moderno", class: "text", required: true, origin: "request" },
          { value: "Direto", class: "text", required: false, origin: "source", sourceId: "source-1" },
        ],
        brand: { requiredElements: [], prohibitedElements: [] },
        identity: { clientProfileId: "profile-1", brandName: "Marca A", brandAuthority: "active" },
      },
    }));

    const briefing = screen.getByTestId("inferred-briefing");
    expect(briefing).toHaveTextContent("A IA entendeu assim: Algo moderno; objetivo Gerar interesse; público Não informado; oferta Não informado; tom Direto; restrições Não informado.");
    expect(briefing.textContent?.match(/A IA entendeu assim/g)).toHaveLength(1);
    expect(briefing).toHaveTextContent("Pedido do operador · Marca: Marca A · Fonte: arte.png");
    expect(screen.getByTestId("inferred-briefing-offer")).toHaveTextContent("Não informado");
    expect(screen.getByTestId("inferred-briefing-offer")).toHaveAttribute("data-state", "unknown");
    expect(screen.getByTestId("inferred-briefing")).toHaveTextContent("Hipótese da IA");
    expect(screen.getByTestId("inferred-briefing")).toHaveTextContent("Prontidão: Exploratório");
    expect(screen.getByTestId("inferred-briefing")).toHaveTextContent("Confiança: Baixa");
  });

  it("does not show the Peça Única briefing in another protocol", () => {
    renderComposer(composer({
      intent: "variations",
      inferredBriefing: {
        version: 1,
        message: { value: "Mensagem", state: "sourced" },
        objective: { value: "Objetivo", state: "inferred", confidence: "medium" },
        audience: { value: null, state: "unknown" },
        offer: { value: null, state: "unknown" },
        tone: { value: null, state: "unknown" },
        constraints: { value: null, state: "unknown" },
        readiness: "exploratory",
        confidence: "low",
      },
    }));

    expect(screen.queryByTestId("inferred-briefing")).not.toBeInTheDocument();
  });

  it("saves an inline briefing field on blur and Enter", () => {
    const editBriefingField = vi.fn();
    renderComposer(composer({
      intent: "single",
      editBriefingField,
      sources: [readySource],
      inferredBriefing: {
        version: 1,
        message: { value: "Mensagem", state: "sourced" },
        objective: { value: "Objetivo", state: "sourced" },
        audience: { value: null, state: "unknown" },
        offer: { value: null, state: "unknown" },
        tone: { value: null, state: "unknown" },
        constraints: { value: null, state: "unknown" },
        readiness: "exploratory",
        confidence: "low",
      },
    }));

    const audience = screen.getByLabelText("Público");
    fireEvent.change(audience, { target: { value: "Professores" } });
    fireEvent.blur(audience);

    expect(editBriefingField).toHaveBeenCalledWith("audience", "Professores");
  });

  it("shows the frozen Brand Cortex identity only on Peça única", () => {
    renderComposer(composer({
      intent: "single",
      brandIdentity: {
        source: "snapshot",
        mode: "published",
        versionNumber: 3,
        assets: [{
          referenceId: "ref-1",
          label: "Logo oficial",
          usageMode: "exact",
          reasons: ["logo primário"],
        }],
      },
    }));

    const identity = screen.getByTestId("brand-identity");
    expect(identity).toHaveTextContent("Córtex da Marca v3");
    expect(identity).toHaveTextContent("Congelada neste trabalho");
    expect(identity).toHaveTextContent("Logo oficial · exato · logo primário");

    renderComposer(composer({
      intent: "variations",
      brandIdentity: {
        source: "snapshot",
        mode: "published",
        versionNumber: 3,
        assets: [],
      },
    }));
    expect(screen.queryAllByTestId("brand-identity")).toHaveLength(1);
  });

  it("keeps Enter as a newline in Peça única and never generates from the textarea", () => {
    const value = composer({ intent: "single", quote: { unitCount: 1, credits: 5 } });
    renderComposer(value);
    const textarea = screen.getByRole("textbox", { name: /pedido criativo/i });

    fireEvent.change(textarea, { target: { value: "Linha 1\nLinha 2" } });
    fireEvent.keyDown(textarea, { key: "Enter", code: "Enter" });

    expect(value.setRequest).toHaveBeenCalledWith("Linha 1\nLinha 2");
    expect(value.generate).not.toHaveBeenCalled();
  });

  it("shows concise analysis without the legacy free-form instructions for variations", () => {
    const value = composer({
      intent: "variations",
      request: "- Criar uma copy mais direta",
      sources: [readySource],
    });

    renderComposer(value);

    expect(screen.getByText("Leitura da IA")).toBeInTheDocument();
    expect(screen.getByText(/Produto: Tênis/)).toBeInTheDocument();
    expect(screen.getByText(/Clima: urbano/)).toBeInTheDocument();

    expect(
      screen.queryByRole("textbox", { name: "O que você quer variar?" }),
    ).not.toBeInTheDocument();

    expect(
      screen.queryByRole("textbox", { name: "Produto" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the variation reference, AI reading, and directions in one responsive workspace", () => {
    renderComposer(composer({ intent: "variations", sources: [{ ...readySource, previewUrl: "/api/workspace/assets/a1/file" }] }));

    const workspace = screen.getByTestId("variation-workspace");
    const referenceAndContext = screen.getByTestId("variation-reference-context");
    const guidance = screen.getByTestId("variation-guidance");
    const directions = screen.getByTestId("variation-directions-region");
    const context = screen.getByRole("heading", { name: "Leitura da IA" }).closest("section")!;
    const optionalSettings = screen.getByTestId("creative-optional-settings");
    const action = screen.getByTestId("creative-generate-action");

    expect(workspace).toHaveClass("items-start", "lg:grid-cols-2");
    expect(referenceAndContext).toContainElement(screen.getByRole("img", { name: "arte.png" }));
    expect(referenceAndContext).toContainElement(context);
    expect(guidance).toContainElement(directions);
    expect(
      referenceAndContext.compareDocumentPosition(directions)
        & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      context.compareDocumentPosition(directions)
        & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      directions.compareDocumentPosition(optionalSettings)
        & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      optionalSettings.compareDocumentPosition(action)
        & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Conservadora" })).toHaveClass(
      "border-[var(--selection-border)]",
      "bg-[var(--selection-bg)]",
      "text-[var(--selection-text)]",
      "focus-visible:ring-[var(--focus-ring)]",
    );
  });

  it("shows each direction instruction inside its selectable card without separate help controls", () => {
    const value = composer();
    renderComposer(value);

    expect(screen.getByText("Preservar")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Ajuda sobre Conservadora" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ousada" })).toHaveClass("sm:col-span-2");

    fireEvent.click(screen.getByRole("button", { name: "Conservadora" }));
    expect(value.toggleDirection).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000001");
    expect(screen.getByRole("button", { name: "Conservadora" })).toHaveAttribute("aria-pressed", "true");
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

  it("shows the canonical CTA without financial copy and sends dropped files to the same composer", () => {
    const value = composer();
    renderComposer(value);
    const file = new File(["image"], "arte.png", { type: "image/png" });

    expect(screen.getByRole("button", { name: "Gerar 3 variações" })).toBeInTheDocument();
    expect(screen.queryByText(/crédit/i)).not.toBeInTheDocument();
    fireEvent.drop(screen.getByTestId("creative-composer-dropzone"), { dataTransfer: { files: [file] } });
    expect(value.addFiles).toHaveBeenCalledWith([file]);
    expect(screen.getByLabelText("Adicionar arte", { selector: "input" })).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });

  it("turns restyle into a direct two-image action without extra choices", () => {
    const source = {
      id: "source-1", name: "referencia.png", origin: "upload", usage: "both", status: "ready",
      usageConfirmed: false, contentAnalysis: null, styleAnalysis: null, previewUrl: null,
    };
    renderComposer(composer({ intent: "restyle", sources: [source], quote: { unitCount: 1, credits: 5 } }));

    expect(screen.getByRole("heading", { name: "Copiar o estilo da referência" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /pedido criativo/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gerar reestilização" })).toBeInTheDocument();
    expect(screen.getByLabelText("Adicionar arte original", { selector: "input" })).toBeInTheDocument();
    expect(screen.getByLabelText("Adicionar referência de estilo", { selector: "input" })).toBeInTheDocument();
    expect(screen.queryByText("Ajustes opcionais")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Usar arte como" })).not.toBeInTheDocument();
    expect(screen.queryByText("Escolha como esta arte será usada.")).not.toBeInTheDocument();
  });

  it("places restyle generation after both visual source cards", () => {
    const originalSource = {
      id: "source-original",
      name: "original-interna.png",
      origin: "upload" as const,
      usage: "content" as const,
      usageConfirmed: true,
      status: "ready" as const,
      previewUrl: "/api/workspace/assets/asset-original/file",
      contentAnalysis: null,
      styleAnalysis: null,
    };
    const styleSource = {
      id: "source-style",
      name: "referencia-interna.png",
      origin: "upload" as const,
      usage: "style" as const,
      usageConfirmed: true,
      status: "ready" as const,
      previewUrl: "/api/workspace/assets/asset-style/file",
      contentAnalysis: null,
      styleAnalysis: null,
    };

    renderComposer(composer({
      intent: "restyle",
      sources: [originalSource, styleSource],
      quote: { unitCount: 1, credits: 5 },
    }));

    const grid = screen.getByTestId("restyle-source-grid");
    const action = screen.getByTestId("creative-generate-action");

    expect(
      grid.compareDocumentPosition(action)
        & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    expect(screen.getByRole("img", {
      name: "Arte original",
    })).toBeInTheDocument();

    expect(screen.getByRole("img", {
      name: "Referência de estilo",
    })).toBeInTheDocument();

    expect(screen.queryByText("original-interna.png")).not.toBeInTheDocument();
    expect(screen.queryByText("referencia-interna.png")).not.toBeInTheDocument();
  });

  it("disables restyle generation until both sources are ready", () => {
    renderComposer(composer({
      intent: "restyle",
      canGenerate: false,
      sources: [{
        id: "source-1",
        name: "original.png",
        origin: "upload",
        usage: "content",
        usageConfirmed: true,
        status: "ready",
        previewUrl: "/api/workspace/assets/a1/file",
        contentAnalysis: null,
        styleAnalysis: null,
      }],
      quote: { unitCount: 1, credits: 5 },
    }));

    expect(screen.getByRole("button", { name: "Gerar reestilização" })).toBeDisabled();
  });

  it("routes restyle retry and remove to the matching visual card", () => {
    const value = composer({
      intent: "restyle",
      sources: [
        {
          id: "source-original",
          name: "original.png",
          origin: "upload",
          usage: "content",
          usageConfirmed: true,
          status: "failed",
          previewUrl: "/api/workspace/assets/a1/file",
          contentAnalysis: null,
          styleAnalysis: null,
        },
        {
          id: "source-style",
          name: "style.png",
          origin: "upload",
          usage: "style",
          usageConfirmed: true,
          status: "ready",
          previewUrl: "/api/workspace/assets/a2/file",
          contentAnalysis: null,
          styleAnalysis: null,
        },
      ],
      quote: { unitCount: 1, credits: 5 },
    });
    renderComposer(value);

    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(value.retrySource).toHaveBeenCalledWith("source-original");

    fireEvent.click(screen.getByRole("button", { name: "Remover referência de estilo" }));
    expect(value.removeSource).toHaveBeenCalledWith("source-style");
  });

  it("keeps preparing feedback on the generate button with aria-busy", () => {
    renderComposer(composer({
      intent: "restyle",
      actionPhase: "preparing",
      state: "analyzing",
      canGenerate: false,
      quote: { unitCount: 1, credits: 5 },
    }));

    const button = screen.getByRole("button", { name: "Preparando" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Preparando");
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

  it("keeps generation feedback in the button without a competing global animation", () => {
    renderComposer(composer({ state: "generating" }));

    expect(screen.getByRole("button", { name: "Gerando" })).toBeDisabled();
    expect(screen.queryByTestId("thinking-orb")).not.toBeInTheDocument();
  });

  it("renders CreativeSourceChip and dispatches its actions", () => {
    const source = {
      id: "source-1", name: "arte.png", origin: "upload", usage: "content", status: "failed",
      usageConfirmed: true, contentAnalysis: null, styleAnalysis: null,
      previewUrl: "/api/workspace/assets/a1/file",
    };
    const value = composer({ intent: "single", sources: [source] });
    renderComposer(value);

    expect(screen.getByRole("img", { name: "arte.png" })).toHaveAttribute("src", "/api/workspace/assets/a1/file");
    fireEvent.click(screen.getByRole("button", { name: "Estilo" }));
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(value.updateSource).toHaveBeenCalledWith("source-1", "style");
    expect(value.retrySource).toHaveBeenCalledWith("source-1");
  });

  it("mounts the manual instruction textarea only while open without clearing the direction state", () => {
    const value = composer({
      intent: "variations",
      directionPool: {
        ...composer().directionPool,
        manualInstruction: "Manter a oferta",
      },
    });
    renderComposer(value);

    expect(screen.queryByRole("textbox", { name: "manualDirections" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Conservadora" })).toHaveAttribute("aria-pressed", "true");

    const section = screen.getByText("manualDirections").closest("details")!;
    section.open = true;
    fireEvent(section, new Event("toggle"));

    const textarea = screen.getByRole("textbox", { name: "manualDirections" });
    expect(textarea).toHaveValue("Manter a oferta");
    fireEvent.change(textarea, { target: { value: "Destacar a oferta" } });
    expect(value.setManualDirectionInstruction).toHaveBeenCalledWith("Destacar a oferta");

    section.open = false;
    fireEvent(section, new Event("toggle"));
    expect(screen.queryByRole("textbox", { name: "manualDirections" })).not.toBeInTheDocument();

    section.open = true;
    fireEvent(section, new Event("toggle"));
    expect(screen.getByRole("textbox", { name: "manualDirections" })).toHaveValue("Manter a oferta");
    expect(screen.getByRole("button", { name: "Conservadora" })).toHaveAttribute("aria-pressed", "true");
  });

  it("applies the pending late response as a replacement set (#129)", () => {
    const pending = {
      directions: [
        { id: "00000000-0000-4000-8000-0000000000a1", label: "Sugerida", instruction: "Instrução", order: 0, safetyBand: "safe" as const, provenance: "ai-suggestion" as const },
      ],
      preserveSelection: false,
    };
    const value = composer({ directionSuggestionState: "ready", pendingDirectionSuggestions: pending });
    renderComposer(value);

    fireEvent.click(screen.getByRole("button", { name: "applyDirections" }));
    expect(value.applyDirectionSuggestions).toHaveBeenCalledWith(pending.directions, false);
  });

  it("applies the pending 'Sugerir novamente' response preserving the selection (#129)", () => {
    const pending = {
      directions: [
        { id: "00000000-0000-4000-8000-0000000000a2", label: "Nova", instruction: "Instrução", order: 0, safetyBand: "safe" as const, provenance: "ai-suggestion" as const },
      ],
      preserveSelection: true,
    };
    const value = composer({ directionSuggestionState: "ready", pendingDirectionSuggestions: pending });
    renderComposer(value);

    fireEvent.click(screen.getByRole("button", { name: "applyDirections" }));
    expect(value.applyDirectionSuggestions).toHaveBeenCalledWith(pending.directions, true);
  });

  it("shows automatic format as a distinct choice so 4:5 can be pinned", () => {
    const value = composer({ format: "4:5", formatMode: "auto" });
    renderComposer(value);

    const select = screen.getByRole("combobox", { name: "Formato" });
    expect(select).toHaveValue("auto");
    fireEvent.change(select, { target: { value: "4:5" } });
    expect(value.setFormat).toHaveBeenCalledWith("4:5");
  });

  it("lets Peça única choose a limited text layout and an approved font", () => {
    const value = composer({
      intent: "single",
      textLayout: "top",
      fontOptions: [
        { assetKey: "fonts/heading.ttf", family: "Heading", weight: 700, style: "normal" },
        { assetKey: "fonts/body.ttf", family: "Body", weight: 400, style: "normal" },
      ],
      quote: { unitCount: 1, credits: 5 },
    });
    renderComposer(value);

    const details = screen.getByTestId("creative-optional-settings");
    fireEvent.click(details.querySelector("summary")!);
    fireEvent.change(screen.getByRole("combobox", { name: "Posição do texto" }), { target: { value: "bottom" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Fonte da marca" }), { target: { value: "fonts/body.ttf" } });

    expect(value.setTextLayout).toHaveBeenCalledWith("bottom");
    expect(value.setFontAssetKey).toHaveBeenCalledWith("fonts/body.ttf");
  });

  it("locks frozen typography controls after preparation", () => {
    renderComposer(composer({
      intent: "single",
      settingsLocked: true,
      fontOptions: [{ assetKey: "fonts/body.ttf", family: "Body", weight: 400, style: "normal" }],
      quote: { unitCount: 1, credits: 5 },
    }));

    fireEvent.click(screen.getByTestId("creative-optional-settings").querySelector("summary")!);
    expect(screen.getByRole("combobox", { name: "Formato" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Posição do texto" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Fonte da marca" })).toBeDisabled();
  });

  it("explains format settings without attaching redundant help to generation", async () => {
    renderComposer(composer({ intent: "format_adaptation", targetFormats: ["1:1"] }));

    const targetFormatsHelp = screen.getByRole("button", { name: "Ajuda sobre formatos de destino" });
    fireEvent.pointerDown(targetFormatsHelp, { pointerType: "touch" });
    fireEvent.click(targetFormatsHelp);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Cria uma versão para cada formato marcado.");
    expect(screen.queryByRole("button", { name: /Ajuda sobre (Adicionar|Remover|Tentar novamente|Gerar)/i })).not.toBeInTheDocument();
  });

  it("renders the hydrated model without applying a second preset state", () => {
    const value = composer({ workId: "work-1", intent: "single", quote: { unitCount: 1, credits: 5 } });
    renderComposer(value);
    expect(value.selectIntent).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Gerar 1 variações" })).toBeInTheDocument();
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

    expect(screen.getAllByRole("img")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Selecionar Ousada em 4:5" }));
    expect(screen.getByText("Aplicando tinta fresca")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Selecionar Conservadora em 4:5" }));
    fireEvent.click(screen.getAllByRole("button", { name: "reviewBeforeApprove" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "confirmApproval" })[0]);
    expect(value.approveOutput).toHaveBeenCalledWith("output-1", true);
    expect(screen.getAllByRole("button", { name: "Baixar" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Editar" })).toHaveLength(1);
  });

  it("turns a completed piece into review plus AI reading while Studio keeps its creation flow", () => {
    const output = {
      id: "output-1", workspaceId: "ws-1", workItemId: "work-1", creativeLevel: "conservative",
      targetFormat: "4:5", versionNumber: 1, parentOutputId: null, revisionInstruction: null,
      revisionAssetId: null, retryCount: 0, operationKey: "conservative:4:5:1", status: "completed",
      outputKey: "out/1.png", cost: 5, failureCode: null, quality: null, isSelected: false,
      createdAt: new Date(), updatedAt: new Date(),
    };
    const piece = renderComposer(composer({ workId: "work-1", outputs: [output], sources: [readySource] }), { layout: "piece" });
    const pieceResults = screen.getByRole("heading", { name: "Resultados" }).closest("section")!;
    const pieceReading = screen.getByRole("heading", { name: "Leitura da IA" }).closest("section")!;

    expect(pieceResults.compareDocumentPosition(pieceReading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByTestId("creative-composer-dropzone")).not.toBeInTheDocument();
    expect(screen.queryByTestId("creative-generate-action")).not.toBeInTheDocument();

    piece.unmount();
    renderComposer(composer({ workId: "work-1", outputs: [output] }));
    const studioResults = screen.getByRole("heading", { name: "Resultados" }).closest("section")!;
    const studioDropzone = screen.getByTestId("creative-composer-dropzone");

    expect(studioDropzone.compareDocumentPosition(studioResults) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

  it("moves focus to the brand-conflict choice with accessible labels and no new draft (R-008)", () => {
    const value = composer({
      workId: "work-1",
      brandConflict: {
        detectedBrand: "XTB",
        activeBrand: "NR1",
        sourceId: "source-1",
        choices: ["source", "active"],
      },
    });
    renderComposer(value);

    const panel = screen.getByTestId("brand-conflict-choice");
    expect(panel).toHaveTextContent("Qual marca vale nesta peça?");
    expect(panel).toHaveTextContent("A arte de conteúdo é da marca XTB");
    const sourceChoice = screen.getByRole("button", { name: "Usar a marca da arte (XTB)" });
    const activeChoice = screen.getByRole("button", { name: "Manter a marca ativa (NR1)" });
    // R-008.3: focus lands on the choice — the only pending decision.
    expect(sourceChoice).toHaveFocus();
    fireEvent.click(sourceChoice);
    expect(value.resolveBrandConflict).toHaveBeenCalledWith("source");
    fireEvent.click(activeChoice);
    expect(value.resolveBrandConflict).toHaveBeenCalledWith("active");
    // Exactly two short choices — never a wizard, never a new draft action.
    expect(panel.querySelectorAll("button")).toHaveLength(2);
  });

  it("keeps both brand choices disabled while a choice is being applied", () => {
    const value = composer({
      workId: "work-1",
      isResolvingBrandConflict: true,
      brandConflict: {
        detectedBrand: "XTB",
        activeBrand: "NR1",
        sourceId: "source-1",
        choices: ["source", "active"],
      },
    });
    renderComposer(value);

    expect(screen.getByRole("button", { name: "Usar a marca da arte (XTB)" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Manter a marca ativa (NR1)" })).toBeDisabled();
  });

  it("returns focus to the generate button only after the resumed submit settles to idle", () => {
    const conflict = {
      detectedBrand: "XTB",
      activeBrand: "NR1",
      sourceId: "source-1",
      choices: ["source", "active"] as const,
    };
    const value = composer({ workId: "work-1", brandConflict: conflict });
    const { rerender } = renderComposer(value);
    expect(screen.getByRole("button", { name: "Usar a marca da arte (XTB)" })).toHaveFocus();

    // Conflict resolved but the resumed submit is still running: the
    // generate button is disabled and focus must NOT drop yet.
    rerender(
      <CreativeComposer
        composer={composer({ workId: "work-1", brandConflict: null, actionPhase: "submitting" })}
        composerRef={{ current: null }}
      />,
    );
    const generateButton = screen.getByTestId("creative-generate-action").querySelector("button")!;
    expect(generateButton).toBeDisabled();
    expect(generateButton).not.toHaveFocus();

    // Submit settled: focus lands back on the re-enabled generate button.
    rerender(
      <CreativeComposer
        composer={composer({ workId: "work-1", brandConflict: null, actionPhase: "idle" })}
        composerRef={{ current: null }}
      />,
    );
    expect(generateButton).not.toBeDisabled();
    expect(generateButton).toHaveFocus();
  });
});
