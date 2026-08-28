import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PieceReferenceStrip } from "./PieceReferenceStrip";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { count?: number }) => key === "count" ? `${values?.count} de 3 anexos` : key,
}));

const source = {
  id: "source-1", workspaceId: "ws", workItemId: "work", assetId: "asset", templateId: null,
  name: "produto.png", previewUrl: "https://example.test/produto.png", origin: "upload" as const,
  usage: "both" as const, usageConfirmed: true, status: "ready" as const,
  contentAnalysis: null, styleAnalysis: null, failureCode: null, createdAt: new Date(), updatedAt: new Date(),
  pieceReference: { version: 1 as const, category: "product_or_packaging" as const, classificationSource: "automatic" as const, confidence: "high" as const, userInstruction: null, hasTransparency: false },
};

describe("PieceReferenceStrip", () => {
  it("keeps the add action visible but disabled at three references", () => {
    render(<PieceReferenceStrip sources={[source, { ...source, id: "source-2" }, { ...source, id: "source-3" }]} assetSourceCount={3} disabled={false} uploading={false} onAdd={vi.fn()} onUpdate={vi.fn().mockResolvedValue(true)} onReplace={vi.fn().mockResolvedValue(true)} onRetry={vi.fn().mockResolvedValue(undefined)} onRemove={vi.fn().mockResolvedValue(true)} onPromote={vi.fn().mockResolvedValue(true)} />);
    expect(screen.getByRole("button", { name: "limit" })).toBeDisabled();
    expect(screen.getByText("3 de 3 anexos")).toBeInTheDocument();
  });

  it("uses the server-counted asset total and source-specific accessible names", () => {
    render(<PieceReferenceStrip sources={[source]} assetSourceCount={3} disabled={false} uploading={false} onAdd={vi.fn()} onUpdate={vi.fn().mockResolvedValue(true)} onReplace={vi.fn().mockResolvedValue(true)} onRetry={vi.fn().mockResolvedValue(undefined)} onRemove={vi.fn().mockResolvedValue(true)} onPromote={vi.fn().mockResolvedValue(true)} />);
    expect(screen.getByText("3 de 3 anexos")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "category: produto.png" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "instruction: produto.png" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "replace: produto.png" })).toBeInTheDocument();
    const fileInputs = document.querySelectorAll('input[type="file"]');
    expect(fileInputs).toHaveLength(2);
    fileInputs.forEach((input) => {
      expect(input).toHaveAttribute("hidden");
      expect(input).toHaveAttribute("tabindex", "-1");
    });
  });

  it("sends only the field that changed so instruction blur cannot confirm category", () => {
    const onUpdate = vi.fn().mockResolvedValue(true);
    render(<PieceReferenceStrip sources={[source]} assetSourceCount={1} disabled={false} uploading={false} onAdd={vi.fn()} onUpdate={onUpdate} onReplace={vi.fn().mockResolvedValue(true)} onRetry={vi.fn().mockResolvedValue(undefined)} onRemove={vi.fn().mockResolvedValue(true)} onPromote={vi.fn().mockResolvedValue(true)} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "style_reference" } });
    const instruction = screen.getByRole("textbox", { name: "instruction: produto.png" });
    fireEvent.change(instruction, { target: { value: "Use só a textura" } });
    fireEvent.blur(instruction);
    expect(onUpdate).toHaveBeenNthCalledWith(1, "source-1", { category: "style_reference" });
    expect(onUpdate).toHaveBeenNthCalledWith(2, "source-1", { userInstruction: "Use só a textura" });
  });

  it("does not call an unclassified or incompatible reference ready", () => {
    render(<PieceReferenceStrip sources={[{ ...source, pieceReference: { ...source.pieceReference, category: null, confidence: "low" } }]} assetSourceCount={1} disabled={false} uploading={false} onAdd={vi.fn()} onUpdate={vi.fn().mockResolvedValue(true)} onReplace={vi.fn().mockResolvedValue(true)} onRetry={vi.fn().mockResolvedValue(undefined)} onRemove={vi.fn().mockResolvedValue(true)} onPromote={vi.fn().mockResolvedValue(true)} />);
    expect(screen.getByText("choiceRequired")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "promote: produto.png" })).toBeDisabled();
  });

  it("announces exact incompatibility and sends instruction, replacement, and local promotion actions", async () => {
    const onUpdate = vi.fn().mockResolvedValue(true);
    const onReplace = vi.fn().mockResolvedValue(true);
    const onPromote = vi.fn().mockResolvedValue(true);
    const file = new File(["image"], "replacement.png", { type: "image/png" });
    render(<PieceReferenceStrip sources={[{ ...source, pieceReference: { ...source.pieceReference, category: "additional_logo_or_seal", hasTransparency: false, userInstruction: "" } }]} assetSourceCount={1} disabled={false} uploading={false} onAdd={vi.fn()} onUpdate={onUpdate} onReplace={onReplace} onRetry={vi.fn().mockResolvedValue(undefined)} onRemove={vi.fn().mockResolvedValue(true)} onPromote={onPromote} />);
    expect(screen.getByText("exactIncompatible")).toBeInTheDocument();
    fireEvent.blur(screen.getByRole("textbox"), { target: { value: "No rodapé" } });
    expect(onUpdate).toHaveBeenCalledWith("source-1", { userInstruction: "No rodapé" });
    fireEvent.change(
      screen.getAllByLabelText("replace: produto.png").find((element) => element instanceof HTMLInputElement)!,
      { target: { files: [file] } },
    );
    expect(onReplace).toHaveBeenCalledWith("source-1", file);
    fireEvent.click(screen.getByRole("button", { name: "promote: produto.png" }));
    expect(await screen.findByText("promoted")).toBeInTheDocument();
    fireEvent.change(
      screen.getAllByLabelText("replace: produto.png").find((element) => element instanceof HTMLInputElement)!,
      { target: { files: [file] } },
    );
    await waitFor(() => expect(screen.queryByText("promoted")).not.toBeInTheDocument());
  });
});
