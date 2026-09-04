"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  studioBentoClass,
  studioBentoItemClass,
  studioQuietActionClass,
} from "@/components/dashboard/studio-stage/StudioInstrument";

export interface ShareGalleryItem {
  id: string;
  imageUrl: string;
  format?: string;
  generationMode?: string;
  variantIndex?: number;
  ctaText?: string;
}

type ShareGalleryLabels = {
  closePreview: string;
  variation: string;
};

interface GalleryGridProps {
  items: ShareGalleryItem[];
  labels: ShareGalleryLabels;
}

function roverMeta(item: ShareGalleryItem, variationLabel: string) {
  const parts = [
    item.format?.toUpperCase(),
    item.generationMode?.replaceAll("_", " "),
    item.variantIndex !== undefined
      ? variationLabel.replace("{index}", String(item.variantIndex + 1))
      : null,
    item.ctaText,
  ].filter(Boolean);
  return parts.join(" · ");
}

export default function GalleryGrid({ items, labels }: GalleryGridProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = items.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId]);

  return (
    <>
      <ul className={studioBentoClass} data-testid="share-bento">
        {items.map((item) => {
          const meta = roverMeta(item, labels.variation);
          const alt = item.ctaText ?? item.format ?? item.id;
          return (
            <li key={item.id} className={studioBentoItemClass}>
              <button
                type="button"
                onClick={() => setSelectedId(item.id)}
                aria-label={alt}
                className="group relative block w-full overflow-hidden rounded-2xl bg-white/[0.04] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              >
                <Image
                  src={item.imageUrl}
                  alt={alt}
                  width={1080}
                  height={1350}
                  unoptimized
                  className="block h-auto w-full"
                />
                <div
                  data-testid="share-asset-rover"
                  className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent px-2.5 pb-2.5 pt-10 opacity-0 transition-opacity duration-[var(--duration-fast)] group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
                >
                  <p className="truncate text-xs font-medium text-white">{alt}</p>
                  {meta ? (
                    <p className="mt-0.5 truncate font-mono text-[10px] text-white/70">{meta}</p>
                  ) : null}
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {selected ? (
        <dialog
          open
          className="fixed inset-0 z-[var(--layer-popover)] m-0 flex size-full max-h-none max-w-none flex-col items-center justify-center border-0 bg-[var(--canvas)]/92 p-4"
          aria-modal="true"
          aria-label={selected.ctaText ?? selected.format ?? selected.id}
        >
            <button
              type="button"
              className="absolute inset-0 cursor-default"
              onClick={() => setSelectedId(null)}
              tabIndex={-1}
              aria-hidden="true"
            />
          <div className="relative z-[var(--layer-raised)] flex max-h-[90vh] max-w-4xl flex-col items-center">
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className={`${studioQuietActionClass} absolute right-0 top-0 z-10`}
              aria-label={labels.closePreview}
            >
              <X size={14} aria-hidden="true" />
            </button>
            <Image
              src={selected.imageUrl}
              alt={selected.ctaText ?? selected.format ?? selected.id}
              width={1080}
              height={1350}
              unoptimized
              className="max-h-[80vh] w-auto object-contain"
            />
            {roverMeta(selected, labels.variation) ? (
              <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                {roverMeta(selected, labels.variation)}
              </p>
            ) : null}
          </div>
        </dialog>
      ) : null}
    </>
  );
}
