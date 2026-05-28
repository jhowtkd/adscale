"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Pencil,
  Type,
  Circle,
  Square,
  ArrowRight,
  MousePointer,
  Trash2,
  X,
  Minus,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import AnnotationCanvas, { COLORS } from "./AnnotationCanvas";
import { useAnnotations } from "@/lib/hooks/use-annotations";
import type { AnnotationType } from "@/lib/mock-data";
import type { Derivation } from "@/lib/mock-data";

// ============================================
// Types
// ============================================

interface AnnotationModalProps {
  derivation: Derivation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ToolType = AnnotationType | "select";

const TOOLS: { id: ToolType; icon: React.ElementType; label: string }[] = [
  { id: "select", icon: MousePointer, label: "select" },
  { id: "freehand", icon: Pencil, label: "draw" },
  { id: "text", icon: Type, label: "text" },
  { id: "circle", icon: Circle, label: "circle" },
  { id: "rectangle", icon: Square, label: "rectangle" },
  { id: "arrow", icon: ArrowRight, label: "arrow" },
];

// ============================================
// Component
// ============================================

export default function AnnotationModal({
  derivation,
  open,
  onOpenChange,
}: AnnotationModalProps) {
  const t = useTranslations("derivation");
  const [activeTool, setActiveTool] = useState<ToolType>("select");
  const [activeColor, setActiveColor] = useState("#ef4444");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [fontSize, setFontSize] = useState(16);

  const {
    annotations,
    addAnnotation,
    removeAnnotation,
    clearAnnotations,
  } = useAnnotations(derivation.id);

  const handleClearAll = () => {
    if (window.confirm(t("confirmClearAnnotations"))) {
      clearAnnotations();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[calc(100%-2rem)] p-0 overflow-hidden sm:max-w-5xl">
        <DialogHeader className="px-6 pt-6 pb-2">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base font-semibold text-[var(--text-primary)]">
              {t("annotateTitle", { name: derivation.name })}
            </DialogTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-muted)]">
                {annotations.length} {t("annotationsCount")}
              </span>
              {annotations.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="p-2 rounded-md text-[var(--accent-rose)] hover:bg-[var(--accent-rose)]/10 transition-all duration-150"
                  title={t("clearAll")}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="px-6 py-4">
          <div className="flex gap-4">
            {/* Toolbar */}
            <div className="flex flex-col gap-4 w-14 shrink-0">
              {/* Tools */}
              <div className="flex flex-col gap-1 bg-[var(--surface-raised)] rounded-lg p-1.5 border border-[var(--border-dim)]">
                {TOOLS.map((tool) => (
                  <button
                    key={tool.id}
                    onClick={() => setActiveTool(tool.id)}
                    className={cn(
                      "p-2 rounded-md transition-all duration-150",
                      activeTool === tool.id
                        ? "bg-[var(--accent-mint)]/10 text-[var(--accent-mint)]"
                        : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-base)]"
                    )}
                    title={t(tool.label)}
                  >
                    <tool.icon size={18} />
                  </button>
                ))}
              </div>

              {/* Colors */}
              <div className="flex flex-col gap-1.5 bg-[var(--surface-raised)] rounded-lg p-1.5 border border-[var(--border-dim)]">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setActiveColor(color)}
                    className={cn(
                      "w-6 h-6 rounded-full border-2 transition-all duration-150",
                      activeColor === color
                        ? "border-[var(--text-primary)] scale-110"
                        : "border-transparent hover:scale-105"
                    )}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>

              {/* Stroke width */}
              <div className="flex flex-col gap-1 bg-[var(--surface-raised)] rounded-lg p-1.5 border border-[var(--border-dim)]">
                <button
                  onClick={() => setStrokeWidth((w) => Math.max(1, w - 1))}
                  className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-base)]"
                >
                  <Minus size={14} />
                </button>
                <span className="text-[10px] text-[var(--text-muted)] text-center">
                  {strokeWidth}px
                </span>
                <button
                  onClick={() => setStrokeWidth((w) => Math.min(10, w + 1))}
                  className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-base)]"
                >
                  <Plus size={14} />
                </button>
              </div>

              {/* Font size (only for text tool) */}
              {activeTool === "text" && (
                <div className="flex flex-col gap-1 bg-[var(--surface-raised)] rounded-lg p-1.5 border border-[var(--border-dim)]">
                  <button
                    onClick={() => setFontSize((s) => Math.max(8, s - 2))}
                    className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-base)]"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="text-[10px] text-[var(--text-muted)] text-center">
                    {fontSize}px
                  </span>
                  <button
                    onClick={() => setFontSize((s) => Math.min(48, s + 2))}
                    className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-base)]"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              )}
            </div>

            {/* Canvas */}
            <div className="flex-1">
              <AnnotationCanvas
                imageUrl={derivation.imageUrl}
                aspectRatio={derivation.format ?? "1:1"}
                annotations={annotations}
                onAddAnnotation={addAnnotation}
                onRemoveAnnotation={removeAnnotation}
                onClearAnnotations={clearAnnotations}
                activeTool={activeTool}
                activeColor={activeColor}
                strokeWidth={strokeWidth}
                fontSize={fontSize}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border-dim)] bg-[var(--surface-base)]">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--text-muted)]">
              {t("annotationHint")}
            </span>
          </div>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t("close")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
