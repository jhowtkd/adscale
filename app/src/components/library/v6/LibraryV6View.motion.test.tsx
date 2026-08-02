import { render, screen } from "@testing-library/react";
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
  countSummary: "{shown} de {total}",
  deleteAsset: "Excluir asset",
  loadMore: "Carregar mais",
  loadingMore: "Carregando",
};

describe("LibraryV6View motion focus contract", () => {
  it("keeps keyboard focus on the asset action and exposes its visual group", () => {
    render(
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
        totalCount={1}
        searchQuery=""
        useImagePreview={false}
        onDeleteAsset={vi.fn()}
      />,
    );

    const action = screen.getByRole("button", { name: "Excluir asset" });
    action.focus();

    expect(action).toHaveFocus();
    expect(action.closest("article")).toHaveAttribute("data-motion-highlight", "focus");
  });
});
