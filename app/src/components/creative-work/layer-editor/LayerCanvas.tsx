"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { PublicLayerEditorDocumentV1 } from "@/server/layer-editor/contracts";
import type { LayerEditorCommand } from "./state";

type LayerCanvasProps = {
  document: PublicLayerEditorDocumentV1;
  selectedLayerId: string | null;
  hoveredLayerId?: string | null;
  onSelect: (id: string) => void;
  onHover?: (id: string | null) => void;
  onEditWithAi?: () => void;
  mode: "edit" | "read";
  dispatch?: (command: LayerEditorCommand) => void;
  visibilityOverrides?: Record<string, boolean>;
};

type Box = { x: number; y: number; width: number; height: number };
type Handle = "move" | "north-west" | "north-east" | "south-west" | "south-east";
type PointerGesture = { pointerId: number; layerId: string; handle: Handle; startClientX: number; startClientY: number; start: Box; current: Box };
type ZoomMode = "fit" | number;

const ZOOM_PRESETS = [25, 50, 75, 100, 150, 200] as const;

function visibleDescription(layer: PublicLayerEditorDocumentV1["layers"][number]) {
  if (!layer.description || layer.description === "Base layer") return null;
  return layer.description;
}

function layerAtPoint(
  layers: PublicLayerEditorDocumentV1["layers"],
  point: { x: number; y: number },
  visibilityOverrides: Record<string, boolean>,
  preview: Box | null,
  selectedId: string | null,
) {
  const hits = layers.filter((layer) => {
    if (!(visibilityOverrides[layer.id] ?? layer.visible)) return false;
    const box = layer.id === selectedId && preview ? preview : layer;
    return point.x >= box.x && point.y >= box.y && point.x <= box.x + box.width && point.y <= box.y + box.height;
  });
  if (hits.length === 0) return null;
  return hits.reduce((smallest, layer) => (layer.width * layer.height < smallest.width * smallest.height ? layer : smallest));
}

function fitPercent(stage: { width: number; height: number }, canvas: { width: number; height: number }) {
  const pad = 48;
  const scaleX = (stage.width - pad) / canvas.width;
  const scaleY = (stage.height - pad) / canvas.height;
  return Math.max(10, Math.min(200, Math.floor(Math.min(scaleX, scaleY) * 100)));
}

