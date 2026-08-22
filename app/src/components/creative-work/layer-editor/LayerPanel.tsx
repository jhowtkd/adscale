"use client";

import { useRef, useState } from "react";
import type { PublicLayerEditorDocumentV1 } from "@/server/layer-editor/contracts";
import type { LayerEditorCommand } from "./state";

type LayerPanelProps = {
  document: PublicLayerEditorDocumentV1;
  selectedLayerId: string | null;
  onSelect: (id: string) => void;
  mode?: "edit" | "inspect" | "read";
  dispatch?: (command: LayerEditorCommand) => void;
  onInspectVisibilityChange?: (id: string, visible: boolean) => void;
};

export function LayerPanel({ document, selectedLayerId, onSelect, mode = "inspect", dispatch, onInspectVisibilityChange }: LayerPanelProps) {
  const [inspectVisibility, setInspectVisibility] = useState<Record<string, boolean>>({});
  const reorder = useRef<{ id: string; pointerId: number } | null>(null);

  const visible = (layer: PublicLayerEditorDocumentV1["layers"][number]) =>
    mode !== "edit" ? (inspectVisibility[layer.id] ?? layer.visible) : layer.visible;

  const toggleVisibility = (layer: PublicLayerEditorDocumentV1["layers"][number]) => {
    if (mode === "edit") {
      dispatch?.({ type: "visibility", id: layer.id, visible: !layer.visible });
      return;
    }
    const next = !visible(layer);
    setInspectVisibility((current) => ({ ...current, [layer.id]: next }));
    onInspectVisibilityChange?.(layer.id, next);
  };

  const beginReorder = (event: React.PointerEvent<HTMLButtonElement>, layerId: string) => {
    if (mode !== "edit" || !dispatch) return;
    reorder.current = { id: layerId, pointerId: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const finishReorder = (event: React.PointerEvent<HTMLButtonElement>) => {
    const active = reorder.current;
    if (!active || active.pointerId !== event.pointerId || mode !== "edit") return;
    reorder.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const target = globalThis.document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-layer-order]");
    const order = target?.dataset.layerOrder;
    if (order !== undefined) dispatch?.({ type: "reorder", id: active.id, order: Number(order) });
  };

  return (
    <aside aria-label="Camadas" className="overflow-y-auto">
      {[...document.layers].sort((left, right) => left.order - right.order).map((layer) => {
        const isSelected = layer.id === selectedLayerId;
        const isVisible = visible(layer);
        return (
          <div key={layer.id} data-layer-order={layer.order} className={isSelected ? "border-l-2 border-primary bg-muted p-2" : "p-2"}>
            <button
              type="button"
              onClick={() => onSelect(layer.id)}
              aria-pressed={isSelected}
              className="flex w-full gap-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={layer.imageUrl} alt="" className="h-10 w-10 object-contain" />
              <span className="text-left">
                {mode === "edit" && isSelected ? null : <b>{layer.name}</b>}
                <small className="block">{layer.width} × {layer.height} · {isVisible ? "Visível" : "Oculta"}</small>
              </span>
            </button>
            {mode === "edit" && isSelected && dispatch ? (
              <>
                <LayerNameEditor key={`${layer.id}:${layer.name}`} layer={layer} dispatch={dispatch} />
                <div className="mt-2 flex gap-2">
                  <button type="button" className="min-h-11 min-w-11 cursor-grab" aria-label={`Reordenar ${layer.name}`} onPointerDown={(event) => beginReorder(event, layer.id)} onPointerUp={finishReorder}>↕</button>
                  <button type="button" className="min-h-11 min-w-11" aria-label={isVisible ? `Ocultar ${layer.name}` : `Mostrar ${layer.name}`} onClick={() => toggleVisibility(layer)}>{isVisible ? "Ocultar" : "Mostrar"}</button>
                  <button type="button" className="min-h-11 min-w-11" aria-label="Trazer para frente" onClick={() => dispatch?.({ type: "reorder", id: layer.id, order: 0 })}>Trazer para frente</button>
                  <button type="button" className="min-h-11 min-w-11" aria-label="Enviar para trás" onClick={() => dispatch?.({ type: "reorder", id: layer.id, order: document.layers.length - 1 })}>Enviar para trás</button>
                </div>
              </>
            ) : mode !== "edit" && isSelected ? (
              <button type="button" className="mt-2 min-h-11 min-w-11" aria-label={isVisible ? `Ocultar ${layer.name}` : `Mostrar ${layer.name}`} onClick={() => toggleVisibility(layer)}>{isVisible ? "Ocultar" : "Mostrar"}</button>
            ) : null}
          </div>
        );
      })}
    </aside>
  );
}

function LayerNameEditor({
  layer,
  dispatch,
}: {
  layer: PublicLayerEditorDocumentV1["layers"][number];
  dispatch: (command: LayerEditorCommand) => void;
}) {
  const [draftName, setDraftName] = useState(layer.name);
  const cancelled = useRef(false);

  const commitRename = () => {
    if (cancelled.current) {
      cancelled.current = false;
      setDraftName(layer.name);
      return;
    }
    const name = draftName.trim().slice(0, 128);
    if (name && name !== layer.name) dispatch({ type: "rename", id: layer.id, name });
    if (!name) setDraftName(layer.name);
  };

  return (
    <input
      aria-label="Nome da camada"
      value={draftName}
      maxLength={128}
      onChange={(event) => setDraftName(event.target.value)}
      onBlur={commitRename}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          cancelled.current = true;
          event.currentTarget.blur();
        }
      }}
      className="mt-2 w-full"
    />
  );
}
