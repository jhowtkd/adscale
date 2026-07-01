/** Neutral light-gray thumbnail gradients — green reserved for buttons only. */
export const V6_SURFACE_GRADIENTS = [
  "gradient-thumb-1",
  "gradient-thumb-2",
  "gradient-thumb-3",
  "gradient-thumb-4",
  "gradient-thumb-5",
  "gradient-thumb-6",
] as const;

export type V6SurfaceGradient = (typeof V6_SURFACE_GRADIENTS)[number];

export function pickSurfaceGradient(index: number): V6SurfaceGradient {
  return V6_SURFACE_GRADIENTS[index % V6_SURFACE_GRADIENTS.length];
}
