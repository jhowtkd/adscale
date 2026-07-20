import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    ({
      originalArt: "Arte original",
      styleReference: "Referência de estilo",
      addOriginalArt: "Adicionar arte original",
      addStyleArt: "Adicionar referência de estilo",
      removeOriginalArt: "Remover arte original",
      removeStyleArt: "Remover referência de estilo",
      previewUnavailable: "Imagem indisponível",
      sourceUploading: "Enviando imagem",
      sourceReady: "Imagem pronta",
      sourceStatus_uploaded: "Upload concluído; aguardando análise",
      sourceStatus_analyzing: "Analisando arte",
      sourceStatus_failed: "Falha na análise",
      retrySource: "Tentar novamente",
    })[key] ?? key,
}));

import { CreativeSourcePreviewCard } from "./CreativeSourcePreviewCard";

const readySource = {
  id: "source-1",
  workspaceId: "workspace-1",
  workItemId: "work-1",
  assetId: "asset-1",
  templateId: null,
  name: "arquivo-interno-123.png",
  previewUrl: "/api/workspace/assets/asset-1/file",
  origin: "upload" as const,
  usage: "content" as const,
  usageConfirmed: true,
  status: "ready" as const,
  failureCode: null,
  createdAt: "2026-07-20T12:00:00.000Z",
  updatedAt: "2026-07-20T12:00:00.000Z",
  contentAnalysis: null,
  styleAnalysis: null,
};

describe("CreativeSourcePreviewCard", () => {
  it("renders only the image and semantic label, never the filename", () => {
    render(
      <CreativeSourcePreviewCard
        label="Arte original"
        source={readySource}
        isUploading={false}
        onChoose={vi.fn()}
        onDrop={vi.fn()}
        onRetry={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByRole("img", { name: "Arte original" })).toHaveAttribute(
      "src",
      "/api/workspace/assets/asset-1/file",
    );
    expect(screen.getByText("Arte original")).toBeInTheDocument();
    expect(screen.queryByText("arquivo-interno-123.png")).not.toBeInTheDocument();
  });

  it("renders an empty upload card", () => {
    const onChoose = vi.fn();

    render(
      <CreativeSourcePreviewCard
        label="Referência de estilo"
        source={null}
        isUploading={false}
        onChoose={onChoose}
        onDrop={vi.fn()}
        onRetry={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", {
      name: "Adicionar referência de estilo",
    }));

    expect(onChoose).toHaveBeenCalledOnce();
  });

  it("keeps the preview and offers retry after analysis failure", () => {
    const onRetry = vi.fn();

    render(
      <CreativeSourcePreviewCard
        label="Referência de estilo"
        source={{ ...readySource, status: "failed" }}
        isUploading={false}
        onChoose={vi.fn()}
        onDrop={vi.fn()}
        onRetry={onRetry}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByRole("img", {
      name: "Referência de estilo",
    })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", {
      name: "Tentar novamente",
    }));

    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("shows uploading and analyzing status politely", () => {
    const { rerender } = render(
      <CreativeSourcePreviewCard
        label="Arte original"
        source={null}
        isUploading
        onChoose={vi.fn()}
        onDrop={vi.fn()}
        onRetry={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Enviando imagem");
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");

    rerender(
      <CreativeSourcePreviewCard
        label="Arte original"
        source={{ ...readySource, status: "analyzing" }}
        isUploading={false}
        onChoose={vi.fn()}
        onDrop={vi.fn()}
        onRetry={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Analisando arte");
  });

  it("shows uploaded status while waiting for analysis", () => {
    render(
      <CreativeSourcePreviewCard
        label="Arte original"
        source={{ ...readySource, status: "uploaded" }}
        isUploading={false}
        onChoose={vi.fn()}
        onDrop={vi.fn()}
        onRetry={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Upload concluído; aguardando análise",
    );
  });

  it("falls back when the preview image fails to load", () => {
    render(
      <CreativeSourcePreviewCard
        label="Arte original"
        source={readySource}
        isUploading={false}
        onChoose={vi.fn()}
        onDrop={vi.fn()}
        onRetry={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    fireEvent.error(screen.getByRole("img", { name: "Arte original" }));

    expect(screen.queryByRole("img", { name: "Arte original" })).not.toBeInTheDocument();
    expect(screen.getByText("Imagem indisponível")).toBeInTheDocument();
  });

  it("removes the current source", () => {
    const onRemove = vi.fn();

    render(
      <CreativeSourcePreviewCard
        label="Arte original"
        source={readySource}
        isUploading={false}
        onChoose={vi.fn()}
        onDrop={vi.fn()}
        onRetry={vi.fn()}
        onRemove={onRemove}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remover arte original" }));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("forwards drops to the card handler", () => {
    const onDrop = vi.fn();
    const file = new File(["image"], "arte.png", { type: "image/png" });

    render(
      <CreativeSourcePreviewCard
        label="Arte original"
        source={null}
        isUploading={false}
        onChoose={vi.fn()}
        onDrop={onDrop}
        onRetry={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    fireEvent.drop(screen.getByRole("article"), {
      dataTransfer: { files: [file] },
    });

    expect(onDrop).toHaveBeenCalledWith([file]);
  });
});
