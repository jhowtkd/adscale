"use client";

import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { PublicLayerizationState } from "@/server/layerize/contracts";
import { LayerScanner } from "./LayerScanner";
import { LayerEditorContent } from "./LayerEditorContent";

type LayerEditorDialogProps = {
  open: boolean;
  workItemId: string;
  outputId: string;
  mode?: "edit" | "inspect";
  layerization?: PublicLayerizationState | null;
  sourceImageUrl?: string;
  hasLayerEditor?: boolean;
  layerizeRemaining?: number | null;
  onRetryLayerize?: () => void;
  onOpenChange: (open: boolean) => void;
  onPublished?: () => void | Promise<void>;
};

export function LayerEditorDialog({
  open,
  workItemId,
  outputId,
  mode = "edit",
  layerization = null,
  sourceImageUrl,
  hasLayerEditor = false,
  layerizeRemaining,
  onRetryLayerize,
  onOpenChange,
  onPublished,
}: LayerEditorDialogProps) {
  const t = useTranslations("dashboard.home.composer.results");
  const preparing = Boolean(sourceImageUrl) && layerization?.status !== "completed" && !hasLayerEditor;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="full" showCloseButton={false} aria-label={t("editorTitle")} className="gap-0 p-0">
        {preparing && sourceImageUrl ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <header className="flex min-h-14 items-center gap-2 border-b border-[var(--border-subtle)] px-3 py-2">
              <Button variant="ghost" size="icon" className="min-h-11 min-w-11" onClick={() => onOpenChange(false)} aria-label={t("editorClose")}><X /></Button>
              <div className="mr-auto min-w-36"><b className="block text-sm">{t("editorTitle")}</b><span className="text-xs text-[var(--text-muted)]">{t("scanningLayers")}</span></div>
            </header>
            <LayerScanner
              sourceImageUrl={sourceImageUrl}
              layerization={layerization}
              layerizeRemaining={layerizeRemaining}
              onRetryLayerize={onRetryLayerize}
            />
          </div>
        ) : (
          <LayerEditorContent
            open={open}
            workItemId={workItemId}
            outputId={outputId}
            mode={mode}
            onOpenChange={onOpenChange}
            onPublished={onPublished}
            presentation="dialog"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
