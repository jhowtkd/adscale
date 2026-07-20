import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useInspirationsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/hooks/use-creative-inspirations", () => ({
  useCreativeInspirations: (...args: unknown[]) => useInspirationsMock(...args),
}));

import { BrandInspirations, shuffleInspirations } from "./BrandInspirations";

const template = {
  id: "template-1", source: "template" as const, title: "Lançamento",
  previewUrl: null, templateId: "template-1", assetId: null, suggestedIntent: "variations" as const,
};
const approved = {
  id: "output-1", source: "approved_work" as const, title: "Matrículas",
  previewUrl: "/api/workspace/assets/asset-1/file", templateId: null,
  assetId: "asset-1", suggestedIntent: "restyle" as const,
};
const curated = {
  id: "curated-1", source: "curated" as const, title: "Editorial",
  previewUrl: "/api/creative-work/inspirations/curated-1/file", templateId: null,
  assetId: null, curatedInspirationId: "curated-1", suggestedIntent: "restyle" as const,
};

describe("BrandInspirations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useInspirationsMock.mockReturnValue({ data: [template, approved, curated], isLoading: false, isError: false });
  });

  it("shuffles inspirations once instead of preserving the API order", () => {
    const randomValues = [0, 0];
    const random = vi.fn(() => randomValues.shift() ?? 0);

    expect(shuffleInspirations([template, approved, curated], random)).toEqual([
      approved,
      curated,
      template,
    ]);
    expect(random).toHaveBeenCalledTimes(2);
  });

  it("lists the active brand inspirations and attaches a template without navigating", () => {
    const onAttach = vi.fn();
    const before = window.location.href;
    const { container } = render(<BrandInspirations clientProfileId="brand-1" onAttach={onAttach} />);

    expect(useInspirationsMock).toHaveBeenCalledWith("brand-1");
    expect(screen.getByTestId("brand-inspirations-grid")).toHaveClass("lg:columns-3");
    expect(screen.getByTestId("brand-inspirations-grid")).toHaveClass("2xl:columns-3");
    expect(screen.queryByText("Lançamento")).not.toBeInTheDocument();
    expect(screen.queryByText("Template")).not.toBeInTheDocument();
    expect(screen.queryByText("Trabalho aprovado")).not.toBeInTheDocument();
    expect(screen.queryByText("Seleção ADScale")).not.toBeInTheDocument();
    expect(container.querySelector('img[src="/api/workspace/assets/asset-1/file"]')).toHaveClass("h-auto", "w-full");
    fireEvent.click(screen.getByRole("button", { name: "Usar inspiração Lançamento" }));

    expect(onAttach).toHaveBeenCalledWith(template);
    expect(window.location.href).toBe(before);
  });

  it("attaches an approved output as an asset-backed inspiration", () => {
    const onAttach = vi.fn();
    render(<BrandInspirations clientProfileId="brand-1" onAttach={onAttach} />);

    fireEvent.click(screen.getByRole("button", { name: "Usar inspiração Matrículas" }));

    expect(onAttach).toHaveBeenCalledWith(approved);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("loads and renders global inspirations without an active brand", () => {
    useInspirationsMock.mockReturnValue({
      data: [curated],
      isLoading: false,
      isError: false,
    });

    render(
      <BrandInspirations
        clientProfileId={null}
        onAttach={vi.fn()}
      />,
    );

    expect(useInspirationsMock).toHaveBeenCalledWith(null);
    expect(screen.getByRole("button", {
      name: "Usar inspiração Editorial",
    })).toBeInTheDocument();
  });

  it("keeps the randomized order stable across local rerenders", () => {
    const { rerender } = render(
      <BrandInspirations
        clientProfileId="brand-1"
        onAttach={vi.fn()}
      />,
    );

    const firstOrder = screen
      .getAllByRole("button", { name: /Usar inspiração/ })
      .map((button) => button.getAttribute("aria-label"));

    rerender(
      <BrandInspirations
        clientProfileId="brand-1"
        onAttach={vi.fn()}
      />,
    );

    const secondOrder = screen
      .getAllByRole("button", { name: /Usar inspiração/ })
      .map((button) => button.getAttribute("aria-label"));

    expect(secondOrder).toEqual(firstOrder);
  });

  it("announces loading as a live status", () => {
    useInspirationsMock.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() });
    render(<BrandInspirations clientProfileId="brand-1" onAttach={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Carregando inspirações");
  });

  it("shows an actionable error and retries the same query", () => {
    const refetch = vi.fn();
    useInspirationsMock.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    render(<BrandInspirations clientProfileId="brand-1" onAttach={vi.fn()} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar as inspirações");
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("explains the empty state for the active brand", () => {
    useInspirationsMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    render(<BrandInspirations clientProfileId="brand-1" onAttach={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Nenhuma inspiração disponível ainda");
  });
});
