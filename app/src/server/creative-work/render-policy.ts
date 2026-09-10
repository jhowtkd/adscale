/** Frozen policy only: opening a historical piece never upgrades its rendering. */
export function resolveCreativeWorkRenderPolicy(snapshot: { creativeRenderPolicy?: string } | null | undefined) {
  const integrated = snapshot?.creativeRenderPolicy === "integrated_v1";
  return {
    integrated,
    quality: integrated ? "high" as const : undefined,
    maxImageCalls: integrated ? 1 as const : 2 as const,
    automaticCorrection: !integrated,
  };
}
