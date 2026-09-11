import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PublicCarouselSlide } from "@/lib/hooks/use-creative-work";
import {
  carouselLayoutFamilyForRole,
  type CarouselBlockingQuestionV1,
  type CarouselDeckPlanV1,
  type CarouselDraftStateV1,
  type CarouselNarrativeRole,
} from "@/server/creative-work/carousel-contracts";
import type { CarouselVisualContractV1 } from "@/server/creative-work/carousel-contracts";
import type { CarouselEditorialState } from "@/server/creative-work/carousel-editorial-state";
import { CarouselComposer } from "./CarouselComposer";
import type { CarouselComposerController, CarouselComposerPhase } from "./useCarouselComposer";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    if (key === "progressAnnouncement") {
      return `${values?.completed} de ${values?.total} telas prontas; ${values?.failed} com falha.`;
    }
    if (key === "slideLabel") return `Tela ${values?.position}`;
    if (key === "editorTitle") return `Editar a tela ${values?.position}`;
    return ({
      title: "Criar carrossel",
      requestLabel: "Pedido do carrossel",
      requestPlaceholder: "Descreva a sequência que você precisa.",
      addStyleReference: "Adicionar referência de estilo",
      styleReference: "Referência de estilo",
      organizeContent: "Organizar conteúdo",
      questionsTitle: "Responda para organizar a sequência",
      answerSubmit: "Enviar respostas",
      researchingTitle: "Pesquisando o argumento",
      researchingHint: "Consultando fontes e preparando três ganchos. Isso não gera imagem.",
      hooksTitle: "Escolha um gancho",
      hooksHint: "Três caminhos distintos; a escolha não gera imagem.",
      chooseHook: "Escolher gancho",
      regenerateHooks: "Novas opções",
      hookRecommendation: "Recomendação",
      recommendedBadge: "Recomendado",
      hookHeadlineLabel: "Texto de capa",
      hookPromise: "Promessa",
      hookNarrative: "Percurso",
      sequenceTitle: "Mesa de sequência",
      captionLabel: "Legenda",
      sourcesTitle: "Fontes consultadas",
      sourceCheckedOn: `Consultada em ${values?.date ?? ""}`,
      visualLearning: "Aprendizado",
      visualRepresentation: "Direção visual",
      visualHierarchy: "Hierarquia",
      visualTransition: "Transição",
      approveScript: "Aprovar roteiro",
      prepareAction: "Preparar carrossel",
      generateAction: "Gerar carrossel",
      generateCoverAction: "Gerar capa",
      coverBudget: `Orçamento desta etapa: ${values?.count ?? 1} imagem (${values?.credits ?? 50} créditos).`,
      generatingTitle: "Gerando o carrossel",
      coverReviewTitle: "Revise a capa piloto",
      approveCoverAndGenerate: "Aprovar capa e gerar demais slides",
      reviewTitle: "Revise o carrossel",
      visualTitle: "Sistema visual",
      moveUp: "Mover para cima",
      moveDown: "Mover para baixo",
      addSlide: "Adicionar tela",
      removeSlide: "Remover tela",
      status_draft: "Rascunho", status_queued: "Na fila", status_processing: "Gerando",
      status_completed: "Pronta", status_failed: "Falhou",
      primaryTextLabel: "Texto principal",
      secondaryTextLabel: "Texto de apoio",
      purposeLabel: "Propósito",
      roleLabel: "Função narrativa",
      role_hook: "Gancho", role_context: "Contexto", role_problem: "Problema", role_argument: "Argumento",
      role_evidence: "Evidência", role_method: "Método", role_bridge: "Ponte", role_closing: "Fechamento", role_cta: "Chamada",
      visualRefetchAction: "Refazer esta tela",
      visualInstructionLabel: "Instrução para refazer o visual",
      copyOnlyAction: "Alterar somente o texto",
      retryAction: "Tentar novamente esta tela",
      failedNote: "Esta tela falhou. Você pode tentar novamente.",
      suggestionTitle: "Sugestão da IA",
      suggestionBefore: "Antes", suggestionAfter: "Depois", suggestionReason: "Motivo",
      acceptChange: "Aceitar", rejectChange: "Rejeitar", editInstead: "Editar",
      authorityLabel: "Autoria do texto",
      authority_user_input: "Enviada por você", authority_ai_proposal: "Proposta da IA", authority_human_edit: "Editada por você",
      humanEditNote: "Esta tela foi editada por você. Sugestões nunca trocam o seu texto sem aceitação.",
      layoutFamilyLabel: "Composição",
      layout_impact: "Impacto", layout_development: "Desenvolvimento", layout_respite: "Respiro",
      densityLabel: "Densidade",
      density_high: "Alta", density_medium: "Média", density_low: "Baixa",
      findingsTitle: "Ajustes necessários",
      reasonLabel: "Motivo",
    }[key] ?? key);
  },
}));

