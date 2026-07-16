/**
 * Pure preview-gate visibility rules for the strategy cockpit.
 * Extracted from use-campaign-workspace for testability (CQA-01).
 *
 * Every completed preview requires explicit approval before the full batch.
 */

export type PreviewGateDerivation = {
  id?: string;
  isPreview?: boolean;
  status: string;
  imageUrl?: string | null;
  outputKey?: string | null;
  qualityVerdict?: "invalid" | "improvable" | "acceptable" | null;
  hardFailures?: Array<{ code: string; message: string }> | null;
};

/** Ready preview with output and no batch yet — awaiting explicit approval. */
export function getReadyPreviewDerivation<T extends PreviewGateDerivation>(
  derivations: T[]
): T | null {
  // Newest preview first (API returns createdAt desc).
  const preview = derivations.find((d) => d.isPreview);
  if (!preview) return null;

  // A historical failed/rejected batch is not an active continuation and must
  // not suppress a newer preview's gate decision.
  const hasBatch = derivations.some(
    (d) => !d.isPreview && d.status !== "failed" && d.status !== "rejected"
  );
  if (hasBatch) return null;

  if (preview.status === "generating" || preview.status === "queued" || preview.status === "processing") {
    return null;
  }

  return preview.imageUrl || preview.outputKey ? preview : null;
}

/** A ready preview remains gated until the user explicitly starts the batch. */
export function getActivePreviewGateDerivation<T extends PreviewGateDerivation>(
  derivations: T[]
): T | null {
  return getReadyPreviewDerivation(derivations);
}

export function shouldShowPreviewGate(
  derivations: PreviewGateDerivation[]
): boolean {
  return getActivePreviewGateDerivation(derivations) != null;
}

/** Kept in the response contract for compatibility; continuation is always manual. */
export function shouldAutoContinuePreview(
  derivations: PreviewGateDerivation[]
): boolean {
  void derivations;
  return false;
}
