import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => ({
  sourceOrigin_upload: "Upload", sourceOrigin_template: "Template", sourceOrigin_approved_work: "Trabalho aprovado",
  removeSource: "Remover", removeSourceAria: "Remover fonte", sourceUsageAria: "Usar arte como",
  sourceUsage_content: "Conteúdo", sourceUsage_style: "Estilo", sourceUsage_both: "Ambos",
  sourceUsageRequired: "Escolha como esta arte será usada.", sourceStatus_uploaded: "Aguardando análise", continueSourceAnalysis: "Continuar análise",
  sourceStatus_analyzing: "Analisando arte", sourceStatus_ready: "Análise concluída", sourceStatus_failed: "Falha na análise",
  extractedData: "Dados extraídos", retrySource: "Tentar novamente", previewUnavailable: "Imagem indisponível",
}[key] ?? key) }));

import { CreativeSourceChip } from "./CreativeSourceChip";

const baseSource = {
  id: "source-1", name: "arte.png", origin: "upload" as const, usage: "content" as const,
  usageConfirmed: true,
  status: "ready" as const, contentAnalysis: { product: "Tênis", offer: "20%" }, styleAnalysis: null,
};

describe("CreativeSourceChip", () => {
  it("keeps the file while changing usage and exposes polite status", () => {
    const onUsageChange = vi.fn();
    render(<CreativeSourceChip source={baseSource} onUsageChange={onUsageChange} onRetry={vi.fn()} onRemove={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Estilo" }));
    expect(onUsageChange).toHaveBeenCalledWith("style");
    expect(screen.getByText("arte.png")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("Tênis")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Usar arte como" })).toBeInTheDocument();
  });

  it("shows retry only for an analysis failure", () => {
    const onRetry = vi.fn();
    const onRemove = vi.fn();
    render(<CreativeSourceChip source={{ ...baseSource, status: "failed" }} onUsageChange={vi.fn()} onRetry={onRetry} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    fireEvent.click(screen.getByRole("button", { name: "Remover fonte" }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("offers to continue analysis for an uploaded source", () => {
    const onRetry = vi.fn();
    render(<CreativeSourceChip source={{ ...baseSource, status: "uploaded" }} onUsageChange={vi.fn()} onRetry={onRetry} onRemove={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Continuar análise" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("does not offer review for ready analysis", () => {
    render(<CreativeSourceChip source={baseSource} onUsageChange={vi.fn()} onRetry={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Revisar dados" })).not.toBeInTheDocument();
  });

  it("does not preselect a usage before the user makes the required choice", () => {
    render(<CreativeSourceChip source={{ ...baseSource, usage: "both", usageConfirmed: false }} onUsageChange={vi.fn()} onRetry={vi.fn()} onRemove={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Conteúdo" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Estilo" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Ambos" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Escolha como esta arte será usada.")).toBeInTheDocument();
  });

  it("renders the authenticated preview thumbnail when the DTO provides one", () => {
    render(<CreativeSourceChip source={{ ...baseSource, previewUrl: "/api/workspace/assets/a1/file" }} onUsageChange={vi.fn()} onRetry={vi.fn()} onRemove={vi.fn()} />);

    expect(screen.getByRole("img", { name: "arte.png" })).toHaveAttribute("src", "/api/workspace/assets/a1/file");
  });

  it("omits the thumbnail while no preview is available", () => {
    render(<CreativeSourceChip source={baseSource} onUsageChange={vi.fn()} onRetry={vi.fn()} onRemove={vi.fn()} />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByText("Imagem indisponível")).not.toBeInTheDocument();
  });

  it("shows an explicit fallback when the preview fails to load, keeping name and actions", () => {
    const onRetry = vi.fn();
    render(<CreativeSourceChip source={{ ...baseSource, status: "failed", previewUrl: "/api/workspace/assets/a1/file" }} onUsageChange={vi.fn()} onRetry={onRetry} onRemove={vi.fn()} />);

    fireEvent.error(screen.getByRole("img", { name: "arte.png" }));

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("Imagem indisponível")).toBeInTheDocument();
    expect(screen.getByText("arte.png")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Usar arte como" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remover fonte" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
