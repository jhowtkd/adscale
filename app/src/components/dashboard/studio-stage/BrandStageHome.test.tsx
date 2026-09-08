import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { BrandStageHome } from "./BrandStageHome";

it("não remonta o dock ao trocar a ocupação da mesa", () => {
  const props = {
    brandName: "Marca A",
    headline: "Criar",
    subtitle: "Pedido",
    eyebrow: "Estúdio",
    mosaicItems: [] as { id: string; title: string; src: string }[],
    topBar: null,
    onDropFiles: vi.fn(),
    dropLabel: "Soltar imagens",
    talkBox: <input aria-label="Rascunho" />,
  };
  const view = render(<BrandStageHome {...props} occupancy="empty" />);
  const dock = screen.getByTestId("studio-dock");
  const input = screen.getByLabelText("Rascunho");
  fireEvent.change(input, { target: { value: "não remontar" } });
  view.rerender(<BrandStageHome {...props} occupancy="work" />);
  expect(screen.getByTestId("studio-dock")).toBe(dock);
  expect(screen.getByLabelText("Rascunho")).toBe(input);
  expect(input).toHaveValue("não remontar");
  expect(dock).toContainElement(input);
});

it("não inventa seis cópias de uma peça produzida", () => {
  render(<BrandStageHome occupancy="work" brandName="Marca" headline="Criar"
    subtitle="Pedido" eyebrow="Estúdio" topBar={null} talkBox={null}
    onDropFiles={vi.fn()} dropLabel="Soltar" repeatItems={false}
    mosaicItems={[{ id: "output:1", title: "Peça única", src: "/piece.png" }]} />);
  expect(screen.getAllByRole("button", { name: "Peça única" })).toHaveLength(1);
});

it("mantém o mosaic visível e o switcher da mesa usável quando os resultados ocupam o palco", () => {
  render(<BrandStageHome occupancy="work" brandName="Marca" headline="Criar"
    subtitle="Pedido" eyebrow="Estúdio" topBar={null} talkBox={null}
    onDropFiles={vi.fn()} dropLabel="Soltar" resultsActive
    deskControls={<button type="button">Produção</button>}
    results={<p>Revisão</p>}
    mosaicItems={[{ id: "output:1", title: "Peça única", src: "/piece.png" }]} />);
  expect(screen.getByTestId("studio-desk")).not.toHaveAttribute("inert");
  expect(screen.getByRole("button", { name: "Produção" })).toBeEnabled();
  expect(screen.getByTestId("studio-mosaic")).toBeVisible();
  expect(within(screen.getByTestId("studio-mosaic")).getAllByRole("button", { name: "Peça única" }).length).toBeGreaterThan(0);
  expect(screen.getByTestId("studio-results-surface")).toHaveTextContent("Revisão");
  expect(screen.getByTestId("studio-stage").querySelector("[data-results='true']")).toBeTruthy();
});
