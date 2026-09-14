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
  filterFavorite: "Favoritos",
  countSummary: "{shown} de {total}",
  deleteAsset: "Excluir asset",
  previewLoading: "Carregando preview",
  previewNoPreview: "Preview indisponível",
  previewError: "Erro no preview",
  previewDark: "Imagem escura real",
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
    expect(action.closest("article")?.className).toContain("focus-within:shadow-[0_0_0_2px_var(--focus-ring)]");
    expect(action.className).toContain("size-6");
    expect(screen.getByTestId("library-bento").className).toContain("columns-2");
    expect(screen.getByTestId("library-asset-rover").className).toContain("opacity-0");
    expect(screen.getByTestId("library-asset-rover").className).toContain("group-hover:opacity-100");
    expect(screen.getByRole("button", { name: "Enviar" }).className).toContain("h-9");
    expect(screen.getByRole("button", { name: "Enviar" }).className).toContain("rounded-full");
    expect(screen.queryByRole("button", { name: "Enviar arquivo" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Carregar mais" }).className).toContain("text-[var(--text-muted)]");
    expect(container.querySelector('input[type="search"]')?.previousElementSibling?.getAttribute("class")).toContain("text-[var(--utility-icon)]");
    const strip = screen.getByTestId("library-filter-strip");
    expect(strip.className).toContain("rounded-full");
    expect(screen.getByRole("radiogroup", { name: "Filtrar" }).className).toContain("flex-nowrap");
    expect(screen.getByRole("radiogroup", { name: "Filtrar" }).className).toContain("justify-center");
    expect(screen.getByText("1/2")).toBeVisible();
  });

  it("selects an origin filter from the occupancy strip", () => {
    const onFilterChange = vi.fn();
    render(
      <LibraryV6View
        labels={labels}
        assets={[]}
        shownCount={0}
        totalCount={2}
        searchQuery=""
        onFilterChange={onFilterChange}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "Gerado" }));
    expect(onFilterChange).toHaveBeenCalledWith("generated");
    fireEvent.click(screen.getByRole("radio", { name: "Favoritos" }));
    expect(onFilterChange).toHaveBeenCalledWith("favorite");
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

  it("labels a genuinely dark image after its preview loads", async () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
      getImageData: () => ({ data: new Uint8ClampedArray([8, 8, 8, 255]) }),
    } as unknown as CanvasRenderingContext2D);

    try {
      const { container } = render(
        <LibraryV6View
          labels={labels}
          assets={[{
            id: "asset-dark",
            name: "Fundo noturno",
            tags: [],
            sizeLabel: "1 MB",
            dimensionsLabel: "1080×1080",
            aspectRatioLabel: "1:1",
            source: "upload",
            createdAtLabel: "10/08/2026",
            kind: "reference",
            imageUrl: "/dark.png",
            glyph: "FN",
            gradient: "bg-black",
          }]}
          shownCount={1}
          totalCount={1}
          searchQuery=""
        />,
      );

      const image = container.querySelector("img")!;
      Object.defineProperty(image, "naturalWidth", { configurable: true, value: 1080 });
      Object.defineProperty(image, "naturalHeight", { configurable: true, value: 1080 });
      fireEvent.load(image);
      await waitFor(() => expect(screen.getByRole("status", { name: "Imagem escura real" })).toBeInTheDocument());
      expect(screen.getByRole("img", { name: "Fundo noturno — Imagem escura real" })).toBeInTheDocument();
      expect(container.querySelector('[data-preview-state="dark"]')).toBeInTheDocument();
    } finally {
      getContext.mockRestore();
    }
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

  it("keeps a Palco upload chip and occupancy instead of a dropzone card", () => {
    const onUploadClick = vi.fn();
    const onDropzoneClick = vi.fn();
    render(
      <LibraryV6View
        labels={labels}
        assets={[]}
        shownCount={0}
        totalCount={0}
        searchQuery=""
        onUploadClick={onUploadClick}
        onDropzoneClick={onDropzoneClick}
      />,
    );

    const chip = screen.getByRole("button", { name: "Enviar" });
    expect(chip.className).toContain("h-9");
    fireEvent.click(chip);
    expect(onUploadClick).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Enviar arquivo" }));
    expect(onDropzoneClick).toHaveBeenCalledOnce();
    expect(screen.getByText("Solte aqui").closest("[class*='border-dashed']")).toBeNull();
  });
});
