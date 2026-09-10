import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { count?: number }) => ({
    commentMode: "Comentar",
    commentAdd: "Adicionar comentário",
    commentText: "Comentário",
    commentX: "X (%)",
    commentY: "Y (%)",
    commentSave: "Salvar comentário",
    commentRemove: "Remover comentário",
    commentPinName: `Comentário ${values?.count ?? 0}`,
  }[key] ?? key),
}));

import { PieceReviewCanvas, type PieceReviewAnnotation } from "./PieceReviewCanvas";

const rect = { left: 0, top: 0, right: 600, bottom: 400, width: 600, height: 400, x: 0, y: 0, toJSON: () => ({}) };

afterEach(() => {
  vi.restoreAllMocks();
});

function renderCanvas(annotations: PieceReviewAnnotation[] = []) {
  const onChange = vi.fn();
  const view = render(
    <PieceReviewCanvas
      src="/api/creative-work/work-1/outputs/output-1/download"
      alt="Peça 1"
      annotations={annotations}
      onChange={onChange}
    />,
  );
  return { onChange, ...view };
}

function enterCommentMode() {
  const toggle = screen.getByRole("button", { name: "Comentar" });
  fireEvent.click(toggle);
  return toggle;
}

describe("PieceReviewCanvas", () => {
  it("renders the artwork and existing pins with accessible names", () => {
    const existing = [{ id: "a-1", x: 0.25, y: 0.8, text: "Aumente o CTA" }];
    renderCanvas(existing);
    expect(screen.getByRole("img", { name: "Peça 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Comentário 1" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Comentário 2" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Comentar" })).toHaveAttribute("aria-pressed", "false");
  });

  it("adds a centered comment through the keyboard path", async () => {
    const { onChange } = renderCanvas();
    enterCommentMode();
    fireEvent.click(screen.getByRole("button", { name: "Adicionar comentário" }));
    const x = screen.getByRole("spinbutton", { name: "X (%)" }) as HTMLInputElement;
    const y = screen.getByRole("spinbutton", { name: "Y (%)" }) as HTMLInputElement;
    expect(x.value).toBe("50");
    expect(y.value).toBe("50");
    fireEvent.change(screen.getByRole("textbox", { name: "Comentário" }), { target: { value: "Aumente o CTA" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar comentário" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    const saved = onChange.mock.calls[0][0] as PieceReviewAnnotation[];
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ x: 0.5, y: 0.5, text: "Aumente o CTA" });
  });

  it("creates a draft where the artwork is clicked in comment mode", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(rect as DOMRect);
    const { onChange } = renderCanvas();
    enterCommentMode();
    fireEvent.mouseDown(screen.getByRole("img", { name: "Peça 1" }), { clientX: 450, clientY: 100 });
    const x = screen.getByRole("spinbutton", { name: "X (%)" }) as HTMLInputElement;
    const y = screen.getByRole("spinbutton", { name: "Y (%)" }) as HTMLInputElement;
    expect(x.value).toBe("75");
    expect(y.value).toBe("25");
    fireEvent.change(screen.getByRole("textbox", { name: "Comentário" }), { target: { value: "Mova o logo" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar comentário" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange.mock.calls[0][0][0]).toMatchObject({ x: 0.75, y: 0.25, text: "Mova o logo" });
  });

  it("ignores clicks outside comment mode or outside the artwork", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(rect as DOMRect);
    const { onChange } = renderCanvas();
    fireEvent.mouseDown(screen.getByRole("img", { name: "Peça 1" }), { clientX: 450, clientY: 100 });
    expect(screen.queryByRole("textbox", { name: "Comentário" })).not.toBeInTheDocument();
    enterCommentMode();
    fireEvent.mouseDown(screen.getByRole("img", { name: "Peça 1" }), { clientX: 700, clientY: 100 });
    expect(screen.queryByRole("textbox", { name: "Comentário" })).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("discards only the unsaved comment on Escape and restores focus", () => {
    const existing = [{ id: "a-1", x: 0.25, y: 0.8, text: "Aumente o CTA" }];
    const { onChange } = renderCanvas(existing);
    enterCommentMode();
    fireEvent.click(screen.getByRole("button", { name: "Adicionar comentário" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Comentário" }), { target: { value: "rascunho" } });
    fireEvent.keyDown(screen.getByRole("img", { name: "Peça 1" }), { key: "Escape" });
    expect(screen.queryByRole("textbox", { name: "Comentário" })).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Comentário 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Comentar" })).toHaveFocus();
  });

  it("edits an existing pin by id and removes it", async () => {
    const existing = [{ id: "a-1", x: 0.25, y: 0.8, text: "Aumente o CTA" }];
    const { onChange } = renderCanvas(existing);
    fireEvent.click(screen.getByRole("button", { name: "Comentário 1" }));
    const textarea = screen.getByRole("textbox", { name: "Comentário" }) as HTMLTextAreaElement;
    expect(textarea.value).toBe("Aumente o CTA");
    fireEvent.change(textarea, { target: { value: "Troque o título" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar comentário" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange.mock.calls[0][0]).toEqual([{ id: "a-1", x: 0.25, y: 0.8, text: "Troque o título" }]);

    onChange.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Comentário 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Remover comentário" }));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
