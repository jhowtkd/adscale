import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => ({
    failedGeneration: "Falha na geração",
    reviewRecommended: "Revisão recomendada — a checagem automática ficou inconclusiva",
    objectiveFailed: "A checagem objetiva reprovou esta peça.",
    objectiveFailedNext: "Gere uma nova variação antes de aprovar.",
    legacyReviewRequired: "Esta peça não tem veredito objetivo. Revise-a antes de confirmar a aprovação.",
    reviewBeforeApprove: "Revisar e aprovar",
    confirmApproval: "Confirmar aprovação",
    retryUnavailable: "Esta proposta já usou todas as tentativas automáticas. Crie um novo pedido para gerar uma nova variação.",
    "failure.timeout": "A geração demorou demais e foi interrompida.",
    "failure.invalid_context": "O pedido ou as fontes não tinham informação suficiente para gerar com fidelidade.",
    "failure.factual_violation": "A peça não preservou os fatos ou a marca, mesmo após a correção automática.",
    "failure.brand_conflict": "Há um conflito de marca entre a arte e a marca ativa.",
    "failure.reference_failure": "Uma referência obrigatória não pôde ser usada. Reenvie a arte e tente novamente.",
    "failure.unknown": "A geração falhou por um erro inesperado.",
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
  }[key] ?? key),
}));

import { CreativeResultCard } from "./CreativeResultCard";
import type { CreativeWorkOutput } from "@/lib/hooks/use-creative-work";

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

describe("CreativeResultCard", () => {
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
    expect(screen.getByRole("button", { name: "Baixar" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.change(screen.getByRole("textbox", { name: "O que você quer mudar?" }), {
      target: { value: "Use mais contraste" },
    });
    const file = new File(["image"], "referencia.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Anexo opcional"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Gerar nova versão" }));
    expect(screen.queryByText(/crédit/i)).not.toBeInTheDocument();

    expect(onRevise).toHaveBeenCalledWith("output-1", "Use mais contraste", file);
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

});
