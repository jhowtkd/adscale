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
import { Link2, Unlink, Plus, Minus, Maximize2 } from "lucide-react";
import type { Derivation } from "@/lib/mock-data";
import { platformColors } from "@/lib/mock-data";

// ============================================
// Types
// ============================================

interface DerivationComparisonModalProps {
  derivationA: Derivation;
  derivationB: Derivation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApproveA?: () => void;
  onApproveB?: () => void;
  onRejectBoth?: () => void;
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

// ============================================
// Zoomable Image Component
// ============================================

function ZoomableImage({
  derivation,
  zoom,
  onZoomChange,
  isSyncEnabled,
  otherZoom,
  onOtherZoomChange,
}: {
  derivation: Derivation;
  zoom: ZoomState;
  onZoomChange: (zoom: ZoomState) => void;
  isSyncEnabled: boolean;
  otherZoom: ZoomState;
  onOtherZoomChange: (zoom: ZoomState) => void;
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
      const newZoom = { ...zoom, scale: newScale };
      onZoomChange(newZoom);
      if (isSyncEnabled) {
        onOtherZoomChange({ ...otherZoom, scale: newScale });
      }
    },
    [zoom, onZoomChange, isSyncEnabled, otherZoom, onOtherZoomChange]
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
      const newZoom = {
        ...zoom,
        translateX: zoomStart.current.translateX + dx,
        translateY: zoomStart.current.translateY + dy,
      };
      onZoomChange(newZoom);
      if (isSyncEnabled) {
        onOtherZoomChange({
          ...otherZoom,
          translateX: zoomStart.current.translateX + dx,
          translateY: zoomStart.current.translateY + dy,
        });
      }
    },
    [isDragging, zoom, onZoomChange, isSyncEnabled, otherZoom, onOtherZoomChange]
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
  label,
  t,
  zoom,
  onZoomChange,
  isSyncEnabled,
  otherZoom,
  onOtherZoomChange,
}: {
  derivation: Derivation;
  label: string;
  t: (key: string) => string;
  zoom: ZoomState;
  onZoomChange: (zoom: ZoomState) => void;
  isSyncEnabled: boolean;
  otherZoom: ZoomState;
  onOtherZoomChange: (zoom: ZoomState) => void;
}) {
  const qaLabelKey = getQaLabelKey(derivation.qaStatus);
  const qaStatusColor = (
    {
      ready: "text-[var(--accent-mint)]",
      warning: "text-amber-500",
      review: "text-[var(--accent-rose)]",
    } as Record<string, string>
  )[derivation.qaStatus ?? ""] ?? "text-[var(--text-muted)]";

  return (
    <div className="flex flex-col gap-4">
      {/* Label */}
      <div className="flex items-center justify-center">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          {label}
        </span>
      </div>

      {/* Image with Zoom */}
      <ZoomableImage
        derivation={derivation}
        zoom={zoom}
        onZoomChange={onZoomChange}
        isSyncEnabled={isSyncEnabled}
        otherZoom={otherZoom}
        onOtherZoomChange={onOtherZoomChange}
      />

      {/* Metadata */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-[var(--text-primary)]">
          {derivation.name}
        </h4>

        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={derivation.status} />
          <span
            className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-medium"
            style={{
              backgroundColor: platformColors[derivation.platform]?.bg || "rgba(99,102,241,0.12)",
              color: platformColors[derivation.platform]?.text || "#818cf8",
            }}
          >
            {derivation.platform}
          </span>
          {derivation.format && (
            <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-medium bg-[var(--surface-raised)] text-[var(--text-secondary)] border border-[var(--border-dim)]">
              {derivation.format}
            </span>
          )}
          {derivation.ctaText && (
            <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-medium bg-[var(--surface-raised)] text-[var(--text-secondary)] border border-[var(--border-dim)]">
              {derivation.ctaText}
            </span>
          )}
        </div>

        {derivation.qualityScore != null && (
          <div className="flex items-center gap-2">
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
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--text-muted)]">
              {t("qaStatus")}:
            </span>
            <span className={cn("text-xs font-medium", qaStatusColor)}>
              {t(qaLabelKey)}
            </span>
          </div>
        )}

        <p className="text-xs text-[var(--text-secondary)] line-clamp-3 leading-relaxed">
          {derivation.prompt}
        </p>
      </div>
    </div>
  );
}

// ============================================
// Status Badge
// ============================================

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    approved: "bg-[var(--accent-mint)]/10 text-[var(--accent-mint)] border-[var(--accent-mint)]/20",
    rejected: "bg-[var(--accent-rose)]/10 text-[var(--accent-rose)] border-[var(--accent-rose)]/20",
    completed: "bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] border-[var(--accent-blue)]/20",
    pending: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-medium border", colors[status] || colors.pending)}>
      {status}
    </span>
  );
}

