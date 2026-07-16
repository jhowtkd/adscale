import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useComposer = vi.hoisted(() => vi.fn());
vi.mock("./useCreativeComposer", () => ({ useCreativeComposer: (...args: unknown[]) => useComposer(...args) }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string, values?: Record<string, number>) => ({
  requestLabel: "Pedido criativo", placeholder: "Descreva", addArt: "Adicionar arte", dropHint: "Solte aqui",
  optionalSettings: "Ajustes opcionais", format: "Formato", targetFormats: "Formatos de destino",
  brand: "Marca", noBrand: "Selecione uma marca", inspirationsSlot: "Inspirações",
}[key] ?? (key === "generate" ? `Gerar ${values?.count} variações · ${values?.credits} créditos` : key)) }));

import { CreativeComposer } from "./CreativeComposer";

function composer(overrides = {}) {
  return {
    composerRef: { current: null }, request: "", setRequest: vi.fn(), intent: "variations", selectIntent: vi.fn(),
    format: "4:5", setFormat: vi.fn(), targetFormats: [], toggleTargetFormat: vi.fn(), state: "empty",
    workId: null, brandName: "Marca A", sources: [], outputs: [], quote: { unitCount: 3, credits: 15 },
    canGenerate: true, isUploading: false, error: null, announcement: "", requiresBrandSelection: false,
    addFiles: vi.fn(), updateSource: vi.fn(), retrySource: vi.fn(), removeSource: vi.fn(), generate: vi.fn(),
    ...overrides,
  };
}

describe("CreativeComposer", () => {
  beforeEach(() => useComposer.mockReturnValue(composer()));

  it("keeps Enter as a newline and never generates from the textarea", () => {
    const value = composer();
    useComposer.mockReturnValue(value);
    render(<CreativeComposer />);
    const textarea = screen.getByRole("textbox", { name: /pedido criativo/i });

    fireEvent.change(textarea, { target: { value: "Linha 1\nLinha 2" } });
    fireEvent.keyDown(textarea, { key: "Enter", code: "Enter" });

    expect(value.setRequest).toHaveBeenCalledWith("Linha 1\nLinha 2");
    expect(value.generate).not.toHaveBeenCalled();
  });

  it("shows the canonical paid CTA and sends dropped files to the same composer", () => {
    const value = composer();
    useComposer.mockReturnValue(value);
    render(<CreativeComposer />);
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
    useComposer.mockReturnValue(value);
    render(<CreativeComposer />);

    fireEvent.click(screen.getByRole("button", { name: "Estilo" }));
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(value.updateSource).toHaveBeenCalledWith("source-1", "style");
    expect(value.retrySource).toHaveBeenCalledWith("source-1");
  });
});
