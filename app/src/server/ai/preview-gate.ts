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

export function shouldShowPreviewGate(
  derivations: PreviewGateDerivation[]
): boolean {
  // Newest preview first (API returns createdAt desc); gate only the latest preview.
  const preview = derivations.find((d) => d.isPreview);
  if (!preview) return false;

  const hasBatch = derivations.some((d) => !d.isPreview);
  if (hasBatch) return false;

  if (preview.status === "generating") return false;

  return Boolean(preview.imageUrl || preview.outputKey);
}