const WORK_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const NOW = new Date().toISOString();

function planSlide(position: number, role: CarouselNarrativeRole, overrides: Record<string, unknown> = {}) {
  return {
    slideId: `slide-${position}`,
    position,
    role,
    purpose: `Propósito ${position}`,
    primaryText: `Texto ${position}`,
    secondaryText: null,
    authority: "ai_proposal" as const,
    sourceFactIds: [],
    layoutFamily: carouselLayoutFamilyForRole(role),
    ...overrides,
  };
}

function carouselPlan(): CarouselDeckPlanV1 {
  return {
    version: 1,
    revision: "deck-r1",
    workId: WORK_ID,
    objective: "Lançar o produto",
    audience: null,
    tone: null,
    promise: "Promessa clara",
    format: "4:5",
    slides: [
      planSlide(1, "hook"),
      planSlide(2, "context"),
      planSlide(3, "problem"),
      planSlide(4, "argument"),
      planSlide(5, "cta"),
    ],
  };
}

function carouselDraft(overrides: Partial<CarouselDraftStateV1> = {}): CarouselDraftStateV1 {
  return {
    version: 1,
    revision: "draft-r1",
    answers: {},
    blockingQuestions: [],
    plan: carouselPlan(),
    changes: [],
    ...overrides,
  };
}

