import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    useForStyle: "Usar para mudar estilo", "origin.approved_work": "Trabalho aprovado",
    previewAria: `Pré-visualizar inspiração ${values?.title}`, previewAlt: `Pré-visualização de ${values?.title}`,
  }[key] ?? key),
}));

import { BrandInspirations } from "./BrandInspirations";

describe("BrandInspirations integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useInspirationsMock.mockReturnValue({ data: [{
      id: "output-1", source: "approved_work", title: "Matrículas", previewUrl: "/asset.png",
      templateId: null, assetId: "asset-1", suggestedIntent: "variations",
    }], isLoading: false, isError: false, refetch: vi.fn() });
  });

  it("keeps a curated item inert until the separate restyle CTA is chosen", async () => {
    const attach = vi.fn().mockResolvedValue(undefined);
    const before = window.location.href;
    render(<BrandInspirations clientProfileId="brand-1" onAttach={attach} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Pré-visualizar inspiração Matrículas" })[0]!);
    expect(attach).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Usar para mudar estilo" })[0]!);
    await waitFor(() => expect(attach).toHaveBeenCalledWith(expect.objectContaining({ assetId: "asset-1", suggestedIntent: "restyle" })));
    expect(window.location.href).toBe(before);
  });
});
