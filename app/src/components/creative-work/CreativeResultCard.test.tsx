import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const shareMutate = vi.fn();
const toggleFavorite = vi.hoisted(() => vi.fn());
const personFidelityState = vi.hoisted(() => ({
  references: [] as Array<{ personId: string; name: string; primaryPhotoUrl: string | null; photoUrls: string[] }>,
  review: vi.fn(),
  isPending: false,
  isError: false,
}));

vi.mock("@/lib/hooks/use-piece-review-share", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/hooks/use-piece-review-share")>();
  return {
    ...actual,
    useSharePieceReview: () => ({ mutateAsync: shareMutate, isPending: false }),
  };
});

vi.mock("@/lib/hooks/use-piece-favorite", () => ({
  usePieceFavorite: () => ({
    isFavorite: false,
    isPending: false,
    toggle: toggleFavorite,
  }),
}));

vi.mock("@/lib/hooks/use-person-fidelity", () => ({
  useOutputPersonReferences: () => ({ data: personFidelityState.references }),
  useReviewPersonFidelity: () => ({
    review: personFidelityState.review,
    isPending: personFidelityState.isPending,
    isError: personFidelityState.isError,
    reset: vi.fn(),
  }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { count?: number; issue?: string; label?: string; code?: string }) => {
    if (key === "layerizeQuotaRemaining") return `Translate: ${values?.count ?? 0} remaining quota`;
    if (key === "artRefinementRunning") return `Ajustando a composição: ${values?.issue ?? ""}`;
    if (key === "artRefinementBest") return "Melhor versão disponível.";
    if (key === "artRefinementNeedsReview") return `Ainda precisa de revisão: ${values?.issue ?? ""}`;
    if (key === "artRefinementReviewMore") return "Revisar mais uma vez";
    return ({
    failedGeneration: "Falha na geração",
    "status.queued": "Na fila", "status.processing": "Processando", "status.completed": "Pronto", "status.failed": "Falhou", variationShort: `v${values?.count}`, proposalAlt: `Proposta ${values?.label}`, generating: "Gerando...", retry: "Tentar novamente", retryProposal: "Repetir esta proposta", approving: "Aprovando", approved: "Aprovada", approve: "Aprovar", saveAsRecipe: "Salvar como receita visual", shareForReview: "Compartilhar para revisão", sharingForReview: "Criando link", sharedForReview: "Link de revisão copiado", copyReviewLinkAgain: "Copiar link de novo", reviewShareUrlLabel: "Link de revisão", reviewShareCopyFailed: "Não foi possível copiar. Selecione o link abaixo.", download: "Baixar", editImage: "Editar imagem", refine: "Refinar", revisionInstruction: "O que você quer mudar?", optionalAttachment: "Anexo opcional", generateVariation: "Gerar nova variação",
    approvedSavePending: "Peça aprovada; salvamento pendente",
    approvedSaveFailedDetail: `Peça aprovada, mas houve uma falha permanente no salvamento (${values?.code ?? ""})`,
    reviewRecommended: "Revisão recomendada — a checagem automática ficou inconclusiva",
    objectiveFailed: "A checagem objetiva reprovou esta peça.",
    objectiveFailedNext: "Gere uma nova variação antes de aprovar.",
    legacyReviewRequired: "Esta peça não tem veredito objetivo. Revise-a antes de confirmar a aprovação.",
    reviewBeforeApprove: "Revisar e aprovar",
    confirmApproval: "Confirmar aprovação",
    approveHint: "Seleciona esta peça como a versão aprovada do trabalho.",
    downloadHint: "Baixa o arquivo desta versão.",
    shareHint: "Cria um link para alguém revisar esta peça.",
    refineHint: "Gera uma nova versão a partir desta, com o que você pedir.",
    favorite: "Favoritar peça",
    unfavorite: "Remover dos favoritos",
    favoriteHint: "Guarda esta peça nos seus favoritos.",
    unfavoriteHint: "Remove esta peça dos seus favoritos.",
    retryThroughReview: "Revisar nova tentativa",
    refundPending: "Reposição de créditos pendente para esta peça.",
    retryUnavailable: "Esta proposta já usou todas as tentativas automáticas. Crie um novo pedido para gerar uma nova variação.",
    "failure.timeout": "A geração demorou demais e foi interrompida.",
    "failure.invalid_context": "O pedido ou as fontes não tinham informação suficiente para gerar com fidelidade.",
    "failure.factual_violation": "A peça não preservou os fatos ou a marca, mesmo após a correção automática.",
    "failure.brand_conflict": "Há um conflito de marca entre a arte e a marca ativa.",
    "failure.reference_failure": "Uma referência obrigatória não pôde ser usada. Reenvie a arte e tente novamente.",
    "failure.unknown": "A geração falhou por um erro inesperado.",
    layerizeRetry: "Translate: retry separation",
    layerizeQueued: "Translate: queued",
    layerizeProcessing: "Translate: processing",
    layerizeReconciling: "Translate: reconciling",
    layerizeFinalizing: "Translate: preparing PSD",
    layerizeSubmissionUnknown: "Translate: charge may have occurred",
    layerizeCompleted: "Translate: layers ready",
    layerizeFailed: "Translate: separation failed",
    downloadPsdWithLayers: "Translate: PSD with 2 layers",
    layerizeQuotaRemaining: "Translate: remaining quota",
    downloadPngs: "Translate: PNGs",
    "layerizeFailure.unknown": "Translate: unknown failure",
    "layerizeFailure.provider": "Translate: provider failure",
    brandFidelityTitle: "Fidelidade de marca",
    "brandFidelityCheck.copy": "Copy",
    "brandFidelityCheck.font": "Fonte",
    "brandFidelityCheck.exact_assets": "Assets exatos",
    "brandFidelityCheck.composition": "Composição",
    "brandFidelityState.proven": "Comprovado",
    "brandFidelityState.nonconforming": "Não conforme",
    "brandFidelityState.not_applicable": "Não verificável",
    visualSuspicionTitle: "Suspeita visual",
    visualInconclusiveTitle: "Análise visual inconclusiva",
    visualConfidence: "Confiança do modelo: 64%",
    visualNoConfidence: "Sem confiança mensurável",
    personFidelityTitle: "Fidelidade das pessoas",
    "personFidelityStatus.consistent": "Preservada",
    "personFidelityStatus.mismatch": "Divergente",
    "personFidelityStatus.inconclusive": "Inconclusiva",
    personFidelityConfirm: "Confirmo que é a pessoa e a anatomia foi preservada",
    personFidelityReject: "Há divergência",
    personFidelityBlocked: "Divergência confirmada — gere uma nova imagem.",
    personFidelityAccepted: "Você confirmou a identidade desta peça.",
    personFidelityRejected: "Você marcou divergência nesta peça.",
    personFidelityReviewFailed: "Não foi possível registrar a revisão.",
    }[key] ?? key);
  },
}));

