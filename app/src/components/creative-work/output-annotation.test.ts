import { describe, expect, it, vi } from "vitest";
import { compileOutputAnnotationInstruction, drawOutputAnnotations, renderAnnotatedOutputFile, type OutputAnnotation } from "./output-annotation";

const annotations: OutputAnnotation[] = [
  { id: "1", x: 0.1, y: 0.2, width: 0.3, height: 0.25, comment: "  Reduzir título  ", status: "draft" },
  { id: "2", x: 0.6, y: 0.7, width: 0.2, height: 0.1, comment: "Trocar CTA", status: "draft" },
];

describe("output annotations", () => {
  it("compiles comments in the numbered image order and validates drafts", () => {
    expect(compileOutputAnnotationInstruction(annotations)).toBe("Aplique somente as alterações numeradas na imagem anotada.\nMantenha os demais elementos da arte.\n\n1. Reduzir título\n2. Trocar CTA");
    expect(() => compileOutputAnnotationInstruction([])).toThrow("annotation_count");
    expect(() => compileOutputAnnotationInstruction(Array(6).fill(annotations[0]))).toThrow("annotation_count");
    expect(() => compileOutputAnnotationInstruction([{ ...annotations[0], comment: " " }])).toThrow("annotation_comment");
    expect(() => compileOutputAnnotationInstruction([{ ...annotations[0], comment: "x".repeat(301) }])).toThrow("annotation_comment");
    expect(() => compileOutputAnnotationInstruction([{ ...annotations[0], x: Number.NaN }])).toThrow("annotation_bounds");
  });

  it("compiles trimmed general feedback separately from numbered rectangles", () => {
    expect(compileOutputAnnotationInstruction([], "  Ajustar contraste  ")).toBe("Aplique somente a alteração solicitada.\nMantenha os demais elementos da arte.\n\nAjustar contraste");
    expect(compileOutputAnnotationInstruction([annotations[0]], "  Ajustar contraste  ")).toBe("Aplique somente as alterações numeradas na imagem anotada.\nMantenha os demais elementos da arte.\n\nAjustar contraste\n\n1. Reduzir título");
    expect(() => compileOutputAnnotationInstruction([], " ")).toThrow("annotation_count");
    expect(() => compileOutputAnnotationInstruction([], "x".repeat(301))).toThrow("annotation_comment");
  });

  it("scales normalized rectangles to source pixels", () => {
    const context = { save: vi.fn(), restore: vi.fn(), strokeRect: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(), fillText: vi.fn(), set strokeStyle(_value: string) {}, set fillStyle(_value: string) {}, set lineWidth(_value: number) {}, set font(_value: string) {}, set textAlign(_value: CanvasTextAlign) {}, set textBaseline(_value: CanvasTextBaseline) {} } as unknown as CanvasRenderingContext2D;
    drawOutputAnnotations(context, 1_000, 800, [annotations[0]]);
    expect(context.strokeRect).toHaveBeenCalledWith(100, 160, 300, 200);
    expect(context.fillText).toHaveBeenCalledWith("1", expect.any(Number), expect.any(Number));
  });

  it("downloads, annotates, and materializes a deterministic PNG file", async () => {
    const close = vi.fn();
    const fetchMock = vi.fn(async () => new Response(new Blob(["image"], { type: "image/png" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 100, height: 80, close })));
    const context = { drawImage: vi.fn(), save: vi.fn(), restore: vi.fn(), strokeRect: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(), fillText: vi.fn(), set strokeStyle(_value: string) {}, set fillStyle(_value: string) {}, set lineWidth(_value: number) {}, set font(_value: string) {}, set textAlign(_value: CanvasTextAlign) {}, set textBaseline(_value: CanvasTextBaseline) {} } as unknown as CanvasRenderingContext2D;
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => context), toBlob: vi.fn((callback: BlobCallback) => callback(new Blob(["png"], { type: "image/png" }))) } as unknown as HTMLCanvasElement;
    const createElement = vi.spyOn(document, "createElement").mockReturnValue(canvas);
    const file = await renderAnnotatedOutputFile({ outputId: "output-1", imageUrl: "/api/output-1/download", annotations: [annotations[0]] });
    expect(fetchMock).toHaveBeenCalledWith("/api/output-1/download", { credentials: "include" });
    expect(file.name).toBe("output-output-1-annotations.png");
    expect(file.type).toBe("image/png");
    expect(close).toHaveBeenCalled();
    createElement.mockRestore();
  });
});
