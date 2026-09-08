import { fireEvent, render, screen } from "@testing-library/react";
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
  const input = screen.getByLabelText("Rascunho");
  fireEvent.change(input, { target: { value: "não remontar" } });
  view.rerender(<BrandStageHome {...props} occupancy="work" />);
  expect(screen.getByLabelText("Rascunho")).toBe(input);
  expect(input).toHaveValue("não remontar");
});