import { CreativeResultCard } from "./CreativeResultCard";
import type { CreativeWorkOutput } from "@/lib/hooks/use-creative-work";
import type { PublicLayerizationState } from "@/server/layerize/contracts";

function output(overrides: Partial<CreativeWorkOutput> = {}): CreativeWorkOutput {
  return {
    id: "output-1",
    workspaceId: "ws-1",
    workItemId: "work-1",
    creativeLevel: "balanced",
    targetFormat: "4:5",
    versionNumber: 1,
    parentOutputId: null,
    revisionInstruction: null,
    revisionAssetId: null,
    operationKey: "balanced:4:5:1",
    retryCount: 0,
    imageCallCount: 1,
    status: "completed",
    outputKey: "creative-work/output-1/image.png",
    cost: 5,
    failureCode: null,
    quality: { schemaVersion: 1, objectiveVerdict: "pass" },
    isSelected: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function layerization(status: PublicLayerizationState["status"], failureCode: PublicLayerizationState["failureCode"] = null): PublicLayerizationState {
  return {
    status,
    attemptId: "attempt-1",
    callbackConsumedAt: null,
    requestedByUserId: "owner-1",
    createdAt: "2026-08-12T12:00:00.000Z",
    updatedAt: "2026-08-12T12:00:00.000Z",
    callbackDeadlineAt: "2026-08-12T14:00:00.000Z",
    latencyMs: null,
    providerRequestId: "request-1",
    providerModel: "bytedance/seedream-v5.0-pro/layer-decomposition",
    providerEndpoint: "https://api.atlascloud.ai/api/v1/model/generateImage",
    estimatedCostUsd: 0.09,
    baseWidth: null,
    baseHeight: null,
    layers: status === "completed" ? [
      {
        order: 0,
        isBase: true,
        name: "Base",
        description: "Base layer",
        x: 0,
        y: 0,
        width: 4,
        height: 4,
        normalizedBoundingBox: { x: 0, y: 0, width: 1, height: 1 },
        storageKey: "layers/00.png",
        sourceBytes: 10,
      },
      {
        order: 1,
        isBase: false,
        name: "Headline",
        description: "Headline layer",
        x: 1,
        y: 1,
        width: 2,
        height: 1,
        normalizedBoundingBox: { x: 0.25, y: 0.25, width: 0.5, height: 0.25 },
        storageKey: "layers/01.png",
        sourceBytes: 10,
      },
    ] : [],
    psdKey: status === "completed" ? "creative-work/layerize/attempt-1/piece.psd" : null,
    diagnosticZipKey: status === "completed" ? "creative-work/layerize/attempt-1/piece.zip" : null,
    fidelity: null,
    failureCode,
  };
}

describe("CreativeResultCard", () => {
  beforeEach(() => {
    shareMutate.mockReset();
    toggleFavorite.mockReset();
  });

  it("shows compensation as pending while keeping the QA-fail preview blocked", () => {
    render(
      <CreativeResultCard
        output={output({
          status: "completed",
          failureCode: "objective_quality_failed_refund_pending",
          quality: { schemaVersion: 1, objectiveVerdict: "fail" },
        })}
        label="Equilibrada"
        onRetry={vi.fn()}
        onApprove={vi.fn()}
        onDownload={vi.fn()}
      />,
    );
    expect(screen.getByRole("img")).toBeInTheDocument();
    expect(screen.getByTestId("refund-pending")).toHaveTextContent("Reposição de créditos pendente para esta peça.");
    expect(screen.getByTestId("objective-selection-blocked")).toBeInTheDocument();
  });

  it("keeps terminal refund failures pending and hides retry", () => {
    render(
      <CreativeResultCard
        output={output({
          status: "failed",
          outputKey: null,
          failureCode: "generation_failed_terminal_refund_pending",
          imageCallCount: 1,
        })}
        label="Equilibrada"
        onRetry={vi.fn()}
        onApprove={vi.fn()}
        onDownload={vi.fn()}
      />,
    );

    expect(screen.getByTestId("refund-pending")).toHaveTextContent("Reposição de créditos pendente para esta peça.");
    expect(screen.queryByRole("button", { name: "Repetir esta proposta" })).not.toBeInTheDocument();
    expect(screen.queryByText(/já usou todas as tentativas automáticas/)).not.toBeInTheDocument();
  });

  it("in workspace mode sends a failed revision to the reviewed flow, never a legacy retry", () => {
    const onRetryRevision = vi.fn();
    const onRetryThroughReview = vi.fn();
    const onRetry = vi.fn();
    render(
      <CreativeResultCard
        presentation="workspace"
        hidePreview
        output={output({ id: "failed-rev", parentOutputId: "base", status: "failed", hasOutput: false })}
        label="Versão 2"
        onRetry={onRetry}
        onRetryRevision={onRetryRevision}
        onRetryThroughReview={onRetryThroughReview}
        onApprove={vi.fn()}
        onDownload={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Revisar nova tentativa" }));
    expect(onRetryThroughReview).toHaveBeenCalledTimes(1);
    expect(onRetryThroughReview.mock.calls[0][0]).toMatchObject({ id: "failed-rev", parentOutputId: "base" });
    // Repeated clicks still never dispatch a legacy paid retry.
    fireEvent.click(screen.getByRole("button", { name: "Revisar nova tentativa" }));
    expect(onRetryRevision).not.toHaveBeenCalled();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("keeps the legacy revision retry in card mode", () => {
    const onRetryRevision = vi.fn();
    render(
      <CreativeResultCard
        output={output({ id: "failed-rev", parentOutputId: "base", status: "failed", hasOutput: false })}
        label="Versão 2"
        onRetry={vi.fn()}
        onRetryRevision={onRetryRevision}
        onApprove={vi.fn()}
        onDownload={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(onRetryRevision).toHaveBeenCalledTimes(1);
  });

  it("shows completed imagery and approve, download, and inline edit actions", () => {
    const onRevise = vi.fn();
    render(
      <CreativeResultCard
        output={output()}
        label="Equilibrada"
        onRetry={vi.fn()}
        onApprove={vi.fn()}
        onDownload={vi.fn()}
        onRevise={onRevise}
      />,
    );

    expect(screen.getByRole("img", { name: /equilibrada/i })).toBeVisible();
    expect(screen.getByRole("button", { name: "Aprovar" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Aprovar" })).toHaveAttribute(
      "title",
      "Seleciona esta peça como a versão aprovada do trabalho.",
    );
    expect(screen.getByRole("button", { name: "Baixar" })).toHaveAttribute("title", "Baixa o arquivo desta versão.");
    expect(screen.getByRole("button", { name: "Favoritar peça" })).toHaveAttribute(
      "title",
      "Guarda esta peça nos seus favoritos.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Favoritar peça" }));
    expect(toggleFavorite).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Baixar" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Refinar" }));
    fireEvent.change(screen.getByRole("textbox", { name: "O que você quer mudar?" }), {
      target: { value: "Use mais contraste" },
    });
    const file = new File(["image"], "referencia.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Anexo opcional"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Gerar nova variação" }));
    expect(screen.queryByText(/crédit/i)).not.toBeInTheDocument();

    expect(onRevise).toHaveBeenCalledWith("output-1", "Use mais contraste", file);
  });

  it("shares the completed piece for external review", async () => {
    shareMutate.mockResolvedValue({ shareUrl: "https://app.example.com/share/tok", copied: true });
    render(
      <CreativeResultCard
        output={output()}
        label="Equilibrada"
        onRetry={vi.fn()}
        onApprove={vi.fn()}
        onDownload={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Compartilhar para revisão" }));
    await waitFor(() => {
      expect(shareMutate).toHaveBeenCalledWith({ workId: "work-1", outputId: "output-1" });
    });
    expect(await screen.findByRole("button", { name: "Link de revisão copiado" })).toBeVisible();
    expect(screen.getByTestId("review-share-url")).toHaveValue("https://app.example.com/share/tok");
  });

  it("keeps the review URL selectable when clipboard copy fails", async () => {
    shareMutate.mockResolvedValue({ shareUrl: "https://app.example.com/share/tok", copied: false });
    render(
      <CreativeResultCard
        output={output()}
        label="Equilibrada"
        onRetry={vi.fn()}
        onApprove={vi.fn()}
        onDownload={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Compartilhar para revisão" }));
    expect(await screen.findByText("Não foi possível copiar. Selecione o link abaixo.")).toBeVisible();
    expect(screen.getByTestId("review-share-url")).toHaveValue("https://app.example.com/share/tok");
    expect(screen.getByRole("button", { name: "Copiar link de novo" })).toBeVisible();
    expect(shareMutate).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Copiar link de novo" }));
    expect(shareMutate).toHaveBeenCalledTimes(1);
  });

  it("saves a structured piece as a visual recipe on approve", () => {
    const onApprove = vi.fn();
    render(
      <CreativeResultCard
        output={output({
          quality: {
            schemaVersion: 1,
            objectiveVerdict: "pass",
            exactComposition: {
              composed: [{
                referenceId: "ref-logo",
                assetKey: "logo.png",
                category: "logo",
                box: { left: 48, top: 1180, width: 216, height: 72 },
              }],
            },
            textComposition: {
              execution: "deterministic",
              appliedLayout: "top",
              typographyPlan: { fontAssetKey: "font-1" },
              copy: { headline: "Turma", body: "Vagas", cta: "Inscreva-se" },
              dimensions: { width: 1080, height: 1350 },
              layers: [{ role: "headline", box: { left: 64, top: 80, width: 952, height: 140 } }],
            },
          },
        })}
        label="Equilibrada"
        onRetry={vi.fn()}
        onApprove={onApprove}
        onDownload={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("save-as-recipe"));
    fireEvent.click(screen.getByRole("button", { name: "Aprovar" }));
    expect(onApprove).toHaveBeenCalledWith("output-1", false, true);
  });

  it("keeps approval pending and success states coherent", () => {
    const props = {
      label: "Equilibrada",
      onRetry: vi.fn(),
      onApprove: vi.fn(),
      onDownload: vi.fn(),
    };
    const { rerender } = render(
      <CreativeResultCard output={output()} {...props} isApproving />,
    );

    const pending = screen.getByRole("button", { name: "Aprovando" });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute("aria-busy", "true");
    expect(screen.getByTestId("action-status-icon")).toHaveAttribute("data-action-status", "pending");

    rerender(<CreativeResultCard output={output()} {...props} approvalError />);

    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeEnabled();
    expect(screen.getByTestId("action-status-icon")).toHaveAttribute("data-action-status", "error");

    rerender(<CreativeResultCard output={output({ isSelected: true })} {...props} />);

    expect(screen.getByRole("button", { name: "Aprovada" })).toBeDisabled();
    expect(screen.getByTestId("action-status-icon")).toHaveAttribute("data-action-status", "success");
  });

  it("shows approved-with-save-pending without failing the approval (ICE-03B)", () => {
    const props = { label: "Equilibrada", onRetry: vi.fn(), onApprove: vi.fn(), onDownload: vi.fn() };
    render(
      <CreativeResultCard
        output={output({
          isSelected: true,
          effects: {
            library: { status: "done" },
            valueEvent: { status: "not_requested" },
            recipe: { status: "pending", receiptId: "r1" },
          },
        })}
        {...props}
      />,
    );
    expect(screen.getByTestId("effect-save-pending")).toHaveTextContent(
      "Peça aprovada; salvamento pendente",
    );
    // The approval itself stays successful — pending saves never restyle it.
    expect(screen.getByRole("button", { name: "Aprovada" })).toBeDisabled();
    expect(screen.getByTestId("action-status-icon")).toHaveAttribute("data-action-status", "success");
    expect(screen.queryByTestId("effect-save-failed")).not.toBeInTheDocument();
  });

  it("identifies permanent save failure with its code, approval intact (ICE-03B)", () => {
    const props = { label: "Equilibrada", onRetry: vi.fn(), onApprove: vi.fn(), onDownload: vi.fn() };
    render(
      <CreativeResultCard
        output={output({
          isSelected: true,
          effects: {
            library: { status: "done" },
            valueEvent: { status: "not_requested" },
            recipe: { status: "failed", code: "library_key_owned_elsewhere", retryable: false },
          },
        })}
        {...props}
      />,
    );
    expect(screen.getByTestId("effect-save-failed")).toHaveTextContent(
      "falha permanente no salvamento (library_key_owned_elsewhere)",
    );
    expect(screen.getByRole("button", { name: "Aprovada" })).toBeDisabled();
    expect(screen.getByTestId("action-status-icon")).toHaveAttribute("data-action-status", "success");
  });

  it("shows no save notice when effects settle or are absent", () => {
    const props = { label: "Equilibrada", onRetry: vi.fn(), onApprove: vi.fn(), onDownload: vi.fn() };
    const { rerender } = render(
      <CreativeResultCard
        output={output({
          isSelected: true,
          effects: {
            library: { status: "done" },
            valueEvent: { status: "not_requested" },
            recipe: { status: "done" },
          },
        })}
        {...props}
      />,
    );
    expect(screen.queryByTestId("effect-save-pending")).not.toBeInTheDocument();
    expect(screen.queryByTestId("effect-save-failed")).not.toBeInTheDocument();
    rerender(<CreativeResultCard output={output({ isSelected: true })} {...props} />);
    expect(screen.queryByTestId("effect-save-pending")).not.toBeInTheDocument();
    expect(screen.queryByTestId("effect-save-failed")).not.toBeInTheDocument();
  });

  it("renders an independent status for processing and retries only the failed card", () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <CreativeResultCard
        output={output({ status: "processing", outputKey: null })}
        label="Equilibrada"
        onRetry={onRetry}
        onApprove={vi.fn()}
        onDownload={vi.fn()}
        onRevise={vi.fn()}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Gerando...");
    expect(screen.queryByRole("button", { name: /Repetir/ })).not.toBeInTheDocument();

    rerender(
      <CreativeResultCard
        output={output({ status: "failed", outputKey: null, retryCount: 1 })}
        label="Equilibrada"
        onRetry={onRetry}
        onApprove={vi.fn()}
        onDownload={vi.fn()}
        onRevise={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Repetir esta proposta" }));
    expect(onRetry).toHaveBeenCalledWith("output-1");
  });

  it("routes a failed revision back through an explicit paid revision instead of generic retry", () => {
    const onRetry = vi.fn();
    const onRetryRevision = vi.fn();
    render(
      <CreativeResultCard
        output={output({
          status: "failed",
          outputKey: null,
          parentOutputId: "output-v1",
          revisionInstruction: "Use mais contraste",
          operationKey: "revision:00000000-0000-4000-8000-000000000101",
        })}
        label="Equilibrada"
        onRetry={onRetry}
        onRetryRevision={onRetryRevision}
        onApprove={vi.fn()}
        onDownload={vi.fn()}
        onRevise={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Repetir esta proposta" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(screen.queryByText(/crédit/i)).not.toBeInTheDocument();
    expect(onRetryRevision).toHaveBeenCalledWith(expect.objectContaining({
      id: "output-1",
      parentOutputId: "output-v1",
      revisionInstruction: "Use mais contraste",
    }));
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("explains the typed failure category and offers retry while the durable budget lasts (R-008)", () => {
    render(
      <CreativeResultCard
        output={output({ status: "failed", outputKey: null, failureCode: "generation_timeout", imageCallCount: 1 })}
        label="Equilibrada"
        onRetry={vi.fn()}
        onApprove={vi.fn()}
        onDownload={vi.fn()}
      />,
    );

    // One live region carries both the failure state and the typed category.
    expect(screen.getByRole("status")).toHaveTextContent("Falha na geração");
    expect(screen.getByTestId("failure-category")).toHaveTextContent("A geração demorou demais e foi interrompida");
    expect(screen.getByRole("button", { name: "Repetir esta proposta" })).toBeVisible();
  });

  it("hides the free retry when the durable image-call budget is exhausted (R-006/R-008)", () => {
    render(
      <CreativeResultCard
        output={output({ status: "failed", outputKey: null, failureCode: "image_call_budget_exhausted", imageCallCount: 2 })}
        label="Equilibrada"
        onRetry={vi.fn()}
        onApprove={vi.fn()}
        onDownload={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Repetir esta proposta" })).not.toBeInTheDocument();
    expect(screen.getByText(/já usou todas as tentativas automáticas/)).toBeVisible();
  });

  it("shows inconclusive as available-with-review, never as failure or objective approval (R-008)", () => {
    render(
      <CreativeResultCard
        output={output({
          status: "completed",
          quality: {
            schemaVersion: 1,
            objectiveVerdict: "inconclusive",
            objectiveCodes: [],
            evaluatorSummary: "Avaliador visual indisponível durante a checagem.",
          },
        })}
        label="Equilibrada"
        onRetry={vi.fn()}
        onApprove={vi.fn()}
        onDownload={vi.fn()}
      />,
    );

    expect(screen.getByTestId("review-recommended")).toHaveTextContent("Revisão recomendada");
    expect(screen.getByTestId("review-recommended")).toHaveTextContent("Avaliador visual indisponível");
    // The output stays fully available: image, review-confirmation and download intact.
    expect(screen.getByRole("img")).toBeVisible();
    expect(screen.getByRole("button", { name: "Revisar e aprovar" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Revisar e aprovar" }));
    expect(screen.getByRole("button", { name: "Confirmar aprovação" })).toBeVisible();
    expect(screen.queryByTestId("failure-category")).not.toBeInTheDocument();
  });

  it("shows no review signal for an objectively approved v1 output or a legacy quality payload", () => {
    const { rerender } = render(
      <CreativeResultCard
        output={output({ quality: { schemaVersion: 1, objectiveVerdict: "pass", objectiveCodes: [] } })}
        label="Equilibrada"
        onRetry={vi.fn()}
        onApprove={vi.fn()}
        onDownload={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("review-recommended")).not.toBeInTheDocument();

    rerender(
      <CreativeResultCard
        output={output({ quality: { scoreStatus: "analyzed", qualityScore: 80 } as never })}
        label="Equilibrada"
        onRetry={vi.fn()}
        onApprove={vi.fn()}
        onDownload={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("review-recommended")).not.toBeInTheDocument();
  });

  it("does not offer approval for an objectively rejected output", () => {
    render(
      <CreativeResultCard
        output={output({ quality: { schemaVersion: 1, objectiveVerdict: "fail", objectiveCodes: ["objective_mismatch"] } })}
        label="Equilibrada"
        onRetry={vi.fn()}
        onApprove={vi.fn()}
        onDownload={vi.fn()}
      />,
    );

    expect(screen.getByTestId("objective-selection-blocked")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Aprovar" })).not.toBeInTheDocument();
  });

  it("blocks a legacy invalid output instead of offering human confirmation", () => {
    render(
      <CreativeResultCard
        output={output({ quality: { qualityVerdict: "invalid", hardFailures: [{ code: "wrong_brand" }] } })}
        label="Equilibrada"
        onRetry={vi.fn()}
        onApprove={vi.fn()}
        onDownload={vi.fn()}
      />,
    );

    expect(screen.getByTestId("objective-selection-blocked")).toBeVisible();
    expect(screen.queryByTestId("legacy-selection-review")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /aprovar/i })).not.toBeInTheDocument();
  });

  it("exposes PSD without the diagnostic ZIP once layers are ready", () => {
    const onDownloadLayerized = vi.fn();
    render(
      <CreativeResultCard
        output={output({ isSelected: true, layerization: layerization("completed") })}
        label="Equilibrada"
        onRetry={vi.fn()}
        onApprove={vi.fn()}
        onDownload={vi.fn()}
        canLayerize
        onDownloadLayerized={onDownloadLayerized}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Translate: PSD with 2 layers" }));
    expect(onDownloadLayerized).toHaveBeenCalledWith("output-1", "psd");
    expect(screen.queryByRole("button", { name: "Translate: PNGs" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("layerization-actions")).not.toBeInTheDocument();
  });

  it("opens the editor for selected and unselected completed outputs", () => {
    const onOpenLayerEditor = vi.fn();
    const { rerender } = render(
      <CreativeResultCard
        output={output({ isSelected: true, layerization: layerization("completed") })}
        label="Equilibrada"
        onRetry={vi.fn()}
        onApprove={vi.fn()}
        onDownload={vi.fn()}
        onOpenLayerEditor={onOpenLayerEditor}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Editar imagem" }));
    expect(onOpenLayerEditor).toHaveBeenLastCalledWith("output-1");

    rerender(
      <CreativeResultCard
        output={output({ isSelected: false, layerization: layerization("completed") })}
        label="Equilibrada"
        onRetry={vi.fn()}
        onApprove={vi.fn()}
        onDownload={vi.fn()}
        onOpenLayerEditor={onOpenLayerEditor}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Editar imagem" }));
    expect(onOpenLayerEditor).toHaveBeenCalledTimes(2);
  });

  it("opens the editor on a completed output that still needs layerization", () => {
    const onOpenLayerEditor = vi.fn();
    render(
      <CreativeResultCard
        output={output({ isSelected: false })}
        label="Equilibrada"
        onRetry={vi.fn()}
        onApprove={vi.fn()}
        onDownload={vi.fn()}
        canLayerize
        onOpenLayerEditor={onOpenLayerEditor}
        layerEditorAccess={{ enabled: true, period: null, layerize: { limit: 3, used: 0, remaining: 3 }, regeneration: { limit: 3, used: 0, remaining: 3 } }}
      />,
    );
    expect(screen.getByText("Translate: 3 remaining quota")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Editar imagem" }));
    expect(onOpenLayerEditor).toHaveBeenCalledWith("output-1");
  });
  it("shows deterministic brand facts with their execution evidence", () => {
    render(
      <CreativeResultCard
        output={output({
          quality: {
            schemaVersion: 1,
            objectiveVerdict: "pass",
            brandFidelity: {
              deterministic: {
                deterministic: true,
                overall: "nonconforming",
                checks: [
                  { id: "copy", state: "proven", evidence: [{ path: "quality.textComposition.copyHash" }] },
                  { id: "font", state: "not_applicable", evidence: [{ path: "quality.textComposition.font" }] },
                  { id: "exact_assets", state: "nonconforming", evidence: [{ path: "identitySnapshot.assets[usageMode=exact]" }] },
                ],
              },
              residual: { advisoryOnly: true, status: "clear", signals: [] },
            },
          } as never,
        })}
        label="Equilibrada"
        onRetry={vi.fn()}
        onApprove={vi.fn()}
        onDownload={vi.fn()}
      />,
    );

    expect(screen.getByTestId("brand-fidelity-deterministic")).toHaveTextContent("CopyComprovado");
    expect(screen.getByTestId("brand-fidelity-deterministic")).toHaveTextContent("FonteNão verificável");
    expect(screen.getByTestId("brand-fidelity-deterministic")).toHaveTextContent("Assets exatosNão conforme");
    expect(screen.getByText("quality.textComposition.copyHash")).toBeVisible();
  });

  it("shows visual suspicion as advisory evidence, separate from deterministic findings", () => {
    render(
      <CreativeResultCard
        output={output({
          quality: {
            schemaVersion: 1,
            objectiveVerdict: "pass",
            brandFidelity: {
              residual: {
                advisoryOnly: true,
                status: "suspected",
                signals: [{
                  classification: "suspected",
                  code: "possible_palette_drift",
                  confidence: 0.64,
                  note: "Possível desvio de paleta",
                  evidence: { source: "vision" },
                }],
              },
            },
          } as never,
        })}
        label="Equilibrada"
        onRetry={vi.fn()}
        onApprove={vi.fn()}
        onDownload={vi.fn()}
      />,
    );

    const advisory = screen.getByTestId("brand-fidelity-residual");
    expect(advisory).toHaveTextContent("Suspeita visual");
    expect(advisory).toHaveTextContent("Possível desvio de paleta");
    expect(advisory).toHaveTextContent("Confiança do modelo: 64%");
    expect(advisory).not.toHaveTextContent("Não conforme");
  });

  it("keeps the piece available when the residual visual review is inconclusive", () => {
    render(
      <CreativeResultCard
        output={output({
          quality: {
            schemaVersion: 1,
            objectiveVerdict: "inconclusive",
            brandFidelity: {
              residual: {
                advisoryOnly: true,
                status: "inconclusive",
                signals: [{
                  classification: "inconclusive",
                  code: "visual_evaluator_unavailable",
                  confidence: null,
                  note: "vision QA timeout",
                  evidence: { source: "vision" },
                }],
              },
            },
          } as never,
        })}
        label="Equilibrada"
        onRetry={vi.fn()}
        onApprove={vi.fn()}
        onDownload={vi.fn()}
      />,
    );

    expect(screen.getByTestId("brand-fidelity-residual")).toHaveTextContent("Análise visual inconclusiva");
    expect(screen.getByTestId("brand-fidelity-residual")).toHaveTextContent("Sem confiança mensurável");
    expect(screen.getByRole("img")).toBeVisible();
    expect(screen.getByRole("button", { name: "Revisar e aprovar" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Baixar" })).toBeEnabled();
  });

  it("hides image editing on mobile", () => {
    render(
      <CreativeResultCard
        output={output({ isSelected: true, layerization: layerization("completed") })}
        label="Equilibrada"
        onRetry={vi.fn()}
        onApprove={vi.fn()}
        onDownload={vi.fn()}
        canLayerize
        onOpenLayerEditor={vi.fn()}
        isMobile
      />,
    );
    expect(screen.queryByRole("button", { name: "Editar imagem" })).not.toBeInTheDocument();
  });

  it("disables new image editing when quota is exhausted", () => {
    const access = {
      enabled: true,
      period: null,
      layerize: { limit: 1, used: 1, remaining: 0 },
      regeneration: { limit: 3, used: 0, remaining: 3 },
    };
    render(
      <CreativeResultCard
        output={output({ isSelected: true })}
        label="Equilibrada"
        onRetry={vi.fn()}
        onApprove={vi.fn()}
        onDownload={vi.fn()}
        canLayerize
        onOpenLayerEditor={vi.fn()}
        layerEditorAccess={access}
      />,
    );
    expect(screen.getByRole("button", { name: "Editar imagem" })).toBeDisabled();
    expect(screen.getByText("Translate: 0 remaining quota")).toBeVisible();
  });

  describe("person fidelity (plan 03, T3)", () => {
    const PERSON_ID = "11111111-1111-4111-8111-111111111111";
    const OUTPUT_ID = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
    const HASH = "e".repeat(64);

    beforeEach(() => {
      personFidelityState.references = [{
        personId: PERSON_ID,
        name: "Ana",
        primaryPhotoUrl: "https://cdn.test/ana.png",
        photoUrls: ["https://cdn.test/ana.png"],
      }];
      personFidelityState.review.mockReset();
      personFidelityState.isPending = false;
      personFidelityState.isError = false;
    });

    function fidelityQuality(findings: unknown[], review?: unknown) {
      return {
        schemaVersion: 1,
        objectiveVerdict: "pass",
        personFidelity: {
          findings,
          referenceHash: HASH,
          ...(review === undefined ? {} : { review }),
        },
      };
    }

    function renderCard(quality: unknown) {
      return render(
        <CreativeResultCard
          output={output({ id: OUTPUT_ID, quality: quality as never })}
          label="Equilibrada"
          onRetry={vi.fn()}
          onApprove={vi.fn()}
          onDownload={vi.fn()}
        />,
      );
    }

    it("shows references beside the output with evidence and the specific choice", () => {
      renderCard(fidelityQuality([
        { personId: PERSON_ID, status: "inconclusive", evidence: [], issue: "Rosto ocluído" },
      ]));

      expect(screen.getByTestId("person-fidelity")).toBeVisible();
      expect(screen.getByRole("img", { name: "Ana" })).toHaveAttribute("src", "https://cdn.test/ana.png");
      expect(screen.getByText("Rosto ocluído")).toBeVisible();
      expect(screen.queryByTestId("objective-selection-blocked")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Aprovar" })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Confirmo que é a pessoa e a anatomia foi preservada" }));
      expect(personFidelityState.review).toHaveBeenCalledWith({ referenceHash: HASH, accepted: true });
      fireEvent.click(screen.getByRole("button", { name: "Há divergência" }));
      expect(personFidelityState.review).toHaveBeenCalledWith({ referenceHash: HASH, accepted: false });
    });

    it("blocks mismatch without the specific choice and hides the section when absent", () => {
      const { rerender } = renderCard(fidelityQuality([
        { personId: PERSON_ID, status: "mismatch", evidence: ["rosto trocado"], issue: "troca" },
      ]));

      expect(screen.getByText("Divergência confirmada — gere uma nova imagem.")).toBeVisible();
      expect(screen.getByText("rosto trocado")).toBeVisible();
      expect(screen.queryByRole("button", { name: "Confirmo que é a pessoa e a anatomia foi preservada" })).not.toBeInTheDocument();

      rerender(
        <CreativeResultCard
          output={output({ id: OUTPUT_ID, quality: { schemaVersion: 1, objectiveVerdict: "pass" } as never })}
          label="Equilibrada"
          onRetry={vi.fn()}
          onApprove={vi.fn()}
          onDownload={vi.fn()}
        />,
      );
      expect(screen.queryByTestId("person-fidelity")).not.toBeInTheDocument();
    });
  });

  describe("automatic art refinement (plan 04, T3)", () => {
    const weakQuality = {
      schemaVersion: 1,
      objectiveVerdict: "pass",
      artCritique: {
        verdict: "weak",
        problem: "Foco dividido",
        intervention: "Unificar foco",
        mode: "edit",
        preserve: [],
        evidence: ["Dois títulos dominantes"],
        confidence: "high",
      },
    } as never;

    it("announces progress while a revision runs", () => {
      render(
        <CreativeResultCard
          output={output({ quality: weakQuality })}
          artRefinement={{ status: "running", issues: ["Foco dividido"], recommendedOutputIds: [] }}
          label="Equilibrada"
          onRetry={vi.fn()}
          onApprove={vi.fn()}
          onDownload={vi.fn()}
        />,
      );
      expect(screen.getByTestId("art-refinement-running"))
        .toHaveTextContent("Ajustando a composição: Foco dividido");
      expect(screen.queryByTestId("art-refinement-best")).not.toBeInTheDocument();
    });

    it("presents the best valid version with pending issues and an explicit manual round", () => {
      const onRevise = vi.fn();
      render(
        <CreativeResultCard
          output={output({ quality: weakQuality })}
          artRefinement={{ status: "budget_exhausted", issues: ["Foco dividido"], recommendedOutputIds: ["output-1"] }}
          label="Equilibrada"
          onRetry={vi.fn()}
          onApprove={vi.fn()}
          onDownload={vi.fn()}
          onRevise={onRevise}
        />,
      );
      expect(screen.getByTestId("art-refinement-best")).toHaveTextContent("Melhor versão disponível.");
      expect(screen.getByTestId("art-refinement-best"))
        .toHaveTextContent("Ainda precisa de revisão: Foco dividido");
      // Opening the manual form charges nothing: onRevise fires only on submit.
      fireEvent.click(screen.getByRole("button", { name: "Revisar mais uma vez" }));
      expect(screen.getByLabelText("O que você quer mudar?")).toBeVisible();
      expect(onRevise).not.toHaveBeenCalled();
      // The recommendation never selects: approval keeps its own guard.
      expect(screen.getByRole("button", { name: "Aprovar" })).toBeVisible();
    });

    it("stays silent for non-recommended outputs and legacy works", () => {
      const { rerender } = render(
        <CreativeResultCard
          output={output({ quality: weakQuality })}
          artRefinement={{ status: "ready", issues: [], recommendedOutputIds: ["other-output"] }}
          label="Equilibrada"
          onRetry={vi.fn()}
          onApprove={vi.fn()}
          onDownload={vi.fn()}
        />,
      );
      expect(screen.queryByTestId("art-refinement-best")).not.toBeInTheDocument();
      expect(screen.queryByTestId("art-refinement-running")).not.toBeInTheDocument();

      rerender(
        <CreativeResultCard
          output={output({ quality: weakQuality })}
          label="Equilibrada"
          onRetry={vi.fn()}
          onApprove={vi.fn()}
          onDownload={vi.fn()}
        />,
      );
      expect(screen.queryByTestId("art-refinement-best")).not.toBeInTheDocument();
      expect(screen.queryByTestId("art-refinement-running")).not.toBeInTheDocument();
    });
  });
});
