import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PublicLayerEditorDocumentV1 } from "@/server/layer-editor/contracts";
import { LayerCanvas } from "./LayerCanvas";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => ({
    editorCanvas: "Canvas de camadas",
    editorSelectedLayer: "Camada selecionada",
    elementPrompt: "Prompt do elemento",
    editorVisibility: "Visibilidade",
    editWithAi: "Editar com IA",
    editorResizeHandle: "Redimensionar {handle}",
  }[key] ?? key),
}));

const mockDocument: PublicLayerEditorDocumentV1 = {
  schemaVersion: 1,
  revision: 1,
  canvas: { width: 1080, height: 1080 },
  lease: { mode: "edit", leaseId: "lease-1", heldByName: null, expiresAt: null },
  regeneration: null,
  updatedAt: "2026-08-22T00:00:00.000Z",
  layers: [
    {
      id: "layer-1",
      order: 0,
      name: "Mulher",
      visible: true,
      x: 100,
      y: 100,
      width: 400,
      height: 600,
      currentKind: "source",
      imageUrl: "https://example.test/woman.png",
      description: "Young woman smiling in office setting",
      source: { order: 0, name: "Mulher", visible: true, x: 100, y: 100, width: 400, height: 600, imageUrl: "https://example.test/woman.png" },
    },
    {
      id: "layer-2",
      order: 1,
      name: "Fundo",
      visible: true,
      x: 0,
      y: 0,
      width: 1080,
      height: 1080,
      currentKind: "source",
      imageUrl: "https://example.test/bg.png",
      description: "Base layer",
      source: { order: 1, name: "Fundo", visible: true, x: 0, y: 0, width: 1080, height: 1080, imageUrl: "https://example.test/bg.png" },
    },
  ],
};

describe("LayerCanvas", () => {
  it("renders layers and triggers onSelect when an image is clicked", () => {
    const onSelect = vi.fn();
    render(
      <LayerCanvas
        document={mockDocument}
        selectedLayerId={null}
        onSelect={onSelect}
        mode="edit"
      />,
    );

    const womanImg = screen.getByAltText("Mulher");
    expect(womanImg).toBeInTheDocument();
    fireEvent.click(womanImg);
    expect(onSelect).toHaveBeenCalledWith("layer-1");
  });

  it("shows selection bounding box and inspector popover with semantic prompt when selected", () => {
    const onEditWithAi = vi.fn();
    render(
      <LayerCanvas
        document={mockDocument}
        selectedLayerId="layer-1"
        onSelect={vi.fn()}
        onEditWithAi={onEditWithAi}
        mode="edit"
      />,
    );

    expect(screen.getByRole("group", { name: "Camada selecionada" })).toBeInTheDocument();
    const inspector = screen.getByTestId("layer-inspector");
    expect(inspector).toBeInTheDocument();
    expect(inspector).toHaveTextContent("Mulher");
    expect(inspector).toHaveTextContent("Prompt do elemento: Young woman smiling in office setting");

    const editBtn = screen.getByRole("button", { name: "Editar com IA" });
    fireEvent.click(editBtn);
    expect(onEditWithAi).toHaveBeenCalledOnce();
  });

  it("renders hover outline when hoveredLayerId is provided and distinct from selected", () => {
    render(
      <LayerCanvas
        document={mockDocument}
        selectedLayerId="layer-1"
        hoveredLayerId="layer-2"
        onSelect={vi.fn()}
        mode="edit"
      />,
    );

    const hoverOutline = screen.getByTestId("layer-hover-outline");
    expect(hoverOutline).toBeInTheDocument();
    expect(hoverOutline).toHaveTextContent("Fundo");
  });
});
