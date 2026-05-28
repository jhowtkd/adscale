"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus, Minus, Maximize2, X, Columns2, FlipHorizontal } from "lucide-react";
import type { Derivation } from "@/lib/mock-data";
import { platformColors } from "@/lib/mock-data";
import BeforeAfterSlider from "./BeforeAfterSlider";

// ============================================
// Types
// ============================================

interface DerivationComparisonModalProps {
  derivations: Derivation[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onRemove?: (id: string) => void;
}

interface ZoomState {
  scale: number;
  translateX: number;
  translateY: number;
}

// ============================================
// Helpers
// ============================================

function getScoreLabel(score: number | null | undefined, t: (key: string) => string) {
  if (score == null) return null;
  if (score >= 80) return t("scoreStrong");
  if (score >= 60) return t("scoreAdjust");
  return t("scoreWeak");
}

function getQaLabelKey(status: string | null | undefined) {
  if (status === "ready") return "qaReady";
  if (status === "warning") return "qaWarning";
  if (status === "review") return "qaReview";
  return null;
}

function getGridCols(count: number): string {
  if (count <= 2) return "grid-cols-1 md:grid-cols-2";
  if (count === 3) return "grid-cols-1 md:grid-cols-3";
  if (count === 4) return "grid-cols-1 md:grid-cols-2 lg:grid-cols-2";
  if (count <= 6) return "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";
  return "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
}

// ============================================
// Zoomable Image Component
// ============================================

function ZoomableImage({
  derivation,
  zoom,
  onZoomChange,
}: {
  derivation: Derivation;
  zoom: ZoomState;
  onZoomChange: (zoom: ZoomState) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const zoomStart = useRef(zoom);

  const platformStyle = platformColors[derivation.platform] || {
    bg: "rgba(99,102,241,0.12)",
    text: "#818cf8",
  };
  const aspectClass =
    {
      "1:1": "aspect-square",
      "4:5": "aspect-[4/5]",
      "9:16": "aspect-[9/16]",
    }[derivation.format ?? ""] ?? "aspect-square";

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.min(Math.max(zoom.scale * delta, 1), 5);
      onZoomChange({ ...zoom, scale: newScale });
    },
    [zoom, onZoomChange]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (zoom.scale <= 1) return;
      setIsDragging(true);
      dragStart.current = { x: e.clientX, y: e.clientY };
      zoomStart.current = zoom;
    },
    [zoom.scale, zoom]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      onZoomChange({
        ...zoom,
        translateX: zoomStart.current.translateX + dx,
        translateY: zoomStart.current.translateY + dy,
      });
    },
    [isDragging, zoom, onZoomChange]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative overflow-hidden rounded-xl bg-muted border border-[var(--border-dim)] cursor-grab active:cursor-grabbing",
        aspectClass,
        zoom.scale <= 1 && "cursor-default"
      )}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div
        className="w-full h-full transition-transform duration-100"
        style={{
          transform: `translate(${zoom.translateX}px, ${zoom.translateY}px) scale(${zoom.scale})`,
        }}
      >
        {derivation.imageUrl ? (
          <img
            src={derivation.imageUrl}
            alt={derivation.name}
            className="w-full h-full object-contain"
            draggable={false}
          />
        ) : (
          <div
            className="w-full h-full"
            style={{
              background: `linear-gradient(135deg, 
                ${platformStyle.bg} 0%, 
                var(--surface-raised) 50%, 
                ${platformStyle.bg} 100%)`,
            }}
          >
            <div className="w-full h-full flex items-center justify-center">
              <span
                className="text-6xl font-bold opacity-20"
                style={{ color: platformStyle.text }}
              >
                {derivation.name.charAt(0)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// Comparison Column
// ============================================

function ComparisonColumn({
  derivation,
  index,
  t,
  zoom,
  onZoomChange,
  onApprove,
  onReject,
  onRemove,
}: {
  derivation: Derivation;
  index: number;
  t: (key: string) => string;
  zoom: ZoomState;
  onZoomChange: (zoom: ZoomState) => void;
  onApprove?: () => void;
  onReject?: () => void;
  onRemove?: () => void;
}) {
  const qaLabelKey = getQaLabelKey(derivation.qaStatus);
  const qaStatusColor = (
    {
      ready: "text-[var(--accent-mint)]",
      warning: "text-amber-500",
      review: "text-[var(--accent-rose)]",
    } as Record<string, string>
  )[derivation.qaStatus ?? ""] ?? "text-[var(--text-muted)]";

  const label = String.fromCharCode(65 + index); // A, B, C, D...

  return (
    <div className="flex flex-col gap-3">
      {/* Header with label + remove */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          {label}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-xs text-[var(--text-muted)]">
            {Math.round(zoom.scale * 100)}%
          </span>
          {onRemove && (
            <button
              onClick={onRemove}
              className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--accent-rose)] hover:bg-[var(--accent-rose)]/10 transition-all duration-150"
              title={t("removeFromCompare")}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Image with Zoom */}
      <ZoomableImage
        derivation={derivation}
        zoom={zoom}
        onZoomChange={onZoomChange}
      />

      {/* Zoom controls per cell */}
      <div className="flex items-center justify-center gap-1">
        <button
          onClick={() => {
            const newScale = Math.max(zoom.scale - 0.5, 1);
            onZoomChange({ scale: newScale, translateX: 0, translateY: 0 });
          }}
          className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-all duration-150"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={() => {
            const newScale = Math.min(zoom.scale + 0.5, 5);
            onZoomChange({ ...zoom, scale: newScale });
          }}
          className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-all duration-150"
        >
          <Plus size={14} />
        </button>
        <button
          onClick={() => onZoomChange({ scale: 1, translateX: 0, translateY: 0 })}
          className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-all duration-150"
        >
          <Maximize2 size={14} />
        </button>
      </div>

      {/* Metadata */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-[var(--text-primary)] truncate">
          {derivation.name}
        </h4>

        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{
              backgroundColor: platformColors[derivation.platform]?.bg || "rgba(99,102,241,0.12)",
              color: platformColors[derivation.platform]?.text || "#818cf8",
            }}
          >
            {derivation.platform}
          </span>
          {derivation.format && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-[var(--surface-raised)] text-[var(--text-secondary)] border border-[var(--border-dim)]">
              {derivation.format}
            </span>
          )}
          {derivation.ctaText && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-[var(--surface-raised)] text-[var(--text-secondary)] border border-[var(--border-dim)]">
              {derivation.ctaText}
            </span>
          )}
        </div>

        {derivation.qualityScore != null && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-[var(--text-muted)]">
              {t("creativeScore")}:
            </span>
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              {derivation.qualityScore}
            </span>
            <span className="text-xs text-[var(--text-muted)]">
              {getScoreLabel(derivation.qualityScore, t)}
            </span>
          </div>
        )}

        {qaLabelKey && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-[var(--text-muted)]">
              {t("qaStatus")}:
            </span>
            <span className={cn("text-xs font-medium", qaStatusColor)}>
              {t(qaLabelKey)}
            </span>
          </div>
        )}

        <p className="text-xs text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
          {derivation.prompt}
        </p>
      </div>

      {/* Actions */}
      {(onApprove || onReject) && (
        <div className="flex gap-2 pt-1">
          {onApprove && (
            <Button
              size="sm"
              variant="outline"
              onClick={onApprove}
              className="flex-1 border-[var(--accent-mint)] text-[var(--accent-mint)] hover:bg-[var(--accent-mint-dim)] text-xs"
            >
              {t("approve")}
            </Button>
          )}
          {onReject && (
            <Button
              size="sm"
              variant="outline"
              onClick={onReject}
              className="flex-1 border-[var(--accent-rose)] text-[var(--accent-rose)] hover:bg-[var(--accent-rose)]/10 text-xs"
            >
              {t("reject")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// Main Component
// ============================================

type ViewMode = "grid" | "slider";
type SliderDirection = "horizontal" | "vertical";

export default function DerivationComparisonModal({
  derivations,
  open,
  onOpenChange,
  onApprove,
  onReject,
  onRemove,
}: DerivationComparisonModalProps) {
  const t = useTranslations("derivation");
  const [zooms, setZooms] = useState<Record<string, ZoomState>>({});
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sliderDirection, setSliderDirection] = useState<SliderDirection>("horizontal");

  const isExactlyTwo = derivations.length === 2;

  // Initialize zoom states for new derivations
  useEffect(() => {
    setZooms((prev) => {
      const next: Record<string, ZoomState> = { ...prev };
      derivations.forEach((d) => {
        if (!next[d.id]) {
          next[d.id] = { scale: 1, translateX: 0, translateY: 0 };
        }
      });
      // Clean up removed derivations
      Object.keys(next).forEach((id) => {
        if (!derivations.find((d) => d.id === id)) {
          delete next[id];
        }
      });
      return next;
    });
  }, [derivations]);

  const handleZoomChange = useCallback((id: string, zoom: ZoomState) => {
    setZooms((prev) => ({ ...prev, [id]: zoom }));
  }, []);

  const gridCols = getGridCols(derivations.length);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl w-[calc(100%-2rem)] p-0 overflow-hidden sm:max-w-7xl max-h-[90vh]">
        <DialogHeader className="px-6 pt-6 pb-2">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base font-semibold text-[var(--text-primary)]">
              {t("compareTitle")} ({derivations.length})
            </DialogTitle>

            {/* View mode toggle (only for 2 items) */}
            {isExactlyTwo && (
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-[var(--surface-raised)] rounded-md border border-[var(--border-dim)]">
                  <button
                    onClick={() => setViewMode("grid")}
                    className={cn(
                      "p-2 rounded-md transition-all duration-150",
                      viewMode === "grid"
                        ? "bg-[var(--accent-mint)]/10 text-[var(--accent-mint)]"
                        : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    )}
                    title={t("gridView")}
                  >
                    <Columns2 size={16} />
                  </button>
                  <button
                    onClick={() => setViewMode("slider")}
                    className={cn(
                      "p-2 rounded-md transition-all duration-150",
                      viewMode === "slider"
                        ? "bg-[var(--accent-mint)]/10 text-[var(--accent-mint)]"
                        : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    )}
                    title={t("sliderView")}
                  >
                    <FlipHorizontal size={16} />
                  </button>
                </div>

                {viewMode === "slider" && (
                  <div className="flex items-center bg-[var(--surface-raised)] rounded-md border border-[var(--border-dim)]">
                    <button
                      onClick={() => setSliderDirection("horizontal")}
                      className={cn(
                        "p-2 rounded-md transition-all duration-150",
                        sliderDirection === "horizontal"
                          ? "bg-[var(--accent-mint)]/10 text-[var(--accent-mint)]"
                          : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      )}
                      title={t("horizontal")}
                    >
                      <FlipHorizontal size={16} className="rotate-90" />
                    </button>
                    <button
                      onClick={() => setSliderDirection("vertical")}
                      className={cn(
                        "p-2 rounded-md transition-all duration-150",
                        sliderDirection === "vertical"
                          ? "bg-[var(--accent-mint)]/10 text-[var(--accent-mint)]"
                          : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      )}
                      title={t("vertical")}
                    >
                      <FlipHorizontal size={16} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="px-6 py-4 overflow-y-auto">
          {isExactlyTwo && viewMode === "slider" ? (
            <BeforeAfterSlider
              derivationA={derivations[0]}
              derivationB={derivations[1]}
              direction={sliderDirection}
            />
          ) : (
            <div className={cn("grid gap-4", gridCols)}>
              {derivations.map((derivation, i) => (
                <ComparisonColumn
                  key={derivation.id}
                  derivation={derivation}
                  index={i}
                  t={t}
                  zoom={zooms[derivation.id] ?? { scale: 1, translateX: 0, translateY: 0 }}
                  onZoomChange={(zoom) => handleZoomChange(derivation.id, zoom)}
                  onApprove={onApprove ? () => onApprove(derivation.id) : undefined}
                  onReject={onReject ? () => onReject(derivation.id) : undefined}
                  onRemove={onRemove ? () => onRemove(derivation.id) : undefined}
                />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
