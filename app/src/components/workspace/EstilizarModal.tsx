"use client";

import Image from "next/image";
import { useState, useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Upload, X } from "lucide-react";

interface EstilizarModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    styleReferenceFiles: File[];
    intensity: string;
  }) => void;
}

const INTENSITY_OPTIONS = [
  { value: "soft", label: "Suave" },
  { value: "medium", label: "Média" },
  { value: "strong", label: "Forte" },
];

interface StyleReferencePreview {
  file: File;
  id: string;
  url: string;
}

export default function EstilizarModal({
  open,
  onClose,
  onSubmit,
}: EstilizarModalProps) {
  const [styleReferencePreviews, setStyleReferencePreviews] = useState<StyleReferencePreview[]>([]);
  const [intensity, setIntensity] = useState("");
  const styleReferencePreviewsRef = useRef<StyleReferencePreview[]>([]);

  useEffect(() => {
    styleReferencePreviewsRef.current = styleReferencePreviews;
  }, [styleReferencePreviews]);

  useEffect(() => {
    const previewsStore = styleReferencePreviewsRef;
    return () => {
      previewsStore.current.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;

      const newPreviews: StyleReferencePreview[] = [];
      Array.from(files).forEach((file) => {
        if (file.type.startsWith("image/")) {
          newPreviews.push({
            file,
            id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
            url: URL.createObjectURL(file),
          });
        }
      });

      setStyleReferencePreviews((prev) => [...prev, ...newPreviews]);
    },
    []
  );

  const removeReference = useCallback((id: string) => {
    setStyleReferencePreviews((prev) => {
      const preview = prev.find((item) => item.id === id);
      if (preview) URL.revokeObjectURL(preview.url);
      return prev.filter((item) => item.id !== id);
    });
  }, []);

  const handleSubmit = useCallback(() => {
    const styleReferenceFiles = styleReferencePreviews.map((preview) => preview.file);
    onSubmit({ styleReferenceFiles, intensity });
    styleReferencePreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
    setStyleReferencePreviews([]);
    setIntensity("");
  }, [onSubmit, styleReferencePreviews, intensity]);

  const canSubmit = styleReferencePreviews.length > 0 && intensity;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={18} className="text-[var(--accent-green)]" />
            Workflow de estilização
          </DialogTitle>
          <DialogDescription>
            Adicione referências visuais e escolha a intensidade para reinterpretar o criativo.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-5">
          <div>
            <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ghost)] mb-2">
              Referências de estilo
            </span>

            {styleReferencePreviews.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {styleReferencePreviews.map((preview, i) => (
                  <div
                    key={preview.id}
                    className="relative size-16 rounded-md border border-[var(--border-dim)] overflow-hidden group"
                  >
                    <Image
                      src={preview.url}
                      alt={`Ref ${i + 1}`}
                      fill
                      sizes="64px"
                      unoptimized
                      className="object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeReference(preview.id)}
                      className="absolute top-0.5 right-0.5 flex size-4 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label={`Remover referência ${i + 1}`}
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}

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
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="sr-only"
                onChange={handleFileChange}
              />
            </label>
          </div>

          <div>
            <label htmlFor="style-intensity-select" className="block font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ghost)] mb-1.5">
              Intensidade
            </label>
            <select
              id="style-intensity-select"
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
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="bg-[var(--accent-green)] text-[var(--accent-green-on-fill)] hover:bg-[var(--accent-green-light)]"
          >
            <Sparkles size={14} className="mr-1.5" />
            Gerar reinterpretações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
