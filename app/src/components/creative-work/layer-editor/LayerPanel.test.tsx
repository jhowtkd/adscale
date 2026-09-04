import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PublicLayerEditorDocumentV1 } from "@/server/layer-editor/contracts";
import { LayerCanvas } from "./LayerCanvas";
import { LayerPanel } from "./LayerPanel";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string, values?: { name?: string }) => key === "editorHide" ? `Ocultar ${values?.name}` : key === "editorShow" ? `Mostrar ${values?.name}` : key === "editorLayers" ? "Camadas" : key === "editorLayerName" ? "Nome da camada" : key === "editorCanvas" ? "Canvas de camadas" : key === "elementPrompt" ? "Prompt do elemento" : key === "editWithAi" ? "Editar com IA" : key }));

const document: PublicLayerEditorDocumentV1 = {
  schemaVersion: 1, revision: 1, canvas: { width: 20, height: 20 }, updatedAt: "2026-08-22T00:00:00.000Z", regeneration: null,
  lease: { mode: "read", leaseId: null, heldByName: null, expiresAt: null },
  layers: ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"].map((id, order) => ({ id, order, name: `Layer ${order}`, description: order === 0 ? "Woman facing camera" : "Base layer", visible: true, x: 0, y: 0, width: 20, height: 20, currentKind: "source" as const, imageUrl: `current-${order}`, source: { order, name: `Layer ${order}`, visible: true, x: 0, y: 0, width: 20, height: 20, imageUrl: `source-${order}` } })),
};

