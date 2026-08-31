import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useInspirationsMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/hooks/use-creative-inspirations", () => ({
  useCreativeInspirations: (...args: unknown[]) => useInspirationsMock(...args),
}));

import { BrandInspirations } from "./BrandInspirations";

const inspiration = {
  id: "curated-1", source: "curated" as const, title: "Editorial", previewUrl: "/preview.png",
  templateId: null, assetId: null, curatedInspirationId: "curated-1", suggestedIntent: "variations" as const,
};

describe("BrandInspirations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useInspirationsMock.mockReturnValue({ data: [inspiration], isLoading: false, isError: false, refetch: vi.fn() });
  });

  it("keeps curated references out of the page until the trigger opens the Sheet", () => {
    render(<BrandInspirations clientProfileId="brand-1" onAttach={vi.fn()} />);
    expect(useInspirationsMock).toHaveBeenCalledWith("brand-1");
    expect(screen.getByRole("button", { name: "Adicionar referência" })).toBeInTheDocument();
    expect(screen.queryByText("Editorial")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Adicionar referência" }));
    expect(screen.getByText("Editorial")).toBeInTheDocument();
    expect(screen.getByText("Seleção ADScale")).toBeInTheDocument();
  });

  it("opens a preview without changing the objective or attaching a source", () => {
    const onAttach = vi.fn();
    render(<BrandInspirations clientProfileId="brand-1" onAttach={onAttach} />);
    fireEvent.click(screen.getByRole("button", { name: "Adicionar referência" }));
    fireEvent.click(screen.getByRole("button", { name: "Pré-visualizar inspiração Editorial" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Editorial");
    expect(onAttach).not.toHaveBeenCalled();
  });

  it("attaches once as an explicit restyle reference and focuses the original-art slot", async () => {
    const onAttach = vi.fn().mockResolvedValue(true);
    render(<><BrandInspirations clientProfileId="brand-1" onAttach={onAttach} /><div id="creative-composer-original-source" tabIndex={-1} /></>);
    fireEvent.click(screen.getByRole("button", { name: "Adicionar referência" }));
    fireEvent.click(screen.getByRole("button", { name: "Usar para mudar estilo" }));
    await waitFor(() => expect(onAttach).toHaveBeenCalledWith({ ...inspiration, suggestedIntent: "restyle" }));
    await waitFor(() => expect(document.activeElement).toHaveAttribute("id", "creative-composer-original-source"));
  });

  it("keeps the Sheet open when attaching is cancelled or fails", async () => {
    const onAttach = vi.fn().mockResolvedValue(false);
    render(<BrandInspirations clientProfileId="brand-1" onAttach={onAttach} />);
    fireEvent.click(screen.getByRole("button", { name: "Adicionar referência" }));
    fireEvent.click(screen.getByRole("button", { name: "Usar para mudar estilo" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível adicionar"));
    expect(screen.getByText("Editorial")).toBeVisible();
  });

  it("keeps loading, retry, and empty feedback inside the Sheet", () => {
    const refetch = vi.fn();
    useInspirationsMock.mockReturnValue({ data: [], isLoading: false, isError: true, refetch });
    render(<BrandInspirations clientProfileId={null} onAttach={vi.fn()} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Adicionar referência" }));
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});
