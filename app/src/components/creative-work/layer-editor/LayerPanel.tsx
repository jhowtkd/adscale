"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { BringToFront, Eye, EyeOff, GripVertical, SendToBack } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  const t = useTranslations("dashboard.home.composer.results");
  const [inspectVisibility, setInspectVisibility] = useState<Record<string, boolean>>({});
  const [reorderTarget, setReorderTarget] = useState<number | null>(null);
  const panel = useRef<HTMLElement>(null);
  const reorder = useRef<{ id: string; pointerId: number; order: number } | null>(null);

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
    const order = document.layers.find((layer) => layer.id === layerId)?.order ?? 0;
    reorder.current = { id: layerId, pointerId: event.pointerId, order };
    setReorderTarget(order);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const moveReorder = (event: React.PointerEvent<HTMLButtonElement>) => {
    const active = reorder.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const rows = [...(panel.current?.querySelectorAll<HTMLElement>("[data-layer-order]") ?? [])];
    const nearest = rows.reduce<HTMLElement | null>((best, row) => {
      if (!best) return row;
      const distance = Math.abs(event.clientY - (row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2));
      const bestDistance = Math.abs(event.clientY - (best.getBoundingClientRect().top + best.getBoundingClientRect().height / 2));
      return distance < bestDistance ? row : best;
    }, null);
    const order = Number(nearest?.dataset.layerOrder);
    if (Number.isInteger(order)) {
      active.order = order;
      setReorderTarget(order);
    }
  };
  const finishReorder = (event: React.PointerEvent<HTMLButtonElement>) => {
    const active = reorder.current;
    if (!active || active.pointerId !== event.pointerId || mode !== "edit") return;
    reorder.current = null;
    setReorderTarget(null);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId);
    dispatch?.({ type: "reorder", id: active.id, order: active.order });
  };
  const cancelReorder = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (reorder.current?.pointerId !== event.pointerId) return;
    reorder.current = null;
    setReorderTarget(null);
  };

  return (
    <section ref={panel} aria-label={t("editorLayers")} className="overflow-y-auto">
      {[...document.layers].sort((left, right) => left.order - right.order).map((layer) => {
        const isSelected = layer.id === selectedLayerId;
        const isVisible = visible(layer);
        return (
          <div key={layer.id} data-layer-order={layer.order} data-layer-drop-target={reorderTarget === layer.order || undefined} className={`${isSelected ? "border-l-2 border-[var(--selection-border)] bg-muted" : ""} ${reorderTarget === layer.order ? "ring-2 ring-[var(--selection-border)]" : ""} p-2`}>
            <button
              type="button"
              onClick={() => onSelect(layer.id)}
              aria-pressed={isSelected}
              className="flex min-h-11 w-full gap-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={layer.imageUrl} alt="" className="h-10 w-10 object-contain" />
              <span className="text-left">
                {mode === "edit" && isSelected ? null : <b>{layer.name}</b>}
                <small className="block">{layer.width} × {layer.height} · {t("editorVisibility")}: {isVisible ? "✓" : "—"}</small>
              </span>
            </button>
            {mode === "edit" && isSelected && dispatch ? (
              <>
                <LayerNameEditor key={`${layer.id}:${layer.name}`} layer={layer} dispatch={dispatch} />
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="icon" className="min-h-11 min-w-11 touch-none cursor-grab" aria-label={t("editorReorder", { name: layer.name })} title={t("editorReorder", { name: layer.name })} onPointerDown={(event) => beginReorder(event, layer.id)} onPointerMove={moveReorder} onPointerUp={finishReorder} onPointerCancel={cancelReorder}><GripVertical /></Button>
                  <Button type="button" variant="outline" size="icon" className="min-h-11 min-w-11" aria-label={isVisible ? t("editorHide", { name: layer.name }) : t("editorShow", { name: layer.name })} title={isVisible ? t("editorHide", { name: layer.name }) : t("editorShow", { name: layer.name })} onClick={() => toggleVisibility(layer)}>{isVisible ? <EyeOff /> : <Eye />}</Button>
                  <Button type="button" variant="outline" size="icon" className="min-h-11 min-w-11" aria-label={t("editorBringForward")} title={t("editorBringForward")} onClick={() => dispatch?.({ type: "reorder", id: layer.id, order: 0 })}><BringToFront /></Button>
                  <Button type="button" variant="outline" size="icon" className="min-h-11 min-w-11" aria-label={t("editorSendBack")} title={t("editorSendBack")} onClick={() => dispatch?.({ type: "reorder", id: layer.id, order: document.layers.length - 1 })}><SendToBack /></Button>
                </div>
              </>
            ) : mode !== "edit" && isSelected ? (
              <Button type="button" variant="outline" size="icon" className="mt-2 min-h-11 min-w-11" aria-label={isVisible ? t("editorHide", { name: layer.name }) : t("editorShow", { name: layer.name })} title={isVisible ? t("editorHide", { name: layer.name }) : t("editorShow", { name: layer.name })} onClick={() => toggleVisibility(layer)}>{isVisible ? <EyeOff /> : <Eye />}</Button>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}

function LayerNameEditor({
  layer,
  dispatch,
}: {
  layer: PublicLayerEditorDocumentV1["layers"][number];
  dispatch: (command: LayerEditorCommand) => void;
}) {
  const t = useTranslations("dashboard.home.composer.results");
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
      aria-label={t("editorLayerName")}
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
      className="mt-2 min-h-11 w-full"
    />
  );
}