describe("LayerPanel inspect visibility", () => {
  it("keeps canvas resize hit targets at 44 CSS pixels across zoom levels and reserves touch actions for gestures", () => {
    render(<LayerCanvas document={document} selectedLayerId={document.layers[0]!.id} onSelect={vi.fn()} mode="edit" dispatch={vi.fn()} />);

    expect(screen.getByLabelText("editorSelectedLayer")).toHaveClass("touch-none");
    for (const zoom of [25, 50, 75, 100]) {
      fireEvent.click(screen.getByRole("button", { name: `${zoom}%` }));
      for (const handle of screen.getAllByTestId(/layer-resize-handle-/)) {
        const canvasUnits = Number.parseFloat(handle.getAttribute("style")?.match(/width:\s*([\d.]+)px/)?.[1] ?? "0");
        expect(canvasUnits * (zoom / 100)).toBeGreaterThanOrEqual(44);
      }
    }
  });

  it("keeps layer rows and visibility controls at the 44px touch target", () => {
    const dispatch = vi.fn();
    render(<LayerPanel document={document} selectedLayerId={document.layers[0]!.id} onSelect={vi.fn()} mode="edit" dispatch={dispatch} />);

    expect(screen.getByRole("button", { name: /Layer 0/ })).toHaveClass("min-h-11");
    expect(screen.getByRole("button", { name: "Ocultar Layer 0" })).toHaveClass("min-h-11", "min-w-11");
    expect(screen.getByLabelText("editorReorder")).toHaveClass("touch-none");
    expect(screen.getByLabelText("Camadas")).not.toHaveClass("touch-none");
  });

  it("tracks the nearest row midpoint during a touch reorder and commits once on release", () => {
    const dispatch = vi.fn();
    const { container } = render(<LayerPanel document={document} selectedLayerId={document.layers[0]!.id} onSelect={vi.fn()} mode="edit" dispatch={dispatch} />);
    const rows = [...container.querySelectorAll<HTMLElement>("[data-layer-order]")];
    rows[0]!.getBoundingClientRect = () => ({ top: 0, bottom: 60, height: 60, left: 0, right: 200, width: 200, x: 0, y: 0, toJSON: vi.fn() });
    rows[1]!.getBoundingClientRect = () => ({ top: 60, bottom: 120, height: 60, left: 0, right: 200, width: 200, x: 0, y: 60, toJSON: vi.fn() });
    const handle = screen.getByLabelText("editorReorder");

    fireEvent.pointerDown(handle, { pointerId: 7, pointerType: "touch", clientY: 10 });
    fireEvent.pointerMove(handle, { pointerId: 7, pointerType: "touch", clientY: 100 });
    expect(rows[1]).toHaveAttribute("data-layer-drop-target", "true");
    expect(dispatch).not.toHaveBeenCalled();

    fireEvent.pointerUp(handle, { pointerId: 7, pointerType: "touch", clientY: 100 });
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith({ type: "reorder", id: document.layers[0]!.id, order: 1 });
  });

  it("syncs hover from the list to the canvas outline", () => {
    const onHover = vi.fn();
    render(
      <>
        <LayerPanel document={document} selectedLayerId={null} hoveredLayerId={document.layers[0]!.id} onSelect={vi.fn()} onHover={onHover} mode="inspect" />
        <LayerCanvas document={document} selectedLayerId={null} hoveredLayerId={document.layers[0]!.id} onSelect={vi.fn()} onHover={onHover} mode="read" />
      </>,
    );
    expect(screen.getByTestId("layer-hover-outline")).toHaveTextContent("Layer 0");
    fireEvent.pointerEnter(screen.getByRole("button", { name: /^Layer 1$/ }));
    expect(onHover).toHaveBeenCalledWith(document.layers[1]!.id);
  });

  it("shows the inspector prompt for a selected layer", () => {
    render(<LayerCanvas document={document} selectedLayerId={document.layers[0]!.id} onSelect={vi.fn()} mode="edit" dispatch={vi.fn()} />);
    expect(screen.getByTestId("layer-inspector")).toHaveTextContent("Woman facing camera");
  });

  it("hides a Base layer description in the inspector", () => {
    render(<LayerCanvas document={document} selectedLayerId={document.layers[1]!.id} onSelect={vi.fn()} mode="edit" dispatch={vi.fn()} />);
    expect(screen.getByTestId("layer-inspector")).toHaveTextContent("Layer 1");
    expect(screen.getByTestId("layer-inspector")).not.toHaveTextContent("Base layer");
  });

  it("staggers canvas layers with the reveal utility", () => {
    render(<LayerCanvas document={document} selectedLayerId={null} onSelect={vi.fn()} mode="read" />);
    expect(screen.getByAltText("Layer 0")).toHaveClass("animate-layer-reveal");
    expect(screen.getByAltText("Layer 1")).toHaveClass("animate-layer-reveal");
  });

  it("hovers the smaller overlapping layer under the pointer", () => {
    const onHover = vi.fn();
    const overlapping = {
      ...document,
      layers: [
        { ...document.layers[0]!, x: 0, y: 0, width: 20, height: 20 },
        { ...document.layers[1]!, x: 5, y: 5, width: 4, height: 4 },
      ],
    };
    const { container } = render(<LayerCanvas document={overlapping} selectedLayerId={null} onSelect={vi.fn()} onHover={onHover} mode="read" />);
    const canvas = container.querySelector<HTMLDivElement>(".origin-top-left");
    expect(canvas).toBeTruthy();
    canvas!.getBoundingClientRect = () => ({ top: 0, bottom: 20, left: 0, right: 20, width: 20, height: 20, x: 0, y: 0, toJSON: vi.fn() });
    fireEvent.pointerMove(canvas!, { clientX: 7, clientY: 7 });
    expect(onHover).toHaveBeenCalledWith(overlapping.layers[1]!.id);
  });

  it("projects temporary mobile visibility into the canvas without dispatching a mutation", () => {
    const dispatch = vi.fn();
    const onVisibility = vi.fn();
    const { rerender } = render(<><LayerPanel document={document} selectedLayerId={document.layers[0]!.id} onSelect={vi.fn()} mode="inspect" dispatch={dispatch} onInspectVisibilityChange={onVisibility} /><LayerCanvas document={document} selectedLayerId={null} onSelect={vi.fn()} mode="read" visibilityOverrides={{}} /></>);
    fireEvent.click(screen.getByRole("button", { name: "Ocultar Layer 0" }));
    expect(dispatch).not.toHaveBeenCalled();
    expect(onVisibility).toHaveBeenCalledWith(document.layers[0]!.id, false);
    rerender(<LayerCanvas document={document} selectedLayerId={null} onSelect={vi.fn()} mode="read" visibilityOverrides={{ [document.layers[0]!.id]: false }} />);
    expect(screen.queryByAltText("Layer 0")).not.toBeInTheDocument();
    expect(screen.getByAltText("Layer 1")).toBeInTheDocument();
  });
});
