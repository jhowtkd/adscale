import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { CarouselSequenceBoard, type CarouselBoardSlide } from "./CarouselSequenceBoard";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    if (key === "slideLabel") return `Tela ${values?.position}`;
    return ({
      boardAria: "Telas do carrossel em ordem",
      moveUp: "Mover para cima",
      moveDown: "Mover para baixo",
      addSlide: "Adicionar tela",
      removeSlide: "Remover tela",
      status_draft: "Rascunho",
      status_completed: "Pronta",
      status_failed: "Falhou",
      role_hook: "Gancho",
      role_context: "Contexto",
      role_cta: "Chamada",
      removeSlideAria: `Remover a tela ${values?.position}`,
      dragHandleAria: `Reordenar a tela ${values?.position}`,
    }[key] ?? key);
  },
}));

function boardSlide(position: number, overrides: Partial<CarouselBoardSlide> = {}): CarouselBoardSlide {
  const role = position === 1 ? "hook" : position === 5 ? "cta" : "context";
  return { id: `slide-${position}`, position, role, status: null, ...overrides };
}

const fiveSlides = [1, 2, 3, 4, 5].map((position) => boardSlide(position));

function moveSlideLocal(slides: CarouselBoardSlide[], slideId: string, toPosition: number) {
  const from = slides.findIndex((slide) => slide.id === slideId);
  const next = slides.map((slide) => ({ ...slide }));
  const [moved] = next.splice(from, 1);
  moved!.position = toPosition;
  next.splice(toPosition - 1, 0, moved!);
  return next.map((slide, index) => ({ ...slide, position: index + 1 }));
}

function BoardHarness({ initial = fiveSlides, selectedSlideId = null as string | null, canEdit = true }: {
  initial?: CarouselBoardSlide[];
  selectedSlideId?: string | null;
  canEdit?: boolean;
}) {
  const [slides, setSlides] = useState(initial);
  return (
    <CarouselSequenceBoard
      slides={slides}
      selectedSlideId={selectedSlideId}
      canEdit={canEdit}
      onSelect={vi.fn()}
      onMove={(slideId, toPosition) => setSlides((previous) => moveSlideLocal(previous, slideId, toPosition))}
      onAdd={() => setSlides((previous) => [...previous, boardSlide(previous.length + 1)])}
      onRemove={(slideId) => setSlides((previous) => previous.filter((slide) => slide.id !== slideId).map((slide, index) => ({ ...slide, position: index + 1 })))}
    />
  );
}

describe("CarouselSequenceBoard", () => {
  it("keeps every slide visible with order and status in a horizontally scrollable strip", () => {
    render(
      <CarouselSequenceBoard
        slides={[...fiveSlides, boardSlide(5, { id: "slide-5b", position: 5, status: "failed" })].map((slide, index) => ({ ...slide, position: index + 1 }))}
        selectedSlideId="slide-1"
        canEdit
        onSelect={vi.fn()}
        onMove={vi.fn()}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByTestId("carousel-board-scroll")).toHaveClass("overflow-x-auto");
    for (const position of [1, 2, 3, 4, 5, 6]) {
      const card = screen.getByTestId(`carousel-slide-card-${position}`);
      expect(card).toHaveTextContent(`Tela ${position}`);
      expect(card).toHaveTextContent(/Rascunho|Falhou/);
    }
  });

  it("marks the selected slide with aria-current", () => {
    render(
      <CarouselSequenceBoard
        slides={fiveSlides}
        selectedSlideId="slide-2"
        canEdit
        onSelect={vi.fn()}
        onMove={vi.fn()}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByTestId("carousel-slide-2")).toHaveAttribute("aria-current", "true");
    expect(screen.getByTestId("carousel-slide-1")).not.toHaveAttribute("aria-current");
  });

  it("reorders through native drag and drop onto another position", () => {
    const onMove = vi.fn();
    render(
      <CarouselSequenceBoard
        slides={fiveSlides}
        selectedSlideId="slide-1"
        canEdit
        onSelect={vi.fn()}
        onMove={onMove}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    fireEvent.dragStart(screen.getByTestId("carousel-slide-card-1"), { dataTransfer: { setData: vi.fn() } });
    fireEvent.dragOver(screen.getByTestId("carousel-slide-card-3"));
    fireEvent.drop(screen.getByTestId("carousel-slide-card-3"), { dataTransfer: { getData: () => "slide-1" } });

    expect(onMove).toHaveBeenCalledWith("slide-1", 3);
  });

  it("moves a slide with the explicit up and down buttons at boundaries", () => {
    const onMove = vi.fn();
    render(
      <CarouselSequenceBoard
        slides={fiveSlides}
        selectedSlideId="slide-1"
        canEdit
        onSelect={vi.fn()}
        onMove={onMove}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByTestId("carousel-move-up-1")).toBeDisabled();
    expect(screen.getByTestId("carousel-move-down-5")).toBeDisabled();

    fireEvent.click(screen.getByTestId("carousel-move-up-2"));
    expect(onMove).toHaveBeenCalledWith("slide-2", 1);

    fireEvent.click(screen.getByTestId("carousel-move-down-2"));
    expect(onMove).toHaveBeenCalledWith("slide-2", 3);
  });

  it("keeps keyboard focus on the moved slide after a reorder", async () => {
    render(<BoardHarness selectedSlideId="slide-3" />);

    fireEvent.click(screen.getByTestId("carousel-move-up-3"));

    // The moved slide keeps the selection, so its select button carries
    // aria-current at the new position.
    await waitFor(() => expect(screen.getByRole("button", { current: true })).toHaveFocus());
  });

  it("respects the five-to-eight slide bounds for add and remove", () => {
    const { rerender } = render(
      <CarouselSequenceBoard
        slides={fiveSlides}
        selectedSlideId="slide-1"
        canEdit
        onSelect={vi.fn()}
        onMove={vi.fn()}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByTestId("carousel-add-slide")).toBeEnabled();
    expect(screen.getByTestId("carousel-remove-1")).toBeDisabled();

    rerender(
      <CarouselSequenceBoard
        slides={[1, 2, 3, 4, 5, 6, 7, 8].map((position) => boardSlide(position))}
        selectedSlideId="slide-1"
        canEdit
        onSelect={vi.fn()}
        onMove={vi.fn()}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByTestId("carousel-add-slide")).toBeDisabled();
    expect(screen.getByTestId("carousel-remove-1")).toBeEnabled();
  });

  it("disables reordering, adding and removing when the draft is frozen", () => {
    render(
      <CarouselSequenceBoard
        slides={fiveSlides}
        selectedSlideId="slide-1"
        canEdit={false}
        onSelect={vi.fn()}
        onMove={vi.fn()}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByTestId("carousel-move-up-2")).toBeDisabled();
    expect(screen.getByTestId("carousel-move-down-2")).toBeDisabled();
    expect(screen.getByTestId("carousel-add-slide")).toBeDisabled();
    expect(screen.getByTestId("carousel-remove-2")).toBeDisabled();
    expect(screen.getByTestId("carousel-slide-card-2")).not.toHaveAttribute("draggable", "true");
  });
});
