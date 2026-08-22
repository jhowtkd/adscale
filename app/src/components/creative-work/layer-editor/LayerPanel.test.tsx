import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PublicLayerEditorDocumentV1 } from "@/server/layer-editor/contracts";
import { LayerCanvas } from "./LayerCanvas";
import { LayerPanel } from "./LayerPanel";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string, values?: { name?: string }) => key === "editorHide" ? `Ocultar ${values?.name}` : key === "editorShow" ? `Mostrar ${values?.name}` : key === "editorLayers" ? "Camadas" : key === "editorLayerName" ? "Nome da camada" : key }));

const document: PublicLayerEditorDocumentV1 = {
  schemaVersion: 1, revision: 1, canvas: { width: 20, height: 20 }, updatedAt: "2026-08-22T00:00:00.000Z", regeneration: null,
  lease: { mode: "read", leaseId: null, heldByName: null, expiresAt: null },
  layers: ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"].map((id, order) => ({ id, order, name: `Layer ${order}`, visible: true, x: 0, y: 0, width: 20, height: 20, currentKind: "source" as const, imageUrl: `current-${order}`, source: { order, name: `Layer ${order}`, visible: true, x: 0, y: 0, width: 20, height: 20, imageUrl: `source-${order}` } })),
};

describe("LayerPanel inspect visibility", () => {
  it("keeps layer rows and visibility controls at the 44px touch target", () => {
    const dispatch = vi.fn();
    render(<LayerPanel document={document} selectedLayerId={document.layers[0]!.id} onSelect={vi.fn()} mode="edit" dispatch={dispatch} />);

    expect(screen.getByRole("button", { name: /Layer 0/ })).toHaveClass("min-h-11");
    expect(screen.getByRole("button", { name: "Ocultar Layer 0" })).toHaveClass("min-h-11", "min-w-11");
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
