/**
 * Pure preview-gate visibility rules for the strategy cockpit.
 * Extracted from use-campaign-workspace for testability (CQA-01).
 */

export type PreviewGateDerivation = {
  isPreview?: boolean;
  status: string;
  imageUrl?: string | null;
  outputKey?: string | null;
};

export function getActivePreviewGateDerivation<T extends PreviewGateDerivation>(
  derivations: T[]
): T | null {
  // Newest preview first (API returns createdAt desc); gate only the latest preview.
  const preview = derivations.find((d) => d.isPreview);
  if (!preview) return null;

  const hasBatch = derivations.some((d) => !d.isPreview);
  if (hasBatch) return null;

  if (preview.status === "generating") return null;

  return preview.imageUrl || preview.outputKey ? preview : null;
}

export function shouldShowPreviewGate(
  derivations: PreviewGateDerivation[]
): boolean {
  return getActivePreviewGateDerivation(derivations) != null;
}
