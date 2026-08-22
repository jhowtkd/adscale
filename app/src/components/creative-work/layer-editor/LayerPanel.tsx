"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicLayerEditorDocumentV1 } from "@/server/layer-editor/contracts";
import type { LayerEditorCommand } from "./state";

type LayerPanelProps = {
  document: PublicLayerEditorDocumentV1;
  selectedLayerId: string | null;
  onSelect: (id: string) => void;
  mode?: "edit" | "inspect";
  dispatch?: (command: LayerEditorCommand) => void;
};

export function LayerPanel({ document, selectedLayerId, onSelect, mode = "inspect", dispatch }: LayerPanelProps) {
  const selected = document.layers.find((layer) => layer.id === selectedLayerId) ?? null;
  const [draftName, setDraftName] = useState("");
  const [inspectVisibility, setInspectVisibility] = useState<Record<string, boolean>>({});
  const cancelled = useRef(false);

  useEffect(() => {
    setDraftName(selected?.name ?? "");
  }, [selected?.id, selected?.name]);

  useEffect(() => {
    setInspectVisibility(Object.fromEntries(document.layers.map((layer) => [layer.id, layer.visible])));
  }, [document]);

  const commitRename = () => {
    if (!selected || mode !== "edit" || !dispatch) return;
    if (cancelled.current) {
      cancelled.current = false;
      setDraftName(selected.name);
      return;
    }
    const name = draftName.trim().slice(0, 128);
    if (name && name !== selected.name) dispatch({ type: "rename", id: selected.id, name });
    if (!name) setDraftName(selected.name);
  };

  const visible = (layer: PublicLayerEditorDocumentV1["layers"][number]) =>
    mode === "inspect" ? (inspectVisibility[layer.id] ?? layer.visible) : layer.visible;

  const toggleVisibility = (layer: PublicLayerEditorDocumentV1["layers"][number]) => {
    if (mode === "edit") {
      dispatch?.({ type: "visibility", id: layer.id, visible: !layer.visible });
      return;
    }
    setInspectVisibility((current) => ({ ...current, [layer.id]: !visible(layer) }));
  };

  return (
    <aside aria-label="Camadas" className="overflow-y-auto">
      {[...document.layers].sort((left, right) => left.order - right.order).map((layer) => {
        const isSelected = layer.id === selectedLayerId;
        const isVisible = visible(layer);
        return (
          <div key={layer.id} className={isSelected ? "bg-muted p-2" : "p-2"}>
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
            {mode === "edit" && isSelected ? (
              <>
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
                <div className="mt-2 flex gap-2">
                  <button type="button" className="min-h-11 min-w-11" aria-label={isVisible ? `Ocultar ${layer.name}` : `Mostrar ${layer.name}`} onClick={() => toggleVisibility(layer)}>{isVisible ? "Ocultar" : "Mostrar"}</button>
                  <button type="button" className="min-h-11 min-w-11" aria-label="Trazer para frente" onClick={() => dispatch?.({ type: "reorder", id: layer.id, order: 0 })}>Trazer para frente</button>
                  <button type="button" className="min-h-11 min-w-11" aria-label="Enviar para trás" onClick={() => dispatch?.({ type: "reorder", id: layer.id, order: document.layers.length - 1 })}>Enviar para trás</button>
                </div>
              </>
            ) : mode === "inspect" && isSelected ? (
              <button type="button" className="mt-2 min-h-11 min-w-11" aria-label={isVisible ? `Ocultar ${layer.name}` : `Mostrar ${layer.name}`} onClick={() => toggleVisibility(layer)}>{isVisible ? "Ocultar" : "Mostrar"}</button>
            ) : null}
          </div>
        );
      })}
    </aside>
  );
}
