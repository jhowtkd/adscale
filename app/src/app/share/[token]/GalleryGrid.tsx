"use client";

import { useState } from "react";
import { X, ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";

interface GalleryItem {
  id: string;
  imageUrl: string;
  format?: string;
  generationMode?: string;
  variantIndex?: number;
  ctaText?: string;
  createdAt?: string;
}

interface GalleryGridProps {
  items: GalleryItem[];
}

export default function GalleryGrid({ items }: GalleryGridProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = items.find((i) => i.id === selectedId);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => setSelectedId(item.id)}
            className={cn(
              "group relative aspect-square overflow-hidden rounded-lg border border-[var(--border-medium)] bg-[var(--surface-raised)] shadow-[0_12px_40px_rgba(0,0,0,0.35)] transition hover:border-[var(--accent-mint)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-mint)]"
            )}
          >
            <img
              src={item.imageUrl}
              alt={item.ctaText ?? `Criativo ${item.id}`}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/20">
              <ZoomIn className="opacity-0 transition group-hover:opacity-100 text-white drop-shadow" size={24} />
            </div>
            {item.format && (
              <span className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                {item.format.toUpperCase()}
              </span>
            )}
          </button>
        ))}
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setSelectedId(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative max-h-[90vh] max-w-4xl overflow-hidden rounded-xl bg-[var(--surface-base)] shadow-2xl ring-1 ring-[var(--border-medium)]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedId(null)}
              className="absolute right-3 top-3 z-10 rounded-full bg-black/50 p-1.5 text-white transition hover:bg-black/70"
              aria-label="Fechar"
            >
              <X size={18} />
            </button>
            <img
              src={selected.imageUrl}
              alt={selected.ctaText ?? `Criativo ${selected.id}`}
              className="max-h-[80vh] w-auto object-contain"
            />
            <div className="flex items-center gap-3 border-t border-[var(--border-dim)] bg-[var(--deep-bg)] px-4 py-3 text-xs text-[var(--text-secondary)]">
              {selected.format && (
                <span className="rounded bg-[var(--border-medium)] px-2 py-0.5 font-medium">
                  {selected.format.toUpperCase()}
                </span>
              )}
              {selected.generationMode && (
                <span className="capitalize">
                  {selected.generationMode.replace("_", " ")}
                </span>
              )}
              {selected.variantIndex !== undefined && (
                <span>Variação {selected.variantIndex + 1}</span>
              )}
              {selected.ctaText && (
                <span className="truncate max-w-[200px]">{selected.ctaText}</span>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
