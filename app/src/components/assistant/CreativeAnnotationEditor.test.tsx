import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CreativeAnnotationEditor from "./CreativeAnnotationEditor";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const baseProps = {
  imageUrl: "https://cdn.test/base.png",
  versionId: "00000000-0000-4000-8000-000000000021",
  annotations: [],
  onAdd: vi.fn(),
  onRemove: vi.fn(),
};

function drawRect(container: HTMLElement, startX: number, startY: number, endX: number, endY: number) {
  const overlay = container.querySelector(
    "[data-testid='assistant-annotation-overlay']"
  ) as HTMLElement;
  overlay.getBoundingClientRect = () =>
    ({
      width: 500,
      height: 500,
      left: 0,
      top: 0,
      right: 500,
      bottom: 500,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  fireEvent.pointerDown(overlay, { clientX: startX, clientY: startY });
  fireEvent.pointerMove(overlay, { clientX: endX, clientY: endY });
  fireEvent.pointerUp(overlay, { clientX: endX, clientY: endY });
}

describe("CreativeAnnotationEditor", () => {
  it("renders the source image and an annotation overlay", () => {
    const { container } = render(<CreativeAnnotationEditor {...baseProps} />);
    expect(screen.getByTestId("assistant-annotation-image")).toBeInTheDocument();
    expect(container.querySelector("[data-testid='assistant-annotation-overlay']")).toBeTruthy();
  });

  it("normalizes a dragged rectangle against the rendered image bounds", () => {
    const onAdd = vi.fn();
    const { container } = render(
      <CreativeAnnotationEditor {...baseProps} onAdd={onAdd} />
    );
    // 50px square at origin on a 500px image → x=0, y=0, width=0.1, height=0.1.
    drawRect(container, 0, 0, 50, 50);

    // A rectangle is drafted but not committed until a comment is entered.
    expect(screen.getByTestId("assistant-annotation-comment")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("assistant-annotation-comment"), {
      target: { value: "Reduce headline" },
    });
    fireEvent.click(screen.getByTestId("assistant-annotation-save"));

    expect(onAdd).toHaveBeenCalledTimes(1);
    const added = onAdd.mock.calls[0][0];
    expect(added.x).toBeCloseTo(0, 5);
    expect(added.y).toBeCloseTo(0, 5);
    expect(added.width).toBeCloseTo(0.1, 5);
    expect(added.height).toBeCloseTo(0.1, 5);
  });

  it("rejects rectangles smaller than 1% of image width or height", () => {
    const onAdd = vi.fn();
    const { container } = render(
      <CreativeAnnotationEditor {...baseProps} onAdd={onAdd} />
    );
    // 3px on a 500px image = 0.6% → below the 1% floor.
    drawRect(container, 10, 10, 13, 13);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("requires a non-empty comment before saving a rectangle", () => {
    const onAdd = vi.fn();
    const { container } = render(
      <CreativeAnnotationEditor {...baseProps} onAdd={onAdd} />
    );
    drawRect(container, 0, 0, 100, 100);
    // A rectangle is drafted but not committed until a comment is entered.
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByTestId("assistant-annotation-comment")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("assistant-annotation-comment"), {
      target: { value: "  " },
    });
    fireEvent.click(screen.getByTestId("assistant-annotation-save"));
    expect(onAdd).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId("assistant-annotation-comment"), {
      target: { value: "Reduce headline" },
    });
    fireEvent.click(screen.getByTestId("assistant-annotation-save"));
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ comment: "Reduce headline" })
    );
  });

  it("supports keyboard deletion of annotation list items", () => {
    const onRemove = vi.fn();
    render(
      <CreativeAnnotationEditor
        {...baseProps}
        annotations={[
          {
            id: "ann-1",
            versionId: baseProps.versionId,
            x: 0.1,
            y: 0.1,
            width: 0.2,
            height: 0.2,
            comment: "Old note",
            status: "draft" as const,
            addressedByVersionId: null,
          },
        ]}
        onRemove={onRemove}
      />
    );

    const item = screen.getByTestId("assistant-annotation-item-ann-1");
    item.focus();
    fireEvent.keyDown(item, { key: "Backspace" });
    expect(onRemove).toHaveBeenCalledWith("ann-1");
  });

  it("uses danger surface tokens for active annotation markers", () => {
    render(
      <CreativeAnnotationEditor
        {...baseProps}
        annotations={[
          {
            id: "ann-1",
            versionId: baseProps.versionId,
            x: 0.1,
            y: 0.1,
            width: 0.2,
            height: 0.2,
            comment: "Old note",
            status: "draft" as const,
            addressedByVersionId: null,
          },
        ]}
      />
    );

    const marker = screen.getByText("1", { selector: "span" });
    expect(marker).toHaveClass(
      "bg-[var(--danger-bg)]",
      "text-[var(--danger-text)]"
    );
    expect(marker).not.toHaveClass("text-[var(--text-on-accent)]");
  });

  it("disables drawing on mobile with an explanatory label", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: query.includes("max-width") ? true : false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });

    render(<CreativeAnnotationEditor {...baseProps} isMobile />);
    expect(
      screen.getByTestId("assistant-annotation-mobile-notice")
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("assistant-annotation-overlay")
    ).not.toBeInTheDocument();
  });
});
