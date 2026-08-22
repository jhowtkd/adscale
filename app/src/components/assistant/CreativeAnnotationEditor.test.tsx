import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import CreativeAnnotationEditor from "./CreativeAnnotationEditor";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
const voiceMocks = vi.hoisted(() => ({ capturedTranscript: undefined as ((text: string) => void) | undefined }));
vi.mock("@/components/ui/VoiceInputButton", () => ({
  default: ({ onTranscript, onBusyChange }: { onTranscript: (text: string) => void; onBusyChange?: (busy: boolean) => void }) => <div><button type="button" onClick={() => onTranscript("Texto ditado")}>mock voice</button><button type="button" onClick={() => { voiceMocks.capturedTranscript = onTranscript; }}>capture voice</button><button type="button" onClick={() => voiceMocks.capturedTranscript?.("Texto ditado")}>deliver captured transcript</button><button type="button" onClick={() => onBusyChange?.(true)}>mock busy</button><button type="button" onClick={() => onBusyChange?.(false)}>mock idle</button></div>,
  appendTranscript: (current: string, text: string, max: number) => [current, text].filter(Boolean).join(" ").slice(0, max),
}));

const baseProps = {
  imageUrl: "https://cdn.test/base.png",
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

  it("lets keyboard users create and position a rectangle", () => {
    const onAdd = vi.fn();
    render(<CreativeAnnotationEditor {...baseProps} onAdd={onAdd} />);

    const add = screen.getByRole("button", { name: "annotationKeyboardAdd" });
    add.focus();
    fireEvent.click(add);
    fireEvent.change(screen.getByRole("spinbutton", { name: "annotationX" }), { target: { value: "10" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "annotationY" }), { target: { value: "20" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "annotationWidth" }), { target: { value: "30" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "annotationHeight" }), { target: { value: "40" } });
    fireEvent.change(screen.getByTestId("assistant-annotation-comment"), { target: { value: "Move logo" } });
    fireEvent.click(screen.getByTestId("assistant-annotation-save"));

    expect(onAdd).toHaveBeenCalledWith({ x: 0.1, y: 0.2, width: 0.3, height: 0.4, comment: "Move logo" });
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

  it("does not start touch drawing even at a desktop viewport", () => {
    const onAdd = vi.fn();
    const { container } = render(<CreativeAnnotationEditor {...baseProps} onAdd={onAdd} />);
    const overlay = screen.getByTestId("assistant-annotation-overlay");
    fireEvent.pointerDown(overlay, { clientX: 0, clientY: 0, pointerType: "touch" });
    fireEvent.pointerMove(overlay, { clientX: 100, clientY: 100, pointerType: "touch" });
    fireEvent.pointerUp(overlay, { clientX: 100, clientY: 100, pointerType: "touch" });
    expect(container.querySelector("[data-testid='assistant-annotation-comment']")).not.toBeInTheDocument();
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
            x: 0.1,
            y: 0.1,
            width: 0.2,
            height: 0.2,
            comment: "Old note",
            status: "draft" as const,
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
            x: 0.1,
            y: 0.1,
            width: 0.2,
            height: 0.2,
            comment: "Old note",
            status: "draft" as const,
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

  it("keeps general feedback out of the default Goal Assistant layout", () => {
    render(<CreativeAnnotationEditor {...baseProps} />);
    expect(screen.queryByTestId("assistant-annotation-general-comment")).not.toBeInTheDocument();
  });

  it("lets mobile and keyboard users add general voice-editable Creative Work feedback", () => {
    const onAdd = vi.fn();
    render(<CreativeAnnotationEditor {...baseProps} isMobile layout="split" onAdd={onAdd} />);
    fireEvent.change(screen.getByTestId("assistant-annotation-general-comment"), { target: { value: "Atual" } });
    fireEvent.click(screen.getAllByRole("button", { name: "mock voice" })[0]);
    expect(screen.getByTestId("assistant-annotation-general-comment")).toHaveValue("Atual Texto ditado");
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getAllByText("privacy")).toHaveLength(1);
  });

  it("appends a captured general transcript to the latest controlled text", () => {
    function ControlledEditor() {
      const [generalComment, setGeneralComment] = useState("Inicial");
      return <CreativeAnnotationEditor {...baseProps} layout="split" generalComment={generalComment} onGeneralCommentChange={setGeneralComment} />;
    }
    render(<ControlledEditor />);
    fireEvent.click(screen.getByRole("button", { name: "capture voice" }));
    fireEvent.change(screen.getByTestId("assistant-annotation-general-comment"), { target: { value: "Texto atualizado" } });
    fireEvent.click(screen.getByRole("button", { name: "deliver captured transcript" }));
    expect(screen.getByTestId("assistant-annotation-general-comment")).toHaveValue("Texto atualizado Texto ditado");
    expect((screen.getByTestId("assistant-annotation-general-comment") as HTMLTextAreaElement).value.length).toBeLessThanOrEqual(300);
  });

  it("reports aggregate voice busy state for both Creative Work inputs", () => {
    const onBusyChange = vi.fn();
    const { container } = render(<CreativeAnnotationEditor {...baseProps} layout="split" onBusyChange={onBusyChange} />);
    drawRect(container, 0, 0, 100, 100);
    fireEvent.click(screen.getAllByRole("button", { name: "mock busy" })[0]);
    expect(onBusyChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getAllByRole("button", { name: "mock idle" })[0]);
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
  });

  it("moves the numbered comment list into the split right panel", () => {
    render(<CreativeAnnotationEditor {...baseProps} layout="split" annotations={[{ id: "ann-1", x: 0, y: 0, width: 1, height: 1, comment: "Geral", status: "draft" }]} sidePanel={<button type="button">submit revision</button>} />);
    const rightPanel = screen.getByTestId("assistant-annotation-right-panel");
    expect(rightPanel).toContainElement(screen.getByTestId("assistant-annotation-item-ann-1"));
    expect(rightPanel).toContainElement(screen.getByRole("button", { name: "submit revision" }));
    expect(screen.getByTestId("assistant-annotation-image").parentElement).not.toContainElement(screen.getByTestId("assistant-annotation-item-ann-1"));
  });

  it("appends voice comments, blocks save while voice is busy, and honors active limits", () => {
    const { container, rerender } = render(<CreativeAnnotationEditor {...baseProps} />);
    drawRect(container, 0, 0, 100, 100);
    fireEvent.change(screen.getByTestId("assistant-annotation-comment"), { target: { value: "Atual" } });
    fireEvent.click(screen.getAllByRole("button", { name: "mock voice" })[0]);
    expect(screen.getByTestId("assistant-annotation-comment")).toHaveValue("Atual Texto ditado");
    fireEvent.click(screen.getAllByRole("button", { name: "mock busy" })[0]);
    expect(screen.getByTestId("assistant-annotation-save")).toBeDisabled();
    rerender(<CreativeAnnotationEditor {...baseProps} maxAnnotations={1} annotations={[{ id: "ann-1", x: 0.1, y: 0.1, width: 0.2, height: 0.2, comment: "Existing", status: "draft" }]} />);
    expect(screen.getByTestId("assistant-annotation-overlay")).toHaveAttribute("aria-disabled", "true");
  });

  it("keeps general feedback separate from the five-rectangle annotation limit", () => {
    const onAdd = vi.fn();
    const existing = Array.from({ length: 5 }, (_, index) => ({
      id: `ann-${index}`,
      x: 0.1,
      y: 0.1,
      width: 0.2,
      height: 0.2,
      comment: `Existing ${index}`,
      status: "draft" as const,
    }));
    render(<CreativeAnnotationEditor {...baseProps} layout="split" maxAnnotations={5} annotations={existing} onAdd={onAdd} />);
    fireEvent.change(screen.getByTestId("assistant-annotation-general-comment"), { target: { value: "General fifth" } });
    expect(screen.getByTestId("assistant-annotation-general-comment")).toHaveValue("General fifth");
    expect(screen.getAllByTestId(/assistant-annotation-item-/)).toHaveLength(5);
    expect(screen.queryByTestId("assistant-annotation-general-save")).not.toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
  });
});