export function LayerCanvas({ document, selectedLayerId, hoveredLayerId = null, onSelect, onHover, onEditWithAi, mode, dispatch, visibilityOverrides = {} }: LayerCanvasProps) {
  const t = useTranslations("dashboard.home.composer.results");
  const [zoomMode, setZoomMode] = useState<ZoomMode>("fit");
  const [fitZoom, setFitZoom] = useState(100);
  const [preview, setPreview] = useState<Box | null>(null);
  const gesture = useRef<PointerGesture | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const selected = document.layers.find((layer) => layer.id === selectedLayerId);
  const hovered = document.layers.find((layer) => layer.id === hoveredLayerId && layer.id !== selectedLayerId);
  const selectedDescription = selected ? visibleDescription(selected) : null;
  const zoom = zoomMode === "fit" ? fitZoom : zoomMode;
  // The canvas is scaled as a whole, so handles expand in canvas units at
  // low zoom to retain a 44 CSS-pixel touch target.
  const resizeHitTarget = Math.max(44, 44 / Math.max(zoom / 100, 0.01));
  const displayWidth = document.canvas.width * (zoom / 100);
  const displayHeight = document.canvas.height * (zoom / 100);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const next = fitPercent({ width: stage.clientWidth, height: stage.clientHeight }, document.canvas);
      setFitZoom((current) => (current === next ? current : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [document.canvas.height, document.canvas.width]);

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
      <div
        ref={stageRef}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[var(--surface-inset)]"
      >
        <div
          className="relative shrink-0 overflow-hidden rounded-[var(--radius-object)] shadow-[var(--shadow-floating)]"
          style={{ width: displayWidth, height: displayHeight }}
        >
          <div
            ref={canvasRef}
            className="absolute left-0 top-0 origin-top-left"
            style={{ width: document.canvas.width, height: document.canvas.height, transform: `scale(${zoom / 100})` }}
            onPointerMove={(event) => {
              if (gesture.current) return;
              const bounds = canvasRef.current?.getBoundingClientRect();
              if (!bounds) return;
              const hit = layerAtPoint(document.layers, {
                x: (event.clientX - bounds.left) / (zoom / 100),
                y: (event.clientY - bounds.top) / (zoom / 100),
              }, visibilityOverrides, preview, selectedLayerId);
              onHover?.(hit?.id ?? null);
            }}
            onPointerLeave={() => { if (!gesture.current) onHover?.(null); }}
          >
            {[...document.layers].sort((left, right) => right.order - left.order).filter((layer) => visibilityOverrides[layer.id] ?? layer.visible).map((layer, index) => {
              const box = layer.id === selected?.id && preview ? preview : layer;
              return (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={layer.id}
                  draggable={false}
                  src={layer.imageUrl}
                  alt={layer.name}
                  onClick={() => onSelect(layer.id)}
                  className="absolute animate-layer-reveal"
                  style={{ left: box.x, top: box.y, width: box.width, height: box.height, zIndex: 100 - layer.order, ["--layer-reveal-index" as string]: index }}
                />
              );
            })}
            {selected ? (
              <div
                role="group"
                aria-label={t("editorSelectedLayer")}
                tabIndex={mode === "edit" ? 0 : undefined}
                onKeyDown={transformFromKey}
                onPointerDown={beginPointerTransform}
                onPointerMove={movePointerTransform}
                onPointerUp={(event) => finishPointerTransform(event, true)}
                onPointerCancel={(event) => finishPointerTransform(event, false)}
                className={mode === "edit" ? "absolute z-[var(--layer-skip-link)] touch-none border border-[var(--selection-border)]" : "absolute z-[var(--layer-skip-link)] border border-muted"}
                style={{ left: preview?.x ?? selected.x, top: preview?.y ?? selected.y, width: preview?.width ?? selected.width, height: preview?.height ?? selected.height }}
              >
                {mode === "edit" && [
                  ["north-west", "top-0 left-0"],
                  ["north-east", "top-0 right-0"],
                  ["south-west", "bottom-0 left-0"],
                  ["south-east", "bottom-0 right-0"],
                ].map(([handle, position]) => <span key={handle} data-testid={`layer-resize-handle-${handle}`} data-handle={handle} aria-hidden="true" className={`absolute z-[var(--layer-raised)] flex -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center ${position}`} style={{ width: resizeHitTarget, height: resizeHitTarget }}><span data-handle={handle} className="h-1.5 w-1.5 rounded-full bg-[var(--selection-bg)]" /></span>)}
                <aside
                  data-testid="layer-inspector"
                  className="absolute bottom-full left-0 z-[var(--layer-raised)] mb-2 min-w-44 max-w-72 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-overlay)]/95 px-3 py-2 text-left shadow-[var(--shadow-floating)] backdrop-blur-sm"
                  style={{ transform: `scale(${100 / zoom})`, transformOrigin: "bottom left" }}
                >
                  <p className="text-sm font-medium text-[var(--text-primary)]">{selected.name}</p>
                  {selectedDescription ? <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{t("elementPrompt")}: {selectedDescription}</p> : null}
                  {mode === "edit" ? <button type="button" className="mt-2 min-h-11 text-sm font-medium text-[var(--text-primary)] underline underline-offset-2" onClick={onEditWithAi}>{t("editWithAi")}</button> : null}
                </aside>
              </div>
            ) : null}
            {hovered ? (
              <div
                data-testid="layer-hover-outline"
                className="pointer-events-none absolute border border-[var(--selection-border)]/50"
                style={{ left: hovered.x, top: hovered.y, width: hovered.width, height: hovered.height, zIndex: 120 }}
              >
                <span className="absolute left-0 top-0 bg-[var(--surface-overlay)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-primary)]">{hovered.name}</span>
              </div>
            ) : null}
          </div>
        </div>
        <div className="absolute bottom-3 left-3 flex flex-wrap gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-overlay)]/90 p-1 shadow-[var(--shadow-floating)] backdrop-blur-sm">
          <button
            type="button"
            className="min-h-11 min-w-11 rounded-full px-2 text-xs font-medium text-[var(--text-secondary)] aria-pressed:bg-[var(--surface-inset)] aria-pressed:text-[var(--text-primary)]"
            aria-pressed={zoomMode === "fit"}
            onClick={() => setZoomMode("fit")}
          >
            {t("editorFitCanvas")}
          </button>
          {ZOOM_PRESETS.map((value) => (
            <button
              key={value}
              type="button"
              className="min-h-11 min-w-11 rounded-full px-2 text-xs text-[var(--text-secondary)] aria-pressed:bg-[var(--surface-inset)] aria-pressed:text-[var(--text-primary)]"
              aria-pressed={zoomMode === value}
              onClick={() => setZoomMode(value)}
            >
              {value}%
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
