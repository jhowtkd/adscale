import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ptBR from "../../../../messages/pt-BR.json";
import type { MesaCard } from "@/lib/equipe/mesa";

let mobile = false;
vi.mock("@/lib/hooks/use-media-query", () => ({ useIsMobile: () => mobile }));

import Mesa from "./Mesa";

const inspiration = (n: number): MesaCard => ({ kind: "inspiration", id: `i${n}`, title: `Título ${n}`, src: `/i${n}.jpg` });
const photo = (n: number, origin: "site" | "instagram" | "user" = "site"): MesaCard => ({ kind: "photo", id: `p${n}`, src: `/p${n}.jpg`, origin });
const logo: MesaCard = { kind: "logo", id: "l", src: "/logo.png" };
const palette: MesaCard = { kind: "palette", id: "palette", colors: ["#111111", "#222222", "#333333"] };
const queued: MesaCard = { kind: "queued", id: "q", group: "images" };

const renderMesa = (cards: MesaCard[], size: "large" | "compact" = "compact") =>
  render(<NextIntlClientProvider locale="pt-BR" messages={ptBR}><Mesa cards={cards} size={size} /></NextIntlClientProvider>);

describe("Mesa", () => {
  beforeEach(() => {
    mobile = false;
  });

  it("renders nothing without cards", () => {
    const { container } = renderMesa([]);
    expect(container).toBeEmptyDOMElement();
  });

  it("is a labeled list with one element per card, never more than five", () => {
    renderMesa([1, 2, 3, 4, 5, 6, 7].map(inspiration));
    const list = screen.getByRole("list", { name: "Mesa de criativos" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByTestId("mesa")).toHaveAttribute("data-cards", "5");
  });

  it("reports the size it was given", () => {
    const { unmount } = renderMesa([photo(1)], "large");
    expect(screen.getByTestId("mesa")).toHaveAttribute("data-size", "large");
    unmount();
    renderMesa([photo(1)], "compact");
    expect(screen.getByTestId("mesa")).toHaveAttribute("data-size", "compact");
  });

  it("gives the large fan more room than the compact one", () => {
    const { unmount } = renderMesa([photo(1)], "large");
    const largeBox = screen.getByTestId("mesa").firstElementChild as HTMLElement;
    expect(largeBox.style.maxHeight).toBe("");
    unmount();
    renderMesa([photo(1)], "compact");
    expect((screen.getByTestId("mesa").firstElementChild as HTMLElement).style.maxHeight).toBe("205px");
  });

  it("is always compact on a phone, showing the three central cards", () => {
    mobile = true;
    renderMesa([1, 2, 3, 4, 5].map(inspiration), "large");
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items.map((item) => item.textContent)).toEqual(["InspiraçãoTítulo 2", "InspiraçãoTítulo 3", "InspiraçãoTítulo 4"]);
    expect((screen.getByTestId("mesa").firstElementChild as HTMLElement).style.maxHeight).toBe("158px");
  });

  it("shows the first three cards on a phone when the fan has fewer than five", () => {
    mobile = true;
    renderMesa([inspiration(1), inspiration(2), inspiration(3), inspiration(4)]);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("shows inspirations with their title and the Inspiração stamp", () => {
    renderMesa([inspiration(1)]);
    const item = screen.getByTestId("mesa-card-inspiration");
    expect(item).toHaveTextContent("Título 1");
    expect(item).toHaveTextContent("Inspiração");
    expect(item.querySelector("img")).toHaveAttribute("src", "/i1.jpg");
  });

  it("stamps each photo with where it came from", () => {
    renderMesa([photo(1, "site"), photo(2, "instagram"), photo(3, "user")]);
    const items = screen.getAllByTestId("mesa-card-photo");
    expect(items.map((item) => item.textContent)).toEqual(["Do site", "Do Instagram", "Enviado por você"]);
    expect(items[1].querySelector("img")).toHaveAttribute("src", "/p2.jpg");
  });

  it("describes the logo for assistive technology and keeps decorative photos out of the reading order", () => {
    renderMesa([photo(1), logo]);
    expect(screen.getByRole("img", { name: "Logo da marca" })).toHaveAttribute("src", "/logo.png");
    for (const img of screen.getByTestId("mesa-card-photo").querySelectorAll("img")) expect(img).toHaveAttribute("alt", "");
  });

  it("shows the palette with one swatch per color and the count", () => {
    renderMesa([palette]);
    const item = screen.getByTestId("mesa-card-palette");
    const swatches = within(item).getAllByTestId("mesa-swatch");
    expect(swatches.map((swatch) => (swatch as HTMLElement).style.backgroundColor)).toEqual([
      "rgb(17, 17, 17)", "rgb(34, 34, 34)", "rgb(51, 51, 51)",
    ]);
    expect(item).toHaveTextContent("Paleta · 3 cores");
  });

  it("uses the singular for a one-color palette", () => {
    renderMesa([{ kind: "palette", id: "palette", colors: ["#ff0000"] }]);
    expect(screen.getByTestId("mesa-card-palette")).toHaveTextContent("Paleta · 1 cor");
  });

  it("shows a queued card, with no image, while a group is still being read", () => {
    renderMesa([photo(1), queued]);
    const item = screen.getByTestId("mesa-card-queued");
    expect(item).toHaveTextContent("Na fila");
    expect(item.querySelector("img")).toBeNull();
  });

  it("lays the fan out in the order it was given, centered when it is short", () => {
    renderMesa([photo(1), logo, photo(2)]);
    const lefts = screen.getAllByRole("listitem").map((item) => parseFloat((item as HTMLElement).style.left));
    expect(lefts).toEqual([...lefts].sort((a, b) => a - b));
    expect(lefts[0]).toBeGreaterThan(2.2);
  });

  it("does not catch pointer events: the conversation underneath stays usable", () => {
    renderMesa([photo(1)]);
    expect(screen.getByTestId("mesa").className).toContain("pointer-events-none");
  });
});
