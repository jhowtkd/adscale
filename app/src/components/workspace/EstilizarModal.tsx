"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Upload, X, ImageIcon } from "lucide-react";

// ============================================
// Types
// ============================================

interface EstilizarModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    styleReferences: string[];
    style: string;
    intensity: string;
  }) => void;
}

const STYLE_OPTIONS = [
  { value: "minimalista", label: "Minimalista" },
  { value: "organico", label: "Orgânico" },
  { value: "neon", label: "Neon" },
  { value: "retro", label: "Retrô" },
];

const INTENSITY_OPTIONS = [
  { value: "suave", label: "Suave" },
  { value: "media", label: "Média" },
  { value: "forte", label: "Forte" },
];

// ============================================
// Component
// ============================================

export default function EstilizarModal({
  open,
  onClose,
  onSubmit,
}: EstilizarModalProps) {
  const [styleReferences, setStyleReferences] = useState<string[]>([]);
  const [style, setStyle] = useState("");
  const [intensity, setIntensity] = useState("");

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;

      const newRefs: string[] = [];
      Array.from(files).forEach((file) => {
        if (file.type.startsWith("image/")) {
          newRefs.push(URL.createObjectURL(file));
        }
      });

      setStyleReferences((prev) => [...prev, ...newRefs]);
    },
    []
  );

  const removeReference = useCallback((index: number) => {
    setStyleReferences((prev) => {
      const next = [...prev];
      URL.revokeObjectURL(next[index]);
      next.splice(index, 1);
      return next;
    });
  }, []);

  const handleSubmit = useCallback(() => {
    onSubmit({ styleReferences, style, intensity });
    setStyleReferences([]);
    setStyle("");
    setIntensity("");
  }, [onSubmit, styleReferences, style, intensity]);

  const canSubmit = style && intensity;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={18} className="text-[var(--accent-green)]" />
            Workflow de estilização
          </DialogTitle>
          <DialogDescription>
            Escolha referências visuais e o estilo desejado para reinterpretar o criativo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Style References Upload */}
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ghost)] mb-2">
              Referências de estilo
            </label>

            {/* Uploaded refs */}
            {styleReferences.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {styleReferences.map((ref, i) => (
                  <div
                    key={i}
                    className="relative size-16 rounded-md border border-[var(--border-dim)] overflow-hidden group"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={ref}
                      alt={`Ref ${i + 1}`}
                      className="size-full object-cover"
                    />
                    <button
                      onClick={() => removeReference(i)}
                      className="absolute top-0.5 right-0.5 flex size-4 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Upload zone */}
            <label
              className={cn(
                "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 cursor-pointer transition-all duration-200",
                "border-[var(--border-dim)] bg-[var(--surface-raised)] hover:border-[var(--accent-green)] hover:bg-[var(--accent-green-dim)]"
              )}
            >
              <Upload size={20} className="text-[var(--text-muted)]" />
              <span className="text-xs text-[var(--text-secondary)]">
                Clique para adicionar referências
              </span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={handleFileChange}
              />
            </label>
          </div>

          {/* Style Select */}
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ghost)] mb-1.5">
              Estilo desejado
            </label>
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              className="w-full rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-green)]"
            >
              <option value="">Selecione um estilo</option>
              {STYLE_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {/* Intensity Select */}
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ghost)] mb-1.5">
              Intensidade
            </label>
            <select
              value={intensity}
              onChange={(e) => setIntensity(e.target.value)}
              className="w-full rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-green)]"
            >
              <option value="">Selecione a intensidade</option>
              {INTENSITY_OPTIONS.map((i) => (
                <option key={i.value} value={i.value}>
                  {i.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="bg-[var(--accent-green)] text-white hover:bg-[var(--accent-green-light)]"
          >
            <Sparkles size={14} className="mr-1.5" />
            Gerar reinterpretações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
