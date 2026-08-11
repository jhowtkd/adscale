import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import LibraryV6View from "./LibraryV6View";
import type { LibraryV6Labels } from "./library-v6-types";

const labels: LibraryV6Labels = {
  sectionLabel: "Biblioteca",
  title: "Assets",
  subtitle: "Referências",
  upload: "Enviar",
  dropzoneTitle: "Solte aqui",
  dropzoneHint: "PNG ou JPG",
  dropzoneAria: "Enviar arquivo",
  searchPlaceholder: "Buscar",
  searchAria: "Buscar",
  filtersAria: "Filtrar",
  filterAll: "Todos",
  filterReference: "Referência",
  filterLogo: "Logo",
  filterPhoto: "Fotografia",
  filterGenerated: "Gerado",
  countSummary: "{shown} de {total}",
  deleteAsset: "Excluir asset",
  previewLoading: "Carregando preview",
  previewNoPreview: "Preview indisponível",
  previewError: "Erro no preview",
  retryPreview: "Tentar novamente",
  replaceAsset: "Substituir asset",
  originLabel: "Origem",
  createdLabel: "Data",
  functionLabel: "Função",
  loadMore: "Carregar mais",
  loadingMore: "Carregando",
};

describe("LibraryV6View visual role contract", () => {
  it("keeps keyboard focus and assigns semantic roles to Library controls", () => {
    const { container } = render(
      <LibraryV6View
        labels={labels}
        assets={[{
          id: "asset-1",
          name: "Produto",
          tags: ["produto"],
          sizeLabel: "1 MB",
          dimensionsLabel: "1080×1080",
          imageUrl: "",
          glyph: "PR",
          gradient: "bg-[var(--surface-inset)]",
        }]}
        shownCount={1}
        totalCount={2}
        searchQuery=""
        useImagePreview={false}
        onDeleteAsset={vi.fn()}
        onLoadMore={vi.fn()}
      />,
    );

    const action = screen.getByRole("button", { name: "Excluir asset" });
    action.focus();

    expect(action).toHaveFocus();
    expect(action.closest("article")).toHaveAttribute("data-motion-highlight", "focus");
    expect(action.closest("article")?.className).toContain("border-[var(--selection-border)]");
    expect(action.className).toContain("bg-[var(--danger-bg)]");
    expect(screen.getByRole("button", { name: "Enviar" }).className).toContain("bg-[var(--action-primary-bg)]");
    expect(screen.getByRole("button", { name: "Carregar mais" }).className).toContain("bg-[var(--active-navigation-bg)]");
    expect(container.querySelector('input[type="search"]')?.previousElementSibling?.getAttribute("class")).toContain("text-[var(--utility-icon)]");
  });

  it("keeps loading, ready, error, retry, and no-preview states distinct", async () => {
    const onReplace = vi.fn();
    const { container } = render(
      <LibraryV6View
        labels={labels}
        assets={[{
          id: "asset-preview",
          name: "Preview",
          tags: [],
          sizeLabel: "1 MB",
          dimensionsLabel: "1080×1080",
          aspectRatioLabel: "1:1",
          source: "upload",
          createdAtLabel: "10/08/2026",
          kind: "reference",
          imageUrl: "/preview.png",
          glyph: "PR",
          gradient: "bg-[var(--surface-inset)]",
        }]}
        shownCount={1}
        totalCount={1}
        searchQuery=""
        onReplaceAsset={onReplace}
      />,
    );

    expect(screen.getByRole("status", { name: "Carregando preview" })).toBeInTheDocument();
    const image = container.querySelector("img");
    expect(image).toBeTruthy();
    fireEvent.load(image!);
    await waitFor(() => expect(container.querySelector('[data-preview-state="ready"]')).toBeInTheDocument());
    fireEvent.error(image!);
    await waitFor(() => expect(screen.getByRole("img", { name: "Erro no preview" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Substituir asset" }));
    expect(onReplace).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await waitFor(() => expect(screen.getByRole("status", { name: "Carregando preview" })).toBeInTheDocument());
  });

  it("names assets without a preview accessibly", () => {
    render(
      <LibraryV6View
        labels={labels}
        assets={[{
          id: "asset-no-preview",
          name: "Sem preview",
          tags: [],
          sizeLabel: "1 MB",
          dimensionsLabel: "—",
          aspectRatioLabel: "—",
          source: "upload",
          createdAtLabel: "10/08/2026",
          kind: "reference",
          imageUrl: "",
          glyph: "SP",
          gradient: "bg-[var(--surface-inset)]",
        }]}
        shownCount={1}
        totalCount={1}
        searchQuery=""
      />,
    );

    expect(screen.getByRole("img", { name: "Preview indisponível" })).toBeInTheDocument();
  });
});
