"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { PublicLayerEditorDocumentV1 } from "@/server/layer-editor/contracts";
import type { LayerEditorCommand } from "./state";

type LayerCanvasProps = {
  document: PublicLayerEditorDocumentV1;
  selectedLayerId: string | null;
  onSelect: (id: string) => void;
  mode: "edit" | "read";
  dispatch?: (command: LayerEditorCommand) => void;
  visibilityOverrides?: Record<string, boolean>;
};

type Box = { x: number; y: number; width: number; height: number };
type Handle = "move" | "north-west" | "north-east" | "south-west" | "south-east";
type PointerGesture = { pointerId: number; layerId: string; handle: Handle; startClientX: number; startClientY: number; start: Box; current: Box };

export function LayerCanvas({ document, selectedLayerId, onSelect, mode, dispatch, visibilityOverrides = {} }: LayerCanvasProps) {
  const t = useTranslations("dashboard.home.composer.results");
  const [zoom, setZoom] = useState(100);
  const [preview, setPreview] = useState<Box | null>(null);
  const gesture = useRef<PointerGesture | null>(null);
  const selected = document.layers.find((layer) => layer.id === selectedLayerId);

  const boxAtPointer = (current: PointerGesture, clientX: number, clientY: number): Box => {
    const deltaX = (clientX - current.startClientX) / (zoom / 100);
    const deltaY = (clientY - current.startClientY) / (zoom / 100);
    const next = { ...current.start };
    if (current.handle === "move") {
      next.x += deltaX;
      next.y += deltaY;
    }
    if (current.handle === "north-west" || current.handle === "south-west") {
      next.x += deltaX;
      next.width -= deltaX;
    }
    if (current.handle === "north-west" || current.handle === "north-east") {
      next.y += deltaY;
      next.height -= deltaY;
    }
    if (current.handle === "north-east" || current.handle === "south-east") next.width += deltaX;
    if (current.handle === "south-west" || current.handle === "south-east") next.height += deltaY;
    return { ...next, width: Math.max(1, next.width), height: Math.max(1, next.height) };
  };

  const beginPointerTransform = (event: React.PointerEvent<HTMLDivElement>) => {
    if (mode !== "edit" || !selected || !dispatch) return;
    const target = event.target as HTMLElement;
    const handle = (target.dataset.handle as Handle | undefined) ?? "move";
    const start = { x: selected.x, y: selected.y, width: selected.width, height: selected.height };
    gesture.current = { pointerId: event.pointerId, layerId: selected.id, handle, startClientX: event.clientX, startClientY: event.clientY, start, current: start };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    setPreview(start);
  };

  const movePointerTransform = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    current.current = boxAtPointer(current, event.clientX, event.clientY);
    setPreview(current.current);
  };

  const finishPointerTransform = (event: React.PointerEvent<HTMLDivElement>, commit: boolean) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    gesture.current = null;
    setPreview(null);
    if (commit && mode === "edit" && dispatch) {
      dispatch({ type: "transform", id: current.layerId, ...current.current });
    }
  };

  const transformFromKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (mode !== "edit" || !selected || !dispatch) return;
    const distance = event.shiftKey ? 10 : 1;
    let { x, y, width, height } = selected;
    let handled = true;

    if (event.altKey) {
      if (event.key === "ArrowLeft") width -= distance;
      else if (event.key === "ArrowRight") width += distance;
      else if (event.key === "ArrowUp") height -= distance;
      else if (event.key === "ArrowDown") height += distance;
      else handled = false;
    } else if (event.key === "ArrowLeft") x -= distance;
    else if (event.key === "ArrowRight") x += distance;
    else if (event.key === "ArrowUp") y -= distance;
    else if (event.key === "ArrowDown") y += distance;
    else handled = false;

    if (!handled) return;
    event.preventDefault();
    dispatch({ type: "transform", id: selected.id, x, y, width, height });
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label={t("editorCanvas")}>
      <div className="flex gap-1 p-2">
        {[25, 50, 75, 100, 150, 200].map((value) => (
          <button key={value} type="button" className="min-h-11 min-w-11" aria-pressed={zoom === value} onClick={() => setZoom(value)}>{value}%</button>
        ))}
      </div>
      <div className="relative flex-1 overflow-auto bg-[linear-gradient(45deg,#ddd_25%,transparent_25%),linear-gradient(-45deg,#ddd_25%,transparent_25%)] bg-[size:16px_16px]">
        <div className="relative origin-top-left" style={{ width: document.canvas.width, height: document.canvas.height, transform: `scale(${zoom / 100})` }}>
          {[...document.layers].sort((left, right) => right.order - left.order).filter((layer) => visibilityOverrides[layer.id] ?? layer.visible).map((layer) => {
            const box = layer.id === selected?.id && preview ? preview : layer;
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={layer.id} draggable={false} src={layer.imageUrl} alt={layer.name} onClick={() => onSelect(layer.id)} className="absolute" style={{ left: box.x, top: box.y, width: box.width, height: box.height, zIndex: 100 - layer.order }} />
            );
          })}
          {selected ? (
            <div
              aria-label={t("editorSelectedLayer")}
              tabIndex={mode === "edit" ? 0 : undefined}
              onKeyDown={transformFromKey}
              onPointerDown={beginPointerTransform}
              onPointerMove={movePointerTransform}
              onPointerUp={(event) => finishPointerTransform(event, true)}
              onPointerCancel={(event) => finishPointerTransform(event, false)}
              className={mode === "edit" ? "absolute z-[200] border-2 border-primary" : "absolute z-[200] border-2 border-muted"}
              style={{ left: preview?.x ?? selected.x, top: preview?.y ?? selected.y, width: preview?.width ?? selected.width, height: preview?.height ?? selected.height }}
            >
              {mode === "edit" && [
                ["north-west", "top-0 left-0"],
                ["north-east", "top-0 right-0"],
                ["south-west", "bottom-0 left-0"],
                ["south-east", "bottom-0 right-0"],
              ].map(([handle, position]) => <span key={handle} data-handle={handle} aria-label={t("editorResizeHandle", { handle })} className={`absolute z-10 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center ${position}`}><span data-handle={handle} className="h-2 w-2 rounded-sm bg-primary" /></span>)}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
