import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GalleryGrid from "./GalleryGrid";

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

const items = [
  {
    id: "d1",
    imageUrl: "/api/share/token/asset/d1",
    format: "1x1",
    generationMode: "variation",
    variantIndex: 0,
    ctaText: "Peça principal",
  },
  {
    id: "d2",
    imageUrl: "/api/share/token/asset/d2",
    format: "9x16",
  },
];

const labels = {
  closePreview: "Fechar",
  variation: "Variação {index}",
};

describe("share gallery occupancy", () => {
  it("uses Biblioteca bento occupancy instead of equal cards", () => {
    render(<GalleryGrid items={items} labels={labels} />);

    expect(screen.getByTestId("share-bento").className).toContain("columns-2");
    expect(screen.getAllByTestId("share-asset-rover")[0].className).toContain("opacity-0");
    expect(screen.getAllByTestId("share-asset-rover")[0].className).toContain("group-hover:opacity-100");
    expect(screen.getByRole("button", { name: "Peça principal" }).className).toContain("rounded-2xl");
    expect(screen.queryByRole("img", { name: /zoom/i })).not.toBeInTheDocument();
  });

  it("opens a canvas occupancy instead of a nested lightbox card", () => {
    render(<GalleryGrid items={items} labels={labels} />);

    fireEvent.click(screen.getByRole("button", { name: "Peça principal" }));

    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByRole("dialog").className).toContain("bg-[var(--canvas)]/92");
    expect(screen.getByRole("dialog").className).not.toContain("shadow-2xl");
    expect(screen.getAllByRole("button", { name: "Fechar" }).length).toBeGreaterThan(0);
  });
});
