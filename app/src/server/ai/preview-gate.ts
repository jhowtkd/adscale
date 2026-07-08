/**
 * Pure preview-gate visibility rules for the strategy cockpit.
 * Extracted from use-campaign-workspace for testability (CQA-01).
 *
 * Happy path: preview completes with acceptable quality → auto-continue to batch
 * (no manual gate). Gate only interrupts when quality fails.
 */

export type PreviewGateDerivation = {
  isPreview?: boolean;
  status: string;
  imageUrl?: string | null;
  outputKey?: string | null;
  qualityVerdict?: "invalid" | "improvable" | "acceptable" | null;
  hardFailures?: Array<{ code: string; message: string }> | null;
};

/** Ready preview with output, no batch yet — candidate for gate or auto-continue. */
export function getReadyPreviewDerivation<T extends PreviewGateDerivation>(
  derivations: T[]
): T | null {
  // Newest preview first (API returns createdAt desc).
  const preview = derivations.find((d) => d.isPreview);
  if (!preview) return null;

  const hasBatch = derivations.some((d) => !d.isPreview);
  if (hasBatch) return null;

  if (preview.status === "generating" || preview.status === "queued" || preview.status === "processing") {
    return null;
  }

  return preview.imageUrl || preview.outputKey ? preview : null;
}

/** Quality failed — user must decide continue vs adjust. */
export function previewNeedsManualGate(
  preview: PreviewGateDerivation
): boolean {
  if (preview.qualityVerdict === "invalid") return true;
  if ((preview.hardFailures?.length ?? 0) > 0) return true;
  return false;
}

/** Gate UI only when ready preview has a quality failure. */
export function getActivePreviewGateDerivation<T extends PreviewGateDerivation>(
  derivations: T[]
): T | null {
  const preview = getReadyPreviewDerivation(derivations);
  if (!preview) return null;
  return previewNeedsManualGate(preview) ? preview : null;
}

export function shouldShowPreviewGate(
  derivations: PreviewGateDerivation[]
): boolean {
  return getActivePreviewGateDerivation(derivations) != null;
}

/** Ready preview with acceptable quality — auto-queue the full batch. */
export function shouldAutoContinuePreview(
  derivations: PreviewGateDerivation[]
): boolean {
  const preview = getReadyPreviewDerivation(derivations);
  if (!preview) return false;
  if (previewNeedsManualGate(preview)) return false;
  // Wait until the preview finished (completed / failed / approved), not mid-flight.
  if (
    preview.status !== "completed" &&
    preview.status !== "failed" &&
    preview.status !== "approved" &&
    preview.status !== "rejected"
  ) {
    return false;
  }
  return true;
}
