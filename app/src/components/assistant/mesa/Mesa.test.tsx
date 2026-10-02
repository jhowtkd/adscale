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

const renderMesa = (cards: MesaCard[], size: "large" | "compact" = "compact", pinned = false) =>
  render(<NextIntlClientProvider locale="pt-BR" messages={ptBR}><Mesa cards={cards} size={size} pinned={pinned} /></NextIntlClientProvider>);

const pin = () => screen.getByTestId("mesa-pin");

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

  // Ticket 13, T3 of the screen review: without a logo or a palette the fan has four cards, and skipping the middle slot left a hole at its center.
  describe("a fan of four stays whole and centered", () => {
    const geometry = () => screen.getAllByRole("listitem").map((item) => {
      const style = (item as HTMLElement).style;
      return { left: parseFloat(style.left), width: parseFloat(style.width), top: parseFloat(style.top), rotate: parseFloat(style.transform.replace(/[^-0-9.]/g, "")) };
    });

    it("has the same step between every pair of neighbours: no hole in the middle", () => {
      renderMesa([photo(1), photo(2), photo(3), photo(4)]);
      const { left } = { left: geometry().map((card) => card.left) };
      const steps = left.slice(1).map((value, index) => Math.round((value - left[index]!) * 10) / 10);
      expect(new Set(steps).size).toBe(1);
      expect(steps[0]).toBeGreaterThan(0);
    });

    it("is centered on the fan: as much room on the left of the first card as on the right of the last", () => {
      renderMesa([photo(1), photo(2), photo(3), photo(4)]);
      const cards = geometry();
      const leftRoom = cards[0]!.left;
      const rightRoom = 100 - (cards[3]!.left + cards[3]!.width);
      expect(Math.abs(leftRoom - rightRoom)).toBeLessThan(0.3);
    });

    it("rises to the middle and falls on the sides, tilting outward, symmetric", () => {
      renderMesa([photo(1), photo(2), photo(3), photo(4)]);
      const cards = geometry();
      expect(cards[0]!.top).toBe(cards[3]!.top);
      expect(cards[1]!.top).toBe(cards[2]!.top);
      expect(cards[1]!.top).toBeLessThan(cards[0]!.top);
      expect(cards.map((card) => card.rotate)).toEqual([-6, -2, 2, 6]);
    });

    it("keeps the order it was given, and the fans of one, two, three and five cards where they were", () => {
      renderMesa([photo(1), photo(2), photo(3), photo(4)]);
      expect(screen.getAllByRole("listitem").map((item) => item.getAttribute("data-testid"))).toHaveLength(4);
    });

    it("is not used on a phone, which shows three", () => {
      mobile = true;
      renderMesa([photo(1), photo(2), photo(3), photo(4)]);
      expect(screen.getAllByRole("listitem")).toHaveLength(3);
    });
  });

  describe("what the compact fan says aloud and does not draw", () => {
    it("keeps the palette's caption for assistive technology only in the compact fan, which dissolves where it sits", () => {
      renderMesa([palette], "compact");
      const caption = screen.getByText("Paleta · 3 cores");
      expect(caption).toHaveClass("sr-only");
      expect(caption.style.fontSize).toBe("");
    });

    it("draws it in the large fan", () => {
      renderMesa([palette], "large");
      expect(screen.getByText("Paleta · 3 cores")).not.toHaveClass("sr-only");
    });

    it("keeps it for assistive technology on a phone, where the fan is always compact", () => {
      mobile = true;
      renderMesa([palette], "large");
      expect(screen.getByText("Paleta · 3 cores")).toHaveClass("sr-only");
    });
  });

  describe("sideways overhang", () => {
    // The fade and the rotated cards reach past the mesa's own width: without a clip at the width of the conversation they
    // widen its scroll region and the whole conversation slides sideways.
    it("is clipped at the width of the conversation, with the mesa scrolling with it", () => {
      renderMesa([photo(1)], "compact");
      const wrapper = screen.getByTestId("mesa").parentElement!;
      expect(wrapper).toHaveClass("overflow-x-clip");
      expect(wrapper).not.toHaveClass("max-w-[712px]");
    });

    it("is clipped at the width of the conversation, with the mesa pinned too", () => {
      renderMesa([photo(1)], "compact", true);
      expect(pin()).toHaveClass("overflow-x-clip");
    });

    it("is clipped for the large fan as well", () => {
      renderMesa([photo(1)], "large");
      expect(screen.getByTestId("mesa").parentElement).toHaveClass("overflow-x-clip");
    });
  });

  describe("pinned: stays at the top of the conversation while the brand is being read", () => {
    it("says what it is (data-mesa-pin), so the conversation can keep what it scrolls into view out from behind it", () => {
      renderMesa([photo(1)], "compact", true);
      expect(pin()).toHaveAttribute("data-mesa-pin");
      expect(screen.getByTestId("mesa").closest("[data-mesa-pin]")).toBe(pin());
    });

    it("sits in a sticky container at the top of the scroll, with the canvas behind it so nothing shows through", () => {
      renderMesa([photo(1), queued], "compact", true);
      const pin = screen.getByTestId("mesa-pin");
      // Sticky only on a window tall enough to leave room for the card being answered; shorter ones scroll it away.
      expect(pin.className).toContain("[@media(min-height:600px)]:sticky");
      expect(pin.className).not.toMatch(/(^|\s)sticky(\s|$)/);
      expect(pin.className).toMatch(/\btop-0\b/);
      const mesa = screen.getByTestId("mesa");
      expect(pin).toContainElement(mesa);
      // The canvas is behind the fan itself, so a card that scrolls up under it never shows through the gaps.
      expect(mesa.parentElement!.className).toContain("bg-[var(--canvas)]");
      expect(mesa).toHaveAttribute("data-pinned", "true");
    });

    it("dissolves what scrolls under it, without catching pointer events", () => {
      renderMesa([photo(1)], "compact", true);
      const edge = screen.getByTestId("mesa-pin-edge");
      expect(edge).toHaveAttribute("aria-hidden", "true");
      expect(edge.className).toContain("pointer-events-none");
      expect(pin().contains(edge)).toBe(true);
    });

    it("keeps the dissolve in the layout, with the next row pulled back over it, so a row at rest is never faded", () => {
      renderMesa([photo(1)], "compact", true);
      const edge = screen.getByTestId("mesa-pin-edge");
      // An overlay laid over the next row would dim it even when nothing has scrolled; a block in the flow does not.
      expect(edge.className).not.toMatch(/\babsolute\b/);
      expect(pin().className).toMatch(/(^|\s)-mb-4(\s|$)/);
    });

    it("is not sticky when it scrolls with the conversation, which is the default", () => {
      renderMesa([photo(1)], "compact");
      expect(screen.queryByTestId("mesa-pin")).not.toBeInTheDocument();
      expect(screen.queryByTestId("mesa-pin-edge")).not.toBeInTheDocument();
      expect(screen.getByTestId("mesa")).toHaveAttribute("data-pinned", "false");
    });

    it("takes less of a phone's screen than the one that scrolls, so the card being answered keeps its room", () => {
      mobile = true;
      const { unmount } = renderMesa([1, 2, 3].map(inspiration), "compact", true);
      expect((screen.getByTestId("mesa").firstElementChild as HTMLElement).style.maxHeight).toBe("132px");
      unmount();
      renderMesa([1, 2, 3].map(inspiration), "compact", false);
      expect((screen.getByTestId("mesa").firstElementChild as HTMLElement).style.maxHeight).toBe("158px");
    });

    it("takes no more than 28% of a short window on a desktop, and the usual 205 px otherwise", () => {
      const { unmount } = renderMesa([photo(1)], "compact", true);
      expect((screen.getByTestId("mesa").firstElementChild as HTMLElement).style.maxHeight).toBe("min(205px, 28vh)");
      unmount();
      renderMesa([photo(1)], "compact", false);
      expect((screen.getByTestId("mesa").firstElementChild as HTMLElement).style.maxHeight).toBe("205px");
    });

    it("keeps the cards that wait in the queue and the brand being assembled in the same fan", () => {
      renderMesa([queued, logo, queued, palette, queued], "compact", true);
      expect(screen.getAllByTestId("mesa-card-queued")).toHaveLength(3);
      expect(screen.getByTestId("mesa-card-logo")).toBeInTheDocument();
      expect(screen.getByTestId("mesa-card-palette")).toBeInTheDocument();
    });
  });

  describe("the title of an inspiration", () => {
    it("is read on the large fan, where the card shows it", () => {
      renderMesa([inspiration(1)], "large");
      const title = screen.getByText("Título 1");
      expect(title.className).not.toContain("sr-only");
      expect(title.className).toContain("font-bold");
    });

    it("is kept for assistive technology only on the compact fan, which is cut where the title would be", () => {
      renderMesa([inspiration(1)], "compact");
      const title = screen.getByText("Título 1");
      expect(title.className).toContain("sr-only");
      expect(screen.getByTestId("mesa-card-inspiration")).toHaveTextContent("Título 1");
    });
  });

  it("does not catch pointer events: the conversation underneath stays usable", () => {
    renderMesa([photo(1)]);
    expect(screen.getByTestId("mesa").className).toContain("pointer-events-none");
  });
});
