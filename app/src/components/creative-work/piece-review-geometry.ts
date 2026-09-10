export type PieceImageBounds = { left: number; top: number; width: number; height: number };

/** Rendered image rect inside a letterboxed container (`object-fit: contain`). */
export function containedImageBounds(box: PieceImageBounds, naturalWidth: number, naturalHeight: number): PieceImageBounds | null {
  if (![box.left, box.top, box.width, box.height, naturalWidth, naturalHeight].every(Number.isFinite)) return null;
  if (naturalWidth <= 0 || naturalHeight <= 0 || box.width <= 0 || box.height <= 0) return null;
  const scale = Math.min(box.width / naturalWidth, box.height / naturalHeight);
  return {
    left: box.left + (box.width - naturalWidth * scale) / 2,
    top: box.top + (box.height - naturalHeight * scale) / 2,
    width: naturalWidth * scale,
    height: naturalHeight * scale,
  };
}

/** Normalized (0..1) point against the rendered image, or null outside it. */
export function imagePoint(
  bounds: PieceImageBounds | null,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  if (!bounds || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
  if (clientX < bounds.left || clientY < bounds.top
    || clientX > bounds.left + bounds.width || clientY > bounds.top + bounds.height) return null;
  return { x: (clientX - bounds.left) / bounds.width, y: (clientY - bounds.top) / bounds.height };
}
