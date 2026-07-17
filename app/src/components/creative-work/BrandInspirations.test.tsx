import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useInspirationsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/hooks/use-creative-inspirations", () => ({
  useCreativeInspirations: (...args: unknown[]) => useInspirationsMock(...args),
}));

import { BrandInspirations } from "./BrandInspirations";

const template = {
  id: "template-1", source: "template" as const, title: "Lançamento",
  previewUrl: null, templateId: "template-1", assetId: null, suggestedIntent: "variations" as const,
};
const approved = {
  id: "output-1", source: "approved_work" as const, title: "Matrículas",
  previewUrl: "/api/workspace/assets/asset-1/file", templateId: null,
  assetId: "asset-1", suggestedIntent: "restyle" as const,
};

describe("BrandInspirations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useInspirationsMock.mockReturnValue({ data: [template, approved], isLoading: false, isError: false });
  });

  it("lists the active brand inspirations and attaches a template without navigating", () => {
    const onAttach = vi.fn();
    const before = window.location.href;
    render(<BrandInspirations clientProfileId="brand-1" onAttach={onAttach} />);

    expect(useInspirationsMock).toHaveBeenCalledWith("brand-1");
    expect(screen.getByText("Template")).toBeInTheDocument();
    expect(screen.getByText("Trabalho aprovado")).toBeInTheDocument();
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

  it("does not query or render brand data without an active brand", () => {
    useInspirationsMock.mockReturnValue({ data: [], isLoading: false, isError: false });
    const { container } = render(<BrandInspirations clientProfileId={null} onAttach={vi.fn()} />);

    expect(useInspirationsMock).toHaveBeenCalledWith(null);
    expect(container).toBeEmptyDOMElement();
  });
});