// ============================================
// Main Component
// ============================================

export default function DerivationComparisonModal({
  derivationA,
  derivationB,
  open,
  onOpenChange,
  onApproveA,
  onApproveB,
  onRejectBoth,
}: DerivationComparisonModalProps) {
  const t = useTranslations("derivation");
  const [isSyncEnabled, setIsSyncEnabled] = useState(true);
  const [zoomA, setZoomA] = useState<ZoomState>({ scale: 1, translateX: 0, translateY: 0 });
  const [zoomB, setZoomB] = useState<ZoomState>({ scale: 1, translateX: 0, translateY: 0 });

  const handleZoomIn = () => {
    const newScale = Math.min(zoomA.scale + 0.5, 5);
    setZoomA({ ...zoomA, scale: newScale });
    if (isSyncEnabled) setZoomB({ ...zoomB, scale: newScale });
  };

  const handleZoomOut = () => {
    const newScale = Math.max(zoomA.scale - 0.5, 1);
    setZoomA({ ...zoomA, scale: newScale, translateX: 0, translateY: 0 });
    if (isSyncEnabled) setZoomB({ ...zoomB, scale: newScale, translateX: 0, translateY: 0 });
  };

  const handleResetZoom = () => {
    setZoomA({ scale: 1, translateX: 0, translateY: 0 });
    setZoomB({ scale: 1, translateX: 0, translateY: 0 });
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === '+' || e.key === '=') handleZoomIn();
      if (e.key === '-') handleZoomOut();
      if (e.key === '0') handleResetZoom();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, zoomA.scale, isSyncEnabled]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[calc(100%-2rem)] p-0 overflow-hidden sm:max-w-6xl">
        <DialogHeader className="px-6 pt-6 pb-2">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base font-semibold text-[var(--text-primary)]">
              {t("compareTitle")}
            </DialogTitle>
            
            {/* Zoom Controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsSyncEnabled(!isSyncEnabled)}
                className={cn(
                  "p-2 rounded-md transition-all duration-150",
                  isSyncEnabled
                    ? "text-[var(--accent-mint)] bg-[var(--accent-mint)]/10"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)]"
                )}
                title={isSyncEnabled ? t("zoomSyncOn") : t("zoomSyncOff")}
              >
                {isSyncEnabled ? <Link2 size={16} /> : <Unlink size={16} />}
              </button>
              <button
                onClick={handleZoomOut}
                className="p-2 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-all duration-150"
                title={t("zoomOut")}
              >
                <Minus size={16} />
              </button>
              <span className="text-xs text-[var(--text-muted)] min-w-[3rem] text-center">
                {Math.round(zoomA.scale * 100)}%
              </span>
              <button
                onClick={handleZoomIn}
                className="p-2 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-all duration-150"
                title={t("zoomIn")}
              >
                <Plus size={16} />
              </button>
              <button
                onClick={handleResetZoom}
                className="p-2 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-all duration-150"
                title={t("resetZoom")}
              >
                <Maximize2 size={16} />
              </button>
            </div>
          </div>
        </DialogHeader>

        <div className="px-6 py-4 overflow-y-auto max-h-[70vh]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ComparisonColumn
              derivation={derivationA}
              label="A"
              t={t}
              zoom={zoomA}
              onZoomChange={setZoomA}
              isSyncEnabled={isSyncEnabled}
              otherZoom={zoomB}
              onOtherZoomChange={setZoomB}
            />
            <ComparisonColumn
              derivation={derivationB}
              label="B"
              t={t}
              zoom={zoomB}
              onZoomChange={setZoomB}
              isSyncEnabled={isSyncEnabled}
              otherZoom={zoomA}
              onOtherZoomChange={setZoomA}
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-center gap-3 px-6 py-4 border-t border-[var(--border-dim)] bg-[var(--surface-base)]">
          <Button
            variant="outline"
            onClick={onApproveA}
            className="border-[var(--accent-mint)] text-[var(--accent-mint)] hover:bg-[var(--accent-mint-dim)]"
          >
            {t("approveA")}
          </Button>
          <Button
            variant="outline"
            onClick={onApproveB}
            className="border-[var(--accent-mint)] text-[var(--accent-mint)] hover:bg-[var(--accent-mint-dim)]"
          >
            {t("approveB")}
          </Button>
          <Button
            variant="outline"
            onClick={onRejectBoth}
            className="border-[var(--accent-rose)] text-[var(--accent-rose)] hover:bg-[var(--accent-rose)]/10"
          >
            {t("rejectBoth")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
