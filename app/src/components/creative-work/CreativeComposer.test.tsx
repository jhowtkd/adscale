import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/components/layout/ActiveBrandSwitcher", () => ({
  default: ({ id }: { id?: string }) => <select id={id ?? "active-brand-switcher"} aria-label="Marca ativa"><option>Escolha</option></select>,
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string, values?: Record<string, number>) => ({
  requestLabel: "Pedido criativo", placeholder: "Descreva", addArt: "Adicionar arte", dropHint: "Solte aqui",
  optionalSettings: "Ajustes opcionais", format: "Formato", targetFormats: "Formatos de destino",
  brand: "Marca", noBrand: "Selecione uma marca", inspirationsSlot: "Inspirações",
  selectBrandMessage: "Selecione uma marca para começar", invalidWork: "Trabalho não encontrado", startNew: "Começar nova criação",
}[key] ?? (key === "generate" ? `Gerar ${values?.count} variações · ${values?.credits} créditos` : key)) }));

import { CreativeComposer } from "./CreativeComposer";
import type { CreativeComposerModel, CreativeComposerViewModel } from "./useCreativeComposer";

function composer(overrides = {}) {
  return {
    composerRef: { current: null }, request: "", setRequest: vi.fn(), intent: "variations", selectIntent: vi.fn(),
    format: "4:5", setFormat: vi.fn(), targetFormats: [], toggleTargetFormat: vi.fn(), state: "empty",
    workId: null, brandName: "Marca A", sources: [], outputs: [], quote: { unitCount: 3, credits: 15 },
    campaignId: null, campaigns: [], linkCampaign: vi.fn(), retryOutput: vi.fn(), approveOutput: vi.fn(),
    downloadOutput: vi.fn(), reviseOutput: vi.fn(), isRetryingOutput: vi.fn(), isApprovingOutput: vi.fn(), isRevisingOutput: vi.fn(),
    canGenerate: true, isUploading: false, error: null, announcement: "", requiresBrandSelection: false,
    workError: false,
    addFiles: vi.fn(), updateSource: vi.fn(), retrySource: vi.fn(), removeSource: vi.fn(), generate: vi.fn(),
    ...overrides,
  };
}

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
  it("keeps Enter as a newline and never generates from the textarea", () => {
    const value = composer();
    renderComposer(value);
    const textarea = screen.getByRole("textbox", { name: /pedido criativo/i });

    fireEvent.change(textarea, { target: { value: "Linha 1\nLinha 2" } });
    fireEvent.keyDown(textarea, { key: "Enter", code: "Enter" });

    expect(value.setRequest).toHaveBeenCalledWith("Linha 1\nLinha 2");
    expect(value.generate).not.toHaveBeenCalled();
  });

  it("shows the canonical paid CTA and sends dropped files to the same composer", () => {
    const value = composer();
    renderComposer(value);
    const file = new File(["image"], "arte.png", { type: "image/png" });

    expect(screen.getByRole("button", { name: "Gerar 3 variações · 15 créditos" })).toBeInTheDocument();
    fireEvent.drop(screen.getByTestId("creative-composer-dropzone"), { dataTransfer: { files: [file] } });
    expect(value.addFiles).toHaveBeenCalledWith([file]);
  });

  it("renders CreativeSourceChip and dispatches its actions", () => {
    const source = {
      id: "source-1", name: "arte.png", origin: "upload", usage: "content", status: "failed",
      contentAnalysis: null, styleAnalysis: null,
    };
    const value = composer({ sources: [source] });
    renderComposer(value);

    fireEvent.click(screen.getByRole("button", { name: "Estilo" }));
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(value.updateSource).toHaveBeenCalledWith("source-1", "style");
    expect(value.retrySource).toHaveBeenCalledWith("source-1");
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
