import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import LibraryV6View from "./LibraryV6View";
import type { LibraryV6Labels } from "./library-v6-types";
import type { ClientProfile } from "@/lib/hooks/use-client-profiles";
import type { BrandDocumentJson } from "@/lib/equipe/api";

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

const profile = {
  id: "profile-1",
  workspaceId: "workspace-1",
  name: "Acme",
  description: null,
  visualNotes: null,
  toneNotes: null,
  constraints: null,
  brandColors: ["#112233"],
  brandFonts: ["Inter"],
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  updatedAt: new Date("2026-08-01T00:00:00.000Z"),
} as ClientProfile;

describe("LibraryV6View visual role contract (ticket 07 / B1)", () => {
  it("keeps an empty documents filter readable without prompting for an image upload", () => {
    render(<LibraryV6View labels={labels} profile={profile} assets={[]} documents={[]} shownCount={0} totalCount={0} searchQuery="" activeFilter="documents" />);
    expect(screen.getByRole("heading", { name: "Documentos" })).toBeInTheDocument();
    expect(screen.getByText("Ainda não definido")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: labels.dropzoneAria })).not.toBeInTheDocument();
  });

  it("keeps keyboard focus and delete affordance semantics on an asset card", () => {
    const { container } = render(
      <LibraryV6View
        labels={labels}
        assets={[{
          id: "asset-1",
          name: "Produto",
          tags: ["produto"],
          sizeLabel: "1 MB",
          dimensionsLabel: "1080×1080",
          aspectRatioLabel: "1:1",
          source: "brand_upload",
          createdAtLabel: "10/08/2026",
          kind: "reference",
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
    expect(screen.getByTestId("library-bento").className).toContain("grid-cols-2");
    expect(screen.getByTestId("library-asset-rover").className).toContain("opacity-0");
    expect(screen.getByTestId("library-asset-rover").className).toContain("group-hover:opacity-100");
    // B1: the header action is "Adicionar" (brandLabels-driven), no separate dropzone-trigger chip.
    expect(screen.getByRole("button", { name: "Adicionar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Carregar mais" }).className).toContain("text-[var(--text-muted)]");
    expect(container.querySelector('input[type="search"]')?.previousElementSibling?.getAttribute("class")).toContain("text-[var(--utility-icon)]");
    expect(screen.getByRole("radiogroup", { name: "Filtrar" })).toBeInTheDocument();
  });

  it("selects a type filter and an origin filter independently", () => {
    const onFilterChange = vi.fn();
    const onOriginChange = vi.fn();
    render(
      <LibraryV6View
        labels={labels}
        assets={[]}
        shownCount={0}
        totalCount={2}
        searchQuery=""
        onFilterChange={onFilterChange}
        onOriginChange={onOriginChange}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "Imagens" }));
    expect(onFilterChange).toHaveBeenCalledWith("images");
    fireEvent.click(screen.getByRole("radio", { name: "Favoritos" }));
    expect(onFilterChange).toHaveBeenCalledWith("favorite");

    const originGroup = screen.getByRole("radiogroup", { name: "Origem" });
    fireEvent.click(within(originGroup).getByRole("radio", { name: "Do site" }));
    expect(onOriginChange).toHaveBeenCalledWith("brand_site");
  });

  it("keeps non-current logos reachable in the gallery: only the current logo moves to the identity card", () => {
    const base = { tags: [], sizeLabel: "1 MB", dimensionsLabel: "—", aspectRatioLabel: "—", source: "brand_upload", createdAtLabel: "10/08/2026", imageUrl: "", gradient: "bg-[var(--surface-inset)]" };
    render(
      <LibraryV6View
        labels={labels}
        profile={{ ...profile, logoAssetKey: "brand/current.png" } as ClientProfile}
        assets={[
          { ...base, id: "current", name: "Logo atual", glyph: "LA", kind: "logo", key: "brand/current.png" },
          { ...base, id: "old", name: "Logo antigo", glyph: "LN", kind: "logo", key: "brand/old.png" },
          { ...base, id: "photo", name: "Foto", glyph: "FO", kind: "photo", key: "brand/photo.png" },
        ]}
        shownCount={3}
        totalCount={3}
        searchQuery=""
        useImagePreview={false}
        onDeleteAsset={vi.fn()}
      />,
    );

    const gallery = within(screen.getByTestId("library-bento"));
    // A replaced logo keeps its row: it must stay viewable and deletable, while the current one lives in the identity card.
    expect(gallery.getByText("Logo antigo")).toBeInTheDocument();
    expect(gallery.getByText("Foto")).toBeInTheDocument();
    expect(gallery.queryByText("Logo atual")).not.toBeInTheDocument();
  });

  it("hides the origin filter under Favoritos: favorites are pieces and have no origin", () => {
    render(
      <LibraryV6View
        labels={labels}
        assets={[]}
        shownCount={0}
        totalCount={0}
        searchQuery=""
        activeFilter="favorite"
        onOriginChange={vi.fn()}
      />,
    );

    expect(screen.queryByRole("radiogroup", { name: "Origem" })).not.toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Filtrar" })).toBeInTheDocument();
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

  it("uploads via the header chip when a brand is active, and via the empty-state dropzone otherwise", () => {
    const onUploadClick = vi.fn();
    const onDropzoneClick = vi.fn();
    render(
      <LibraryV6View
        labels={labels}
        profile={profile}
        assets={[]}
        shownCount={0}
        totalCount={0}
        searchQuery=""
        onUploadClick={onUploadClick}
        onDropzoneClick={onDropzoneClick}
      />,
    );

    const chip = screen.getByRole("button", { name: "Adicionar" });
    expect(chip).not.toBeDisabled();
    fireEvent.click(chip);
    expect(onUploadClick).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Enviar arquivo" }));
    expect(onDropzoneClick).toHaveBeenCalledOnce();
  });

  it("disables the upload chip until a brand is selected", () => {
    render(
      <LibraryV6View
        labels={labels}
        assets={[]}
        shownCount={0}
        totalCount={0}
        searchQuery=""
      />,
    );

    expect(screen.getByRole("button", { name: "Adicionar" })).toBeDisabled();
  });

  it("ticket 07: opens the brand document in a readable dialog, never as raw JSON", () => {
    const document: BrandDocumentJson = {
      id: "doc-1",
      clientProfileId: "profile-1",
      kind: "diagnosis",
      version: 1,
      content: {
        title: "Diagnóstico da marca",
        summary: "Resumo legível do diagnóstico.",
        strengths: ["Identidade visual consistente", "Boa presença no Instagram"],
      },
      createdByRole: "assistant",
      createdAt: "2026-09-01T12:00:00.000Z",
    };

    render(
      <LibraryV6View
        labels={labels}
        profile={profile}
        documents={[document]}
        assets={[]}
        shownCount={0}
        totalCount={0}
        searchQuery=""
        activeFilter="documents"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Abrir/ }));

    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getAllByText("Diagnóstico da marca").length).toBeGreaterThan(0);
    expect(dialog.getByText("Resumo legível do diagnóstico.")).toBeInTheDocument();
    expect(dialog.getByText("Identidade visual consistente")).toBeInTheDocument();
    // Never the raw JSON blob — the object is rendered field by field.
    expect(dialog.queryByText(/^\{"title"/)).not.toBeInTheDocument();
    expect(dialog.queryByText(/"summary":/)).not.toBeInTheDocument();
  });
});