function publicSlide(position: number, overrides: Partial<PublicCarouselSlide> = {}): PublicCarouselSlide {
  return {
    id: `slide-${position}`,
    lineageId: `lineage-${position}`,
    parentSlideId: null,
    versionNumber: 2,
    deckRevision: "deck-r1",
    position,
    role: position === 1 ? "hook" : position === 5 ? "cta" : "context",
    primaryText: `Texto ${position}`,
    secondaryText: null,
    copyAuthority: "ai_proposal",
    sourceFactIds: [],
    layoutFamily: "development",
    status: "completed",
    hasOutput: true,
    errorCode: null,
    quality: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const blockingQuestions: CarouselBlockingQuestionV1[] = [
  { id: "q-1", field: "offer", question: "Qual é a oferta?", reason: "A copy precisa de uma oferta verificável" },
  { id: "q-2", field: "cta", question: "Qual é a ação final?", reason: "O encerramento precisa de uma ação" },
];

function visualContract(): CarouselVisualContractV1 {
  return {
    version: 1,
    brandSnapshotHash: "hash-1",
    temporaryReferenceId: null,
    palette: ["#101828"],
    typography: { fontAssetKey: "font-1", fallbackFamily: null, authority: "approved" },
    directionInstruction: null,
    layoutFamilies: {
      impact: {
        id: "impact", density: "high",
        primaryRegion: { x: 0, y: 0, width: 100, height: 40, minFontPx: 24, maxFontPx: 64, align: "left" },
        secondaryRegion: null, exactAssetSlots: [], backgroundInstruction: "fundo sólido",
      },
      development: {
        id: "development", density: "medium",
        primaryRegion: { x: 0, y: 0, width: 100, height: 30, minFontPx: 18, maxFontPx: 40, align: "left" },
        secondaryRegion: null, exactAssetSlots: [], backgroundInstruction: "textura leve",
      },
      respite: {
        id: "respite", density: "low",
        primaryRegion: { x: 0, y: 0, width: 100, height: 20, minFontPx: 16, maxFontPx: 32, align: "center" },
        secondaryRegion: null, exactAssetSlots: [], backgroundInstruction: "respiro",
      },
    },
    recurringMotifs: [],
    exactAssetKeys: [],
    prohibitedElements: [],
    safeAreaPx: 48,
    contractHash: "a".repeat(64),
  };
}

function editorialState(overrides: Partial<CarouselEditorialState> = {}): CarouselEditorialState {
  return {
    version: 1,
    revision: "script-1",
    contextHash: "ctx-1",
    research: {
      status: "not_needed",
      question: "O grupo começa em agosto?",
      thesis: "O consultório abre grupo em agosto.",
      sources: [
        {
          id: "src-1",
          url: "https://example.com/estudo",
          sourceId: null,
          title: "Estudo clínico",
          checkedOn: "2026-08-01",
          publicationDate: null,
          evidence: "Turma abre em agosto.",
          limitations: [],
          access: "opened",
        },
      ],
      claims: [],
      gaps: [],
    },
    hooks: [
      { id: "hook-1", headline: "Grupo em agosto", promise: "Vagas limitadas", narrative: "Fato, prova, inscrição" },
      { id: "hook-2", headline: "Comece o cuidado", promise: "Rotina em grupo", narrative: "Dor, método, convite" },
      { id: "hook-3", headline: "Agosto abre vagas", promise: "Turma pequena", narrative: "Novidade, critério, CTA" },
    ],
    recommendedHookId: "hook-1",
    recommendation: "Abre com o fato datado.",
    selectedHookId: null,
    storyboard: [
      { slideId: "slide-1", learning: "O leitor vê a data", representation: "Tipografia com o fato principal", hierarchy: "Título, apoio, marca", transition: "Segue para a prova", claimIds: [] },
      { slideId: "slide-2", learning: "Entende a oferta", representation: "Comparar duas rotinas com o mesmo critério", hierarchy: "Dois blocos", transition: "Fecha o contraste", claimIds: [] },
      { slideId: "slide-3", learning: "Confia no método", representation: "Diagrama simples", hierarchy: "Passos", transition: "Prepara o convite", claimIds: [] },
      { slideId: "slide-4", learning: "Vê a prova", representation: "Detalhe da turma", hierarchy: "Citação", transition: "Leva à ação", claimIds: [] },
      { slideId: "slide-5", learning: "Sabe o próximo passo", representation: "CTA tipográfico", hierarchy: "Ação", transition: "Encerra", claimIds: [] },
    ],
    caption: "Inscreva-se pelo WhatsApp",
    approvedScriptRevision: null,
    approvedCover: null,
    confirmedInteriorsRevision: null,
    ...overrides,
  };
}

function controller(overrides: Partial<CarouselComposerController> = {}): CarouselComposerController {
  return {
    draft: null,
    editorial: null,
    slides: [],
    quality: null,
    selectedSlideId: null,
    selectedSlide: null,
    phase: "entry" as CarouselComposerPhase,
    findings: [],
    editorialError: null,
    coverQuote: { unitCount: 1, credits: 50 },
    canPrepare: false,
    canGenerate: false,
    canApprove: false,
    canApproveScript: false,
    canApproveCover: false,
    isBusy: false,
    askForPlan: vi.fn(),
    answerQuestions: vi.fn(),
    selectHook: vi.fn(),
    regenerateHooks: vi.fn(),
    approveScript: vi.fn(),
    approveCoverAndGenerate: vi.fn(),
    acceptChange: vi.fn(),
    rejectChange: vi.fn(),
    editSlide: vi.fn(),
    addSlide: vi.fn(),
    removeSlide: vi.fn(),
    moveSlide: vi.fn(),
    prepareCarousel: vi.fn(),
    generateCarousel: vi.fn(),
    reviseSlide: vi.fn(),
    retrySlide: vi.fn(),
    approveDeck: vi.fn(),
    downloadSlide: vi.fn(),
    exportDeck: vi.fn(),
    selectSlide: vi.fn(),
    ...overrides,
  } as CarouselComposerController;
}

function renderCarousel(controllerValue: CarouselComposerController, props: Record<string, unknown> = {}) {
  return render(
    <CarouselComposer
      carousel={controllerValue}
      composerRef={{ current: null }}
      request="Lançamento da coleção"
      onRequestChange={vi.fn()}
      onAddStyleFiles={vi.fn()}
      {...props}
    />,
  );
}

describe("CarouselComposer", () => {
  it("keeps free entry with a request, one style reference and Organizar conteúdo", () => {
    const askForPlan = vi.fn();
    const { rerender } = renderCarousel(controller({ phase: "entry" }), { request: "", onAddStyleFiles: vi.fn() });

    expect(screen.getByLabelText("Pedido do carrossel")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Adicionar referência de estilo" })).toBeInTheDocument();
    const organize = screen.getByTestId("carousel-organize");
    expect(organize).toBeDisabled();

    rerender(
      <CarouselComposer
        carousel={controller({ phase: "entry", askForPlan })}
        composerRef={{ current: null }}
        request="Lançamento da coleção"
        onRequestChange={vi.fn()}
        onAddStyleFiles={vi.fn()}
      />,
    );
    const enabled = screen.getByTestId("carousel-organize");
    expect(enabled).toBeEnabled();
    fireEvent.click(enabled);
    expect(askForPlan).toHaveBeenCalledTimes(1);
  });

  it("moves focus to the first blocking question and answers only once", () => {
    const answerQuestions = vi.fn();
    const first = renderCarousel(controller({ phase: "entry" }));
    first.rerender(
      <CarouselComposer
        carousel={controller({ phase: "questions", draft: carouselDraft({ blockingQuestions }), answerQuestions })}
        composerRef={{ current: null }}
        request="Lançamento"
        onRequestChange={vi.fn()}
        onAddStyleFiles={vi.fn()}
      />,
    );

    expect(screen.getByTestId("carousel-questions")).toBeInTheDocument();
    awaitWaitForFocus(screen.getByLabelText("Qual é a oferta?"));

    fireEvent.change(screen.getByLabelText("Qual é a oferta?"), { target: { value: "30% na primeira compra" } });
    fireEvent.change(screen.getByLabelText("Qual é a ação final?"), { target: { value: "Comprar agora" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar respostas" }));

    expect(answerQuestions).toHaveBeenCalledWith({ "q-1": "30% na primeira compra", "q-2": "Comprar agora" });
  });

  it("focuses the sequence heading and renders the board, editor and visual system", () => {
    const prepareCarousel = vi.fn();
    const first = renderCarousel(controller({ phase: "questions" }));
    first.rerender(
      <CarouselComposer
        carousel={controller({
          phase: "sequence",
          draft: carouselDraft(),
          canPrepare: true,
          prepareCarousel,
        })}
        composerRef={{ current: null }}
        request="Lançamento"
        onRequestChange={vi.fn()}
        onAddStyleFiles={vi.fn()}
        visualContract={visualContract()}
      />,
    );

    awaitWaitForFocus(screen.getByRole("heading", { name: "Mesa de sequência" }));
    expect(screen.getByTestId("carousel-board-scroll")).toBeInTheDocument();
    expect(screen.getByTestId("carousel-slide-editor")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sistema visual" })).toBeInTheDocument();
    for (const position of [1, 2, 3, 4, 5]) {
      expect(screen.getByTestId(`carousel-slide-${position}`)).toBeInTheDocument();
    }

    fireEvent.click(screen.getByTestId("carousel-prepare"));
    expect(prepareCarousel).toHaveBeenCalledTimes(1);

    expect(screen.queryByTestId("carousel-generate")).not.toBeInTheDocument();
  });

  it("surfaces objective findings before the deck can be prepared", () => {
    renderCarousel(controller({
      phase: "sequence",
      draft: carouselDraft(),
      findings: [{ path: "slides.0.role", code: "missing_hook", message: "the first slide must be the hook" }],
      canPrepare: false,
    }));

    expect(screen.getByTestId("carousel-findings")).toHaveTextContent("the first slide must be the hook");
    expect(screen.getByTestId("carousel-prepare")).toBeDisabled();
  });

  it("enables Gerar carrossel only after a prepared revision and generates once on click", () => {
    const generateCarousel = vi.fn();
    renderCarousel(controller({
      phase: "ready_to_generate",
      draft: carouselDraft(),
      canGenerate: true,
      generateCarousel,
    }));

    const generate = screen.getByTestId("carousel-generate");
    expect(generate).toBeEnabled();
    fireEvent.click(generate);
    expect(generateCarousel).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(generate, { key: "Enter" });
    expect(generateCarousel).toHaveBeenCalledTimes(1);
  });

  it("does nothing on Enter in the sequence textarea before the prepared revision exists", () => {
    const generateCarousel = vi.fn();
    renderCarousel(controller({ phase: "sequence", draft: carouselDraft(), generateCarousel }));

    fireEvent.keyDown(screen.getByLabelText("Texto principal"), { key: "Enter" });
    expect(generateCarousel).not.toHaveBeenCalled();
    expect(screen.queryByTestId("carousel-generate")).not.toBeInTheDocument();
  });

  it("announces completed and failed counts while generating", () => {
    renderCarousel(controller({
      phase: "generating",
      draft: carouselDraft(),
      slides: [
        publicSlide(1),
        publicSlide(2),
        publicSlide(3),
        publicSlide(4, { status: "failed", hasOutput: false, errorCode: "provider_failed" }),
        publicSlide(5, { status: "processing", hasOutput: false }),
      ],
    }));

    const progress = screen.getByTestId("carousel-progress");
    expect(progress).toHaveAttribute("aria-live", "polite");
    expect(progress).toHaveTextContent("3 de 5 telas prontas; 1 com falha.");
    expect(screen.getByRole("heading", { name: "Gerando o carrossel" })).toBeInTheDocument();
  });

  it("moves focus to the review heading, renders the deck review and keeps the live region", () => {
    const slides = [1, 2, 3, 4, 5].map((position) => publicSlide(position));
    const approveDeck = vi.fn();
    const exportDeck = vi.fn();
    const downloadSlide = vi.fn();
    const selectSlide = vi.fn();
    const retrySlide = vi.fn();
    const first = renderCarousel(controller({ phase: "generating", draft: carouselDraft(), slides }));
    first.rerender(
      <CarouselComposer
        carousel={controller({
          phase: "review",
          draft: carouselDraft(),
          slides,
          quality: { version: 1, objectivePassed: true, advisoryWarnings: [], reviewedAt: NOW, hasContactSheet: true },
          canApprove: true,
          approveDeck,
          exportDeck,
          downloadSlide,
          selectSlide,
          retrySlide,
          selectedSlideId: "slide-1",
          selectedSlide: slides[0]!,
        })}
        composerRef={{ current: null }}
        request="Lançamento"
        onRequestChange={vi.fn()}
        onAddStyleFiles={vi.fn()}
      />,
    );

    awaitWaitForFocus(screen.getByRole("heading", { name: "Revise o carrossel" }));
    expect(screen.getByTestId("carousel-deck-review")).toBeInTheDocument();
    expect(screen.getByTestId("carousel-progress")).toHaveTextContent("5 de 5 telas prontas; 0 com falha.");

    fireEvent.click(screen.getByTestId("carousel-approve"));
    expect(approveDeck).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("carousel-download-1"));
    expect(downloadSlide).toHaveBeenCalledWith("slide-1");
  });

  it("retries a failed slide from the review through the selected slide", async () => {
    const selectSlide = vi.fn();
    const retrySlide = vi.fn();
    const failed = publicSlide(2, { status: "failed", hasOutput: false, errorCode: "provider_failed" });
    renderCarousel(controller({
      phase: "review",
      draft: carouselDraft(),
      slides: [publicSlide(1), failed, ...[3, 4, 5].map((position) => publicSlide(position))],
      selectedSlideId: "slide-2",
      selectedSlide: failed,
      selectSlide,
      retrySlide,
    }));

    fireEvent.click(screen.getByTestId("carousel-review-retry-2"));

    expect(selectSlide).toHaveBeenCalledWith("slide-2");
    await waitFor(() => expect(retrySlide).toHaveBeenCalledTimes(1));
  });

  it("edits the selected planned slide through the draft edit path", () => {
    const editSlide = vi.fn();
    renderCarousel(controller({
      phase: "sequence",
      draft: carouselDraft(),
      canPrepare: true,
      editSlide,
    }));

    fireEvent.change(screen.getByLabelText("Texto principal"), { target: { value: "Texto do gancho revisado" } });
    expect(editSlide).toHaveBeenCalledWith("slide-1", "primaryText", "Texto do gancho revisado");
  });

  it("presents three hooks and selecting one does not confirm image generation", () => {
    const selectHook = vi.fn();
    const confirmGeneration = vi.fn();
    renderCarousel(controller({
      phase: "hooks",
      editorial: editorialState(),
      selectHook,
      generateCarousel: confirmGeneration,
    }));

    expect(screen.getAllByRole("button", { name: /Escolher gancho/ })).toHaveLength(3);
    expect(screen.getByTestId("carousel-hook-recommendation")).toHaveTextContent("Abre com o fato datado.");
    fireEvent.click(screen.getAllByRole("button", { name: /Escolher gancho/ })[0]!);
    expect(selectHook).toHaveBeenCalledWith("hook-1", undefined);
    expect(confirmGeneration).not.toHaveBeenCalled();
  });

  it("reloads the hooks phase from persisted editorial without generating", () => {
    const confirmGeneration = vi.fn();
    renderCarousel(controller({
      phase: "hooks",
      editorial: editorialState(),
      generateCarousel: confirmGeneration,
    }));

    expect(screen.getByTestId("carousel-hook-choices")).toBeInTheDocument();
    expect(confirmGeneration).not.toHaveBeenCalled();
  });

  it("shows copy, visual direction, caption and http sources together on the script", () => {
    renderCarousel(controller({
      phase: "sequence",
      draft: carouselDraft(),
      editorial: editorialState({ selectedHookId: "hook-1" }),
      canApproveScript: true,
    }));

    expect(screen.getByTestId("carousel-slide-1")).toHaveTextContent("Texto 1");
    expect(screen.getByTestId("carousel-slide-1")).toHaveTextContent("Tipografia com o fato principal");
    expect(screen.getByTestId("carousel-slide-direction")).toHaveTextContent("O leitor vê a data");
    expect(screen.getByTestId("carousel-caption")).toHaveTextContent("Inscreva-se pelo WhatsApp");
    fireEvent.click(screen.getByText("Fontes consultadas"));
    const source = screen.getByRole("link", { name: "Estudo clínico" });
    expect(source).toHaveAttribute("href", "https://example.com/estudo");
    expect(screen.getByRole("button", { name: "Aprovar roteiro" })).toBeEnabled();
  });

  it("keeps a human edit in the sequence without generating", () => {
    const editSlide = vi.fn();
    const generateCarousel = vi.fn();
    renderCarousel(controller({
      phase: "sequence",
      draft: carouselDraft(),
      editorial: editorialState({ selectedHookId: "hook-1" }),
      editSlide,
      generateCarousel,
    }));

    fireEvent.change(screen.getByLabelText("Texto principal"), { target: { value: "WIP do gancho" } });
    expect(editSlide).toHaveBeenCalledWith("slide-1", "primaryText", "WIP do gancho");
    expect(generateCarousel).not.toHaveBeenCalled();
  });

  it("surfaces a recoverable editorial failure without confirming generation", () => {
    const confirmGeneration = vi.fn();
    renderCarousel(controller({
      phase: "hooks",
      editorial: editorialState(),
      editorialError: "A evidência não basta para sustentar a tese. Restrinja o argumento ou envie fontes.",
      generateCarousel: confirmGeneration,
    }));

    const alert = screen.getByTestId("carousel-editorial-error");
    expect(alert).toHaveAttribute("role", "alert");
    expect(alert).toHaveTextContent("A evidência não basta");
    expect(confirmGeneration).not.toHaveBeenCalled();
  });

  it("shows the completed cover button and does not generate on mount", () => {
    const confirmGeneration = vi.fn();
    const approveCoverAndGenerate = vi.fn();
    renderCarousel(controller({
      phase: "cover_review",
      draft: carouselDraft(),
      editorial: editorialState({
        selectedHookId: "hook-1",
        approvedScriptRevision: "script-1",
      }),
      slides: [
        publicSlide(1),
        publicSlide(2, { status: "draft", hasOutput: false }),
        publicSlide(3, { status: "draft", hasOutput: false }),
        publicSlide(4, { status: "draft", hasOutput: false }),
        publicSlide(5, { status: "draft", hasOutput: false }),
      ],
      canApproveCover: true,
      generateCarousel: confirmGeneration,
      approveCoverAndGenerate,
    }));

    const coverButton = screen.getByRole("button", { name: "Aprovar capa e gerar demais slides" });
    expect(coverButton).toBeEnabled();
    expect(confirmGeneration).not.toHaveBeenCalled();
    expect(approveCoverAndGenerate).not.toHaveBeenCalled();
    fireEvent.click(coverButton);
    expect(approveCoverAndGenerate).toHaveBeenCalledTimes(1);
    expect(confirmGeneration).not.toHaveBeenCalled();
  });

  it("reloads a completed cover without generating remaining slides", () => {
    const confirmGeneration = vi.fn();
    renderCarousel(controller({
      phase: "cover_review",
      draft: carouselDraft(),
      slides: [publicSlide(1), ...[2, 3, 4, 5].map((position) => publicSlide(position, { status: "draft", hasOutput: false }))],
      canApproveCover: true,
      generateCarousel: confirmGeneration,
    }));

    expect(screen.getByRole("button", { name: "Aprovar capa e gerar demais slides" })).toBeInTheDocument();
    expect(confirmGeneration).not.toHaveBeenCalled();
  });
});

function awaitWaitForFocus(target: HTMLElement) {
  return waitFor(() => expect(target).toHaveFocus());
}
