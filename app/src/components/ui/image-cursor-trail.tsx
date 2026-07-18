"use client";

import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ImageCursorTrailProps {
  items: string[];
  children?: ReactNode;
  className?: string;
  imgClassName?: string;
  distance?: number;
  maxNumberOfImages?: number;
  fadeAnimation?: boolean;
}

export default function ImageCursorTrail({
  items,
  children,
  className,
  imgClassName,
  distance = 20,
  maxNumberOfImages = 5,
  fadeAnimation = false,
}: ImageCursorTrailProps) {
  const containerRef = useRef<HTMLElement>(null);
  const imageRefs = useRef<(HTMLImageElement | null)[]>([]);
  const indexRef = useRef(0);
  const zIndexRef = useRef(1);
  const lastPositionRef = useRef<{ x: number; y: number } | null>(null);

  function deactivate(image: HTMLImageElement | null) {
    if (image) image.dataset.status = "inactive";
  }

  function activate(image: HTMLImageElement, x: number, y: number) {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) return;

    image.style.left = `${x - bounds.left}px`;
    image.style.top = `${y - bounds.top}px`;
    image.style.zIndex = String(zIndexRef.current);
    image.dataset.status = "active";
    zIndexRef.current = zIndexRef.current >= 40 ? 1 : zIndexRef.current + 1;
    lastPositionRef.current = { x, y };

    if (fadeAnimation) {
      window.setTimeout(() => deactivate(image), 1500);
    }
  }

  function handlePointerMove(x: number, y: number) {
    if (items.length === 0) return;
    const last = lastPositionRef.current;
    const threshold = window.innerWidth / distance;
    if (last && Math.hypot(x - last.x, y - last.y) <= threshold) return;

    const index = indexRef.current;
    const lead = imageRefs.current[index % items.length];
    if (lead) activate(lead, x, y);

    const tailIndex = index - maxNumberOfImages;
    if (tailIndex >= 0) deactivate(imageRefs.current[tailIndex % items.length]);
    indexRef.current += 1;
  }

  return (
    <section
      ref={containerRef}
      onPointerMove={(event) => handlePointerMove(event.clientX, event.clientY)}
      className={cn("relative overflow-hidden", className)}
    >
      {items.map((item, index) => (
        // Native img is required because the trail mutates each element's position per pointer event.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={item}
          ref={(node) => {
            imageRefs.current[index] = node;
          }}
          src={item}
          alt=""
          aria-hidden="true"
          draggable={false}
          data-status="inactive"
          className={cn(
            "pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 scale-0 rounded-2xl object-cover opacity-0 shadow-2xl transition-[transform,opacity] duration-300 will-change-transform data-[status=active]:scale-100 data-[status=active]:opacity-100 motion-reduce:hidden",
            imgClassName
          )}
        />
      ))}
      {children}
    </section>
  );
}
