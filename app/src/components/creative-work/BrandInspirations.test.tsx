import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useInspirationsMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/hooks/use-creative-inspirations", () => ({
  useCreativeInspirations: (...args: unknown[]) => useInspirationsMock(...args),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { title?: string }) => ({
    add: "Adicionar referência", title: "Referências da marca",
    stripEyebrow: "Referências em destaque", stripTitle: "Comece por uma inspiração",
    libraryEyebrow: "Biblioteca da marca", libraryTitle: "Inspirações",
    filtersAria: "Filtros de origem", filterAll: "Todas", filterApproved: "Aprovadas",
    filterTemplates: "Templates", filterCurated: "Seleção ADScale",
    loading: "Carregando inspirações", loadFailed: "Não foi possível carregar as inspirações.",
    retry: "Tentar novamente", empty: "Nenhuma inspiração disponível ainda.",
    attachFailed: "Não foi possível adicionar a referência. Tente novamente.",
    useForStyle: "Usar para mudar estilo",
    "origin.curated": "Seleção ADScale", "origin.approved_work": "Trabalho aprovado", "origin.template": "Template",
    previewAria: `Pré-visualizar inspiração ${values?.title}`, previewAlt: `Pré-visualização de ${values?.title}`,
  }[key] ?? key),
}));

import { BrandInspirations } from "./BrandInspirations";

const inspiration = {
  id: "curated-1", source: "curated" as const, title: "Editorial", previewUrl: "/preview.png",
  templateId: null, assetId: null, curatedInspirationId: "curated-1", suggestedIntent: "variations" as const,
};

const approved = {
  id: "approved-1", source: "approved_work" as const, title: "Matrículas", previewUrl: "/asset.png",
  templateId: null, assetId: "asset-1", curatedInspirationId: null, suggestedIntent: "variations" as const,
};

describe("BrandInspirations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useInspirationsMock.mockReturnValue({ data: [inspiration], isLoading: false, isError: false, refetch: vi.fn() });
  });

  it("shows curated references on the page in the cinematic strip and mosaic", () => {
    render(<BrandInspirations clientProfileId="brand-1" onAttach={vi.fn()} />);
    expect(useInspirationsMock).toHaveBeenCalledWith("brand-1");
    expect(screen.queryByRole("button", { name: "Adicionar referência" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Comece por uma inspiração" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Inspirações" })).toBeInTheDocument();
    expect(within(screen.getByTestId("brand-inspirations-strip")).getByText("Editorial")).toBeInTheDocument();
    expect(within(screen.getByTestId("brand-inspirations-mosaic")).getByText("Editorial")).toBeInTheDocument();
    expect(screen.getAllByText("Seleção ADScale").length).toBeGreaterThan(0);
  });

  it("opens a preview without changing the objective or attaching a source", () => {
    const onAttach = vi.fn();
    render(<BrandInspirations clientProfileId="brand-1" onAttach={onAttach} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Pré-visualizar inspiração Editorial" })[0]!);
    expect(screen.getByRole("dialog")).toHaveTextContent("Editorial");
    expect(onAttach).not.toHaveBeenCalled();
  });

  it("attaches once as an explicit restyle reference and focuses the original-art slot", async () => {
    const onAttach = vi.fn().mockResolvedValue(true);
    render(<><BrandInspirations clientProfileId="brand-1" onAttach={onAttach} /><div id="creative-composer-original-source" tabIndex={-1} /></>);
    fireEvent.click(screen.getAllByRole("button", { name: "Usar para mudar estilo" })[0]!);
    await waitFor(() => expect(onAttach).toHaveBeenCalledWith({ ...inspiration, suggestedIntent: "restyle" }));
    await waitFor(() => expect(document.activeElement).toHaveAttribute("id", "creative-composer-original-source"));
  });

  it("keeps the gallery visible when attaching is cancelled or fails", async () => {
    const onAttach = vi.fn().mockResolvedValue(false);
    render(<BrandInspirations clientProfileId="brand-1" onAttach={onAttach} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Usar para mudar estilo" })[0]!);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível adicionar"));
    expect(screen.getByRole("heading", { name: "Inspirações" })).toBeVisible();
    expect(within(screen.getByTestId("brand-inspirations-mosaic")).getByText("Editorial")).toBeVisible();
  });

  it("shows loading, retry, and empty feedback on the page", () => {
    const refetch = vi.fn();
    useInspirationsMock.mockReturnValue({ data: [], isLoading: false, isError: true, refetch });
    render(<BrandInspirations clientProfileId={null} onAttach={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar as inspirações.");
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("filters the mosaic by origin without hiding the featured strip", () => {
    useInspirationsMock.mockReturnValue({
      data: [inspiration, approved],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<BrandInspirations clientProfileId="brand-1" onAttach={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Aprovadas" }));
    expect(screen.getByRole("button", { name: "Aprovadas" })).toHaveAttribute("aria-pressed", "true");
    expect(within(screen.getByTestId("brand-inspirations-strip")).getByText("Editorial")).toBeInTheDocument();
    expect(within(screen.getByTestId("brand-inspirations-mosaic")).getByText("Matrículas")).toBeInTheDocument();
    expect(within(screen.getByTestId("brand-inspirations-mosaic")).queryByText("Editorial")).not.toBeInTheDocument();
  });
});
