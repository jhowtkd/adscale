import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState, type RefObject } from "react";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/hooks/use-piece-review-share", () => ({
  useSharePieceReview: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/hooks/use-piece-favorite", () => ({
  usePieceFavorite: () => ({ isFavorite: false, isPending: false, toggle: vi.fn() }),
}));
vi.mock("@/lib/hooks/use-person-fidelity", () => ({
  useOutputPersonReferences: () => ({ data: [] }),
  useReviewPersonFidelity: () => ({ review: vi.fn(), isPending: false, isError: false, reset: vi.fn() }),
}));
vi.mock("@/components/layout/ActiveBrandSwitcher", () => ({
  default: ({ id }: { id?: string }) => <select id={id ?? "active-brand-switcher"} aria-label="Marca ativa"><option>Escolha</option></select>,
}));
vi.mock("./StudioPieceWorkspace", () => ({
  StudioPieceWorkspace: ({ composer }: { composer: { outputs: unknown[] } }) => (
    <div data-testid="studio-piece-workspace" data-output-count={composer.outputs.length} />
  ),
}));
const carouselComposerKeys: Record<string, string> = {
  title: "Criar carrossel", subtitle: "Transforme uma ideia ou texto em uma sequência visual coerente.",
  requestLabel: "Pedido do carrossel", requestPlaceholder: "Descreva a sequência que você precisa.",
  addStyleReference: "Adicionar referência de estilo", uploadingStyle: "Enviando referência",
  styleHint: "A referência vale só para este carrossel e nunca vira fato.",
  sourceStatus_ready: "Referência pronta", retryStyleSource: "Tentar novamente",
  removeStyleSource: "Remover referência de estilo", organizeContent: "Organizar conteúdo", organizing: "Organizando conteúdo",
};

vi.mock("next-intl", () => ({ useTranslations: (namespace?: string) => namespace === "dashboard.home.composer.carousel"
  ? (key: string) => carouselComposerKeys[key] ?? key
  : (key: string, values?: Record<string, string | number>) => ({
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
  "results.title": "Resultados", "results.subtitle": "Cada resultado fica salvo assim que termina.", "results.campaignLabel": "Agrupar em campanha", "results.noCampaign": "Sem campanha",
  "proposal.level.conservative": "Conservadora", "proposal.level.balanced": "Equilibrada", "proposal.level.bold": "Ousada", "proposal.status.queued": "na fila", "proposal.status.processing": "gerando", "proposal.status.completed": "pronta", "proposal.status.failed": "falhou", "proposal.progress": `${values?.ready} de ${values?.total} prontas`, "proposal.thumbnailsAria": "Miniaturas das propostas", "proposal.selectAria": `Selecionar ${values?.name} em ${values?.format}`, "proposal.expandAria": `Ampliar ${values?.name} em ${values?.format}`, "proposal.previewAlt": `Proposta ${values?.name}, formato ${values?.format}`, "proposal.approvalSurfaceAria": "Superfície de aprovação", variationShort: `v${values?.count}`, "status.completed": "Pronto", approve: "Aprovar", download: "Baixar", refine: "Refinar", approved: "Aprovada", retry: "Tentar novamente", retryProposal: "Repetir esta proposta", reviewBeforeApprove: "Revisar e aprovar", confirmApproval: "Confirmar aprovação", "recipes.title": "Receitas visuais", "recipes.use": "Usar receita", "offers.title": "Ofertas da marca", "offers.use": "Usar oferta", "offers.save": "Salvar oferta", "offers.validUntil": "Válida até",
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
  "carousel.title": "Criar carrossel", "carousel.subtitle": "Transforme uma ideia ou texto em uma sequência visual coerente.",
  "carousel.requestLabel": "Pedido do carrossel", "carousel.requestPlaceholder": "Descreva a sequência que você precisa.",
  "carousel.addStyleReference": "Adicionar referência de estilo", "carousel.uploadingStyle": "Enviando referência",
  "carousel.styleHint": "A referência vale só para este carrossel e nunca vira fato.",
  "carousel.sourceStatus_ready": "Referência pronta", "carousel.retryStyleSource": "Tentar novamente",
  "carousel.removeStyleSource": "Remover referência de estilo", "carousel.organizeContent": "Organizar conteúdo", "carousel.organizing": "Organizando conteúdo",
  brandConflictTitle: "Qual marca vale nesta peça?",
  brandConflictDescription: `A arte de conteúdo é da marca ${values?.brand}, diferente da marca ativa.`,
  brandConflictChoiceSource: `Usar a marca da arte (${values?.brand})`,
  brandConflictChoiceSourceAria: `Usar a marca da arte, ${values?.brand}, como autoridade de marca`,
  brandConflictChoiceActive: `Manter a marca ativa (${values?.brand})`,
  brandConflictChoiceActiveAria: `Manter a marca ativa, ${values?.brand}, como autoridade de marca`,
}[key] ?? (key === "generate" ? `Gerar ${values?.count} variações` : key)) }));

