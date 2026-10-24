/**
 * What the Campaign workspace derives from ALL of a Campanha's Peças (#503).
 *
 * The route computes it on the server from a light projection, so the client
 * no longer needs the full list: a paginated list would silently limit counts,
 * the stage, the approved Peça and the polling decision to the loaded pages.
 * The client keeps using `isPendingDerivationWork` for rows it already has.
 */

export type DerivationSummaryRow = {
  id: string;
  status: string;
  isPreview?: boolean | null;
  scoreStatus?: string | null;
  qualityGatedAt?: Date | string | null;
};

export type CampaignDerivationSummary = {
  total: number;
  approvedCount: number;
  /** Peças the workspace shows as in review: mapped status `active` or `generating`. */
  reviewCount: number;
  /** Any Peça queued or processing. */
  isGenerating: boolean;
  /** Any Peça still moving through generation, scoring or the preview quality gate. */
  hasPendingWork: boolean;
  /** Approved Peças, newest first. */
  approvedIds: string[];
};

/** Status shown on the workspace cards: queued and processing read as generating. */
export function workspaceDerivationStatus(status: string): string {
  return status === "queued" || status === "processing" ? "generating" : status;
}

export function isPendingDerivationWork(d: Omit<DerivationSummaryRow, "id">): boolean {
  return (
    d.status === "queued" ||
    d.status === "processing" ||
    d.scoreStatus === "heuristic" ||
    (d.status === "completed" && d.scoreStatus === "pending") ||
    // Preview approval depends on the quality gate, which runs after
    // scoring. Keep polling through that second lifecycle boundary.
    (Boolean(d.isPreview) && d.status === "completed" && d.qualityGatedAt == null)
  );
}

/** `rows` must be every Peça of the Campanha, newest first. */
export function summarizeCampaignDerivations(
  rows: readonly DerivationSummaryRow[],
): CampaignDerivationSummary {
  const approvedIds: string[] = [];
  let reviewCount = 0;
  let isGenerating = false;
  let hasPendingWork = false;
  for (const row of rows) {
    if (row.status === "approved") approvedIds.push(row.id);
    const shown = workspaceDerivationStatus(row.status);
    if (shown === "active" || shown === "generating") reviewCount += 1;
    if (row.status === "queued" || row.status === "processing") isGenerating = true;
    if (isPendingDerivationWork(row)) hasPendingWork = true;
  }
  return {
    total: rows.length,
    approvedCount: approvedIds.length,
    reviewCount,
    isGenerating,
    hasPendingWork,
    approvedIds,
  };
}