import { CreativeComposer } from "./CreativeComposer";
import type { CreativeComposerModel, CreativeComposerViewModel } from "./useCreativeComposer";
import { TalkBox } from "@/components/dashboard/studio-stage/TalkBox";

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
    offeredFormats: ["1:1", "4:5", "9:16"], threeFourCreationEnabled: false,
    textLayout: "top", setTextLayout: vi.fn(), fontAssetKey: null, setFontAssetKey: vi.fn(), fontOptions: [],
    visualRecipes: [], instantiateRecipe: vi.fn(),
    commercialOffers: [], instantiateOffer: vi.fn(), saveCommercialOffer: vi.fn(),
    directionPool, toggleDirection: vi.fn(), setManualDirectionInstruction: vi.fn(), directionSuggestionState: "idle", pendingDirectionSuggestions: null, applyDirectionSuggestions: vi.fn(), requestDirectionSuggestions: vi.fn(), keepCurrentDirections: vi.fn(), state: "empty", stage: "entry", objectiveSelected: true, preparedPlan: null, actionPhase: "idle",
    workId: null, brandName: "Marca A", sources: [], outputs: [], quote: { unitCount: 3, credits: 15 },
    inferredBriefing: null, briefingFactPack: null, briefingOverrides: {}, briefingEditState: "idle", editBriefingField: vi.fn(),
    campaignId: null, campaigns: [], linkCampaign: vi.fn(), retryOutput: vi.fn(), retryRevisionOutput: vi.fn(), approveOutput: vi.fn(),
    downloadOutput: vi.fn(), reviseOutput: vi.fn(), isRetryingOutput: vi.fn(), isApprovingOutput: vi.fn(), approvalErrorOutputId: null, isRevisingOutput: vi.fn(),
    canGenerate: true, isUploading: false, settingsLocked: false, error: null, announcement: "", brandTrainingSuggestion: null, brandIdentity: null, requiresBrandSelection: false,
    brandConflict: null, resolveBrandConflict: vi.fn(), isResolvingBrandConflict: false,
    retryInitialTemplate: null,
    workError: false,
    addFiles: vi.fn(), updateSource: vi.fn(), retrySource: vi.fn(), removeSource: vi.fn(), preparePlan: vi.fn(), confirmGeneration: vi.fn(), generateLegacy: vi.fn(),
    carousel: {
      draft: null, editorial: null, slides: [], quality: null, selectedSlideId: null, selectedSlide: null,
      phase: "entry", findings: [], editorialError: null, coverQuote: { unitCount: 1, credits: 50 }, interiorsQuote: { unitCount: 4, credits: 200 },
      canPrepare: false, canGenerate: false, canApprove: false, canApproveScript: false, canApproveCover: false, isBusy: false,
      askForPlan: vi.fn(), answerQuestions: vi.fn(), selectHook: vi.fn(), regenerateHooks: vi.fn(),
      approveScript: vi.fn(), approveCoverAndGenerate: vi.fn(), acceptChange: vi.fn(), rejectChange: vi.fn(),
      editSlide: vi.fn(), addSlide: vi.fn(), removeSlide: vi.fn(), moveSlide: vi.fn(),
      prepareCarousel: vi.fn(), generateCarousel: vi.fn(), reviseSlide: vi.fn(), retrySlide: vi.fn(),
      approveDeck: vi.fn(), downloadSlide: vi.fn(), exportDeck: vi.fn(), selectSlide: vi.fn(),
    },
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

function renderComposer(value = composer(), props: {
  hideSourceUpload?: boolean;
  layout?: "studio" | "piece";
  workflowVariant?: "control" | "progressive";
  chrome?: "full" | "stage";
  resultsContainer?: HTMLElement | null;
  primaryActionRef?: RefObject<HTMLButtonElement | null>;
  controlsActive?: boolean;
} = {}) {
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

  it("does not claim applied identity on Peça única without a brand", () => {
    renderComposer(composer({
      intent: "single",
      clientProfileId: null,
      brandName: null,
      brandIdentity: {
        source: "live",
        mode: "legacy_fallback",
        versionNumber: null,
        assets: [],
      },
    }));
    expect(screen.queryByTestId("brand-identity")).not.toBeInTheDocument();
  });

  it("keeps Enter as a newline in Peça única and never generates from the textarea", () => {
    const value = composer({ intent: "single", quote: { unitCount: 1, credits: 5 } });
    renderComposer(value);
    const textarea = screen.getByRole("textbox", { name: /pedido criativo/i });

    fireEvent.change(textarea, { target: { value: "Linha 1\nLinha 2" } });
    fireEvent.keyDown(textarea, { key: "Enter", code: "Enter" });

    expect(value.setRequest).toHaveBeenCalledWith("Linha 1\nLinha 2");
    expect(value.generateLegacy).not.toHaveBeenCalled();
  });

  it("shows concise analysis without the legacy free-form instructions for variations", () => {
    const value = composer({
      intent: "variations",
      request: "- Criar uma copy mais direta",
      sources: [readySource],
    });

    renderComposer(value);

    expect(screen.getByText("Leitura da IA")).toBeInTheDocument();
    expect(screen.getByTestId("variation-analysis-summary")).toHaveTextContent("Produto: Tênis");
    expect(screen.getByTestId("variation-analysis-summary")).toHaveTextContent("Clima: urbano");

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

    expect(action.textContent?.toLowerCase()).not.toMatch(/crédito|credit/);

    expect(workspace).toHaveClass("lg:grid-cols-2", "lg:items-stretch");
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

  it("gives the variation reference and guidance panels the same presence", () => {
    renderComposer(composer({ intent: "variations", sources: [{ ...readySource, previewUrl: "/api/workspace/assets/a1/file" }] }));

    const referencePanel = screen.getByTestId("variation-reference-panel");
    const directions = screen.getByTestId("variation-directions-region");
    const panelClasses = ["rounded-[var(--radius-object)]", "border", "border-[var(--border-subtle)]", "bg-[var(--surface-base)]", "p-4"];
    expect(referencePanel).toHaveClass(...panelClasses);
    expect(directions).toHaveClass(...panelClasses);
    expect(screen.getByRole("img", { name: "arte.png" })).toHaveClass("object-contain");
    expect(screen.getByTestId("variation-workspace")).not.toHaveClass("grid-cols-2");
    const optionalSettings = screen.getByTestId("creative-optional-settings");
    expect(optionalSettings).toContainElement(screen.getByLabelText("Formato"));
    expect(
      directions.compareDocumentPosition(optionalSettings)
        & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders direction cards in the current visual system with keyboard affordances", () => {
    const base = composer();
    const value = {
      ...base,
      directionPool: { ...base.directionPool, selectedIds: [base.directionPool.selectedIds[0]!] },
    };
    renderComposer(value);

    const selected = screen.getByRole("button", { name: "Conservadora" });
    expect(selected).toHaveAttribute("aria-pressed", "true");
    expect(selected).toHaveClass("bg-[var(--selection-bg)]");
    const unselected = screen.getByRole("button", { name: "Equilibrada" });
    expect(unselected).toHaveAttribute("aria-pressed", "false");
    expect(unselected).toHaveClass(
      "border-[var(--border-subtle)]",
      "bg-[var(--surface-inset)]",
      "hover:bg-[var(--surface-raised)]",
      "focus-visible:ring-[var(--focus-ring)]",
    );
    expect(unselected).toHaveTextContent("Equilibrar");
    expect(screen.queryByRole("button", { name: "Ajuda sobre Equilibrada" })).not.toBeInTheDocument();
  });

  it("keeps loading, retry, and keep-current controls in the renewed directions block", () => {
    const base = composer();
    const view = renderComposer({ ...base, directionSuggestionState: "loading" });
    expect(within(screen.getByTestId("variation-directions-region")).getByRole("status")).toHaveTextContent("directionsLoading");

    view.rerender(
      <CreativeComposer
        composer={{ ...base, directionSuggestionState: "error" } as CreativeComposerViewModel}
        composerRef={base.composerRef as CreativeComposerModel["composerRef"]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "retryDirections" }));
    expect(base.requestDirectionSuggestions).toHaveBeenCalledOnce();

    view.rerender(
      <CreativeComposer
        composer={{ ...base, pendingDirectionSuggestions: { directions: [], preserveSelection: true } } as unknown as CreativeComposerViewModel}
        composerRef={base.composerRef as CreativeComposerModel["composerRef"]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "keepDirections" }));
    expect(base.keepCurrentDirections).toHaveBeenCalledOnce();
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
    expect(screen.getByTestId("creative-composer-dropzone")).toHaveAttribute("id", "creative-composer-dropzone");
    expect(screen.getByTestId("creative-composer-dropzone")).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });

  it("hides entry chrome when Palco owns the talk box", () => {
    renderComposer(composer({ intent: "single", request: "Pedido" }), { chrome: "stage" });
    expect(screen.queryByTestId("creative-generate-action")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Pedido criativo" })).not.toBeInTheDocument();
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

  it("renders the temporary strip only for asset-backed Single sources and keeps legacy or other protocols on source chips", () => {
    const pieceSource = {
      ...readySource, id: "piece-source", name: "piece.png", assetId: "asset-piece", templateId: null,
      previewUrl: "/api/workspace/assets/piece/file",
      pieceReference: { version: 1, category: "style_reference", classificationSource: "user", confidence: "high", userInstruction: null, hasTransparency: false },
    };
    const legacySource = { ...readySource, id: "legacy-source", name: "legacy.png", assetId: "asset-legacy", templateId: null, previewUrl: "/api/workspace/assets/legacy/file" };
    const value = composer({
      intent: "single", sources: [pieceSource, legacySource],
      updatePieceReference: vi.fn().mockResolvedValue(true), replacePieceReference: vi.fn().mockResolvedValue(true), promotePieceReference: vi.fn().mockResolvedValue(true),
    });
    const { rerender } = renderComposer(value, { workflowVariant: "progressive" });

    const strip = screen.getAllByLabelText("title").find((element) => element.getAttribute("aria-label") === "title")!;
    expect(within(strip).getByText("piece.png")).toBeInTheDocument();
    expect(within(strip).getByRole("button", { name: "add" })).toBeInTheDocument();
    expect(within(strip).getByRole("combobox", { name: "category: piece.png" })).toBeInTheDocument();
    expect(within(strip).queryByText("legacy.png")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "legacy.png" })).toBeInTheDocument();

    rerender(<CreativeComposer composer={composer({ intent: "variations", sources: [pieceSource] }) as CreativeComposerViewModel} composerRef={{ current: null }} />);
    expect(screen.queryAllByLabelText("title").some((element) => element.getAttribute("aria-label") === "title")).toBe(false);
    expect(screen.getByRole("img", { name: "piece.png" })).toBeInTheDocument();
  });

  it("locks every temporary-reference action while prepare or a source mutation is pending", () => {
    const pieceSource = {
      ...readySource, id: "piece-source", name: "piece.png", assetId: "asset-piece", templateId: null,
      pieceReference: { version: 1, category: "style_reference", classificationSource: "user", confidence: "high", userInstruction: null, hasTransparency: false },
    };
    renderComposer(composer({
      intent: "single", sources: [pieceSource], actionPhase: "preparing", sourceMutationPending: true,
      updatePieceReference: vi.fn(), replacePieceReference: vi.fn(), promotePieceReference: vi.fn(),
    }));

    expect(screen.getByRole("button", { name: "replace: piece.png" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "remove: piece.png" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "promote: piece.png" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "category: piece.png" })).toBeDisabled();
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

  it("offers 3:4 in the format select only with the capability (ICE-04B)", () => {
    renderComposer(
      composer({ intent: "single", offeredFormats: ["1:1", "4:5", "9:16", "3:4"] }),
    );
    const options = within(screen.getByRole("combobox", { name: "Formato" }))
      .getAllByRole("option")
      .map((option) => (option as HTMLOptionElement).value);
    expect(options).toContain("3:4");
  });

  it("hides 3:4 from the format select without the capability (ICE-04B)", () => {
    renderComposer(composer({ intent: "variations" }));
    const options = within(screen.getByRole("combobox", { name: "Formato" }))
      .getAllByRole("option")
      .map((option) => (option as HTMLOptionElement).value);
    expect(options).not.toContain("3:4");
  });

  it("shows a stale 3:4 selection as disabled instead of a blank select (ICE-04B)", () => {
    renderComposer(composer({ intent: "variations", format: "3:4", formatMode: "manual" }));
    const select = screen.getByRole("combobox", { name: "Formato" });
    expect(select).toHaveValue("3:4");
    const stale = within(select).getByRole("option", { name: "3:4" });
    expect(stale).toBeDisabled();
  });

  it("offers 3:4 adaptation targets only with the capability (ICE-04B)", () => {
    renderComposer(
      composer({ intent: "format_adaptation", offeredFormats: ["1:1", "4:5", "9:16", "3:4"] }),
    );
    expect(screen.getByRole("checkbox", { name: "3:4" })).toBeInTheDocument();
  });

  it("hides 3:4 adaptation targets without the capability (ICE-04B)", () => {
    renderComposer(composer({ intent: "format_adaptation" }));
    expect(screen.queryByRole("checkbox", { name: "3:4" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "1:1" })).toBeInTheDocument();
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

  it("lets Peça única start from a brand visual recipe", () => {
    const instantiateRecipe = vi.fn();
    const value = composer({
      intent: "single",
      instantiateRecipe,
      visualRecipes: [{
        id: "recipe-1",
        version: 2,
        clientProfileId: "brand-a",
        originWorkId: "work-1",
        originOutputId: "out-1",
        document: {
          version: 1,
          format: "4:5",
          layout: "top",
          dimensions: { width: 1080, height: 1350 },
          fontAssetKey: "font-1",
          logo: { referenceId: "logo", assetKey: "logo.png", category: "logo", box: { left: 0, top: 0, width: 10, height: 10 } },
          fixedAssets: [],
          textBoxes: [],
          fields: { headline: "Turma de setembro", body: "Vagas", cta: "Inscreva-se" },
          originWorkId: "work-1",
          originOutputId: "out-1",
        },
      }],
      quote: { unitCount: 1, credits: 5 },
    });
    renderComposer(value);
    fireEvent.click(screen.getByTestId("creative-optional-settings").querySelector("summary")!);
    fireEvent.click(screen.getByRole("button", { name: "Usar receita" }));
    expect(instantiateRecipe).toHaveBeenCalledWith("recipe-1");
  });

  it("lets Peça única start from a brand commercial offer", () => {
    const instantiateOffer = vi.fn();
    const value = composer({
      intent: "single",
      instantiateOffer,
      commercialOffers: [{
        id: "offer-1",
        version: 2,
        clientProfileId: "brand-a",
        originWorkId: "work-1",
        validFrom: "2026-09-01T00:00:00.000Z",
        validUntil: "2026-10-01T00:00:00.000Z",
        document: {
          version: 1,
          product: "Pós em Psicologia",
          offer: "turma de setembro",
          price: "R$ 497",
          validFrom: "2026-09-01T00:00:00.000Z",
          validUntil: "2026-10-01T00:00:00.000Z",
          originWorkId: "work-1",
          slug: "pos|turma",
        },
      }],
      quote: { unitCount: 1, credits: 5 },
    });
    renderComposer(value);
    fireEvent.click(screen.getByTestId("creative-optional-settings").querySelector("summary")!);
    fireEvent.click(screen.getByRole("button", { name: "Usar oferta" }));
    expect(instantiateOffer).toHaveBeenCalledWith("offer-1");
  });

  it("saves authorized briefing facts as a brand offer with validity", () => {
    const saveCommercialOffer = vi.fn();
    renderComposer(composer({
      intent: "single",
      workId: "work-1",
      saveCommercialOffer,
      inferredBriefing: {
        version: 1,
        message: { value: "Pós em Psicologia", state: "sourced" },
        objective: { value: "Matrícula", state: "sourced" },
        audience: { value: null, state: "unknown" },
        offer: { value: "turma de setembro", state: "sourced" },
        tone: { value: null, state: "unknown" },
        constraints: { value: null, state: "unknown" },
        readiness: "ready",
        confidence: "high",
      },
      briefingFactPack: {
        version: 1,
        request: "Pós em Psicologia — turma de setembro",
        facts: [
          { value: "Pós em Psicologia", class: "product", required: true, origin: "request" },
          { value: "turma de setembro", class: "offer", required: true, origin: "request" },
        ],
        brand: { requiredElements: [], prohibitedElements: [] },
        identity: { clientProfileId: "profile-1", brandName: "Marca A", brandAuthority: "active" },
      },
    }));
    fireEvent.change(screen.getByLabelText("Válida até"), { target: { value: "2026-10-01T12:00" } });
    fireEvent.submit(screen.getByTestId("save-commercial-offer"));
    expect(saveCommercialOffer).toHaveBeenCalledWith(expect.stringMatching(/^2026-10-01T/));
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

  it("explains format settings without attaching redundant help to generation", () => {
    renderComposer(composer({ intent: "format_adaptation", targetFormats: ["1:1"] }));

    expect(screen.getByText(/Cria uma versão para cada formato marcado/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Ajuda sobre formatos de destino" })).not.toBeInTheDocument();
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
    fireEvent.click(screen.getAllByRole("button", { name: "Revisar e aprovar" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Confirmar aprovação" })[0]);
    expect(value.approveOutput).toHaveBeenCalledWith("output-1", true, false);
    expect(screen.getAllByRole("button", { name: "Baixar" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Refinar" })).toHaveLength(1);
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
    const pieceResults = screen.getByTestId("studio-piece-workspace");
    expect(screen.queryByTestId("proposal-review-surface")).not.toBeInTheDocument();
    const pieceReading = screen.getByRole("heading", { name: "Leitura da IA" }).closest("section")!;

    expect(pieceResults.compareDocumentPosition(pieceReading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Gere variações a partir de uma arte" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("creative-output-progress")).not.toBeInTheDocument();
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
    const campaign = screen.getByRole("combobox", { name: "Agrupar em campanha" });
    expect(screen.getByTestId("creative-output-progress").compareDocumentPosition(campaign) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.change(campaign, { target: { value: "campaign-1" } });
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

  it("renders the carousel wizard only for the carousel protocol instead of the proposal grid", () => {
    const output = {
      id: "output-1", workspaceId: "ws-1", workItemId: "work-1", creativeLevel: "conservative",
      targetFormat: "4:5", versionNumber: 1, parentOutputId: null, revisionInstruction: null,
      revisionAssetId: null, retryCount: 0, operationKey: "conservative:4:5:1", status: "completed",
      outputKey: "out/1.png", cost: 5, failureCode: null, quality: null, isSelected: false,
      createdAt: new Date(), updatedAt: new Date(),
    };
    renderComposer(composer({ workId: "work-1", intent: "carousel", outputs: [output] }));

    expect(screen.getByTestId("carousel-composer")).toBeInTheDocument();
    expect(screen.getByLabelText("Pedido do carrossel")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Resultados" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("creative-generate-action")).not.toBeInTheDocument();
  });

  it("keeps the current controls and results grid for the other protocols", () => {
    const output = {
      id: "output-1", workspaceId: "ws-1", workItemId: "work-1", creativeLevel: "conservative",
      targetFormat: "4:5", versionNumber: 1, parentOutputId: null, revisionInstruction: null,
      revisionAssetId: null, retryCount: 0, operationKey: "conservative:4:5:1", status: "completed",
      outputKey: "out/1.png", cost: 5, failureCode: null, quality: null, isSelected: false,
      createdAt: new Date(), updatedAt: new Date(),
    };
    renderComposer(composer({ workId: "work-1", outputs: [output] }));

    expect(screen.queryByTestId("carousel-composer")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Resultados" })).toBeInTheDocument();
    expect(screen.getByTestId("creative-generate-action")).toBeInTheDocument();
  });

  it("coloca configurações na caixa sem duplicar o pedido", () => {
    const model = composer({ intent: "single" });
    function Harness() {
      const [expanded, setExpanded] = useState(true);
      return (
        <TalkBox
          placement="dock"
          request={model.request}
          onRequestChange={model.setRequest}
          intent="single"
          onSelectIntent={model.selectIntent}
          sources={[]}
          onAddFiles={model.addFiles}
          error={null}
          onGenerate={model.preparePlan}
          generateLabel="Gerar"
          expanded={expanded}
          onExpandedChange={setExpanded}
        >
          <CreativeComposer
            composer={model as CreativeComposerViewModel}
            composerRef={model.composerRef}
            chrome="stage"
          />
        </TalkBox>
      );
    }
    render(<Harness />);
    const box = screen.getByTestId("studio-talk-box");
    expect(document.querySelectorAll("#creative-composer-request")).toHaveLength(1);
    expect(box).toContainElement(screen.getByTestId("creative-optional-settings"));
    expect(screen.getAllByRole("button", { name: "Gerar", exact: true })).toHaveLength(1);
  });

  it("coloca o carrossel na caixa com um pedido e Organizar conteúdo", () => {
    const model = composer({ intent: "carousel", request: "Campanha" });
    function Harness() {
      const [expanded, setExpanded] = useState(true);
      return (
        <TalkBox
          placement="dock"
          request={model.request}
          onRequestChange={model.setRequest}
          intent="carousel"
          onSelectIntent={model.selectIntent}
          sources={[]}
          onAddFiles={model.addFiles}
          error={null}
          onGenerate={model.preparePlan}
          generateLabel="Gerar"
          expanded={expanded}
          onExpandedChange={setExpanded}
          showAttachments={false}
          showGenerate={false}
        >
          <CreativeComposer
            composer={model as CreativeComposerViewModel}
            composerRef={model.composerRef}
            chrome="stage"
          />
        </TalkBox>
      );
    }
    render(<Harness />);
    expect(document.querySelectorAll("#creative-composer-request")).toHaveLength(1);
    expect(screen.getByTestId("carousel-organize")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gerar", exact: true })).not.toBeInTheDocument();
  });

  it("envia resultados ao destino externo no palco", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const output = {
      id: "output-1", workspaceId: "ws-1", workItemId: "work-1", creativeLevel: "conservative",
      targetFormat: "4:5", versionNumber: 1, parentOutputId: null, revisionInstruction: null,
      revisionAssetId: null, retryCount: 0, operationKey: "conservative:4:5:1", status: "completed",
      outputKey: "out/1.png", cost: 5, failureCode: null, quality: null, isSelected: false,
      createdAt: new Date(), updatedAt: new Date(),
    };
    renderComposer(composer({ workId: "work-1", outputs: [output] }), {
      chrome: "stage",
      resultsContainer: target,
    });
    expect(target).toContainElement(screen.getByRole("heading", { name: "Resultados" }));
    target.remove();
  });
});
