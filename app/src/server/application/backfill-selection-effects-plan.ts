/**
 * Pure plan for the selection-effects backfill (ICE-03B): no IO, so the
 * dry-run and usage errors work without an environment — only --apply
 * touches the database. Backfill is limited to proven receipts (a
 * selected output carrying a recipe receipt id); anything else is
 * skipped with its reason instead of inventing an obligation.
 */

export interface BackfillArgs {
  dryRun: boolean;
  limit: number;
  workspaceId?: string;
}

export type BackfillArgsParse =
  | { ok: true; plan: BackfillArgs }
  | { ok: false; error: string };

export function parseBackfillArgs(argv: string[]): BackfillArgsParse {
  let dryRun = true;
  let limit = 100;
  let workspaceId: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") dryRun = false;
    else if (arg === "--dry-run") dryRun = true;
    else if (arg === "--limit") {
      const raw = argv[++i];
      const parsed = Number(raw);
      if (!raw || !Number.isInteger(parsed) || parsed <= 0) {
        return { ok: false, error: `invalid_limit:${raw ?? ""}` };
      }
      limit = parsed;
    } else if (arg === "--workspace") {
      workspaceId = argv[++i];
      if (!workspaceId) return { ok: false, error: "workspace_required" };
    } else return { ok: false, error: `unknown_flag:${arg}` };
  }
  return { ok: true, plan: { dryRun, limit, ...(workspaceId ? { workspaceId } : {}) } };
}

export interface ProvenReceiptRow {
  outputId: string;
  workspaceId: string;
  workItemId: string;
  isSelected: boolean;
  receiptId: string;
  receiptRequestedAt: string;
  hasOutboxRow: boolean;
}

export interface BackfillCandidate {
  outputId: string;
  workspaceId: string;
  workItemId: string;
  receiptId: string;
  requestedAt: string;
}

export interface BackfillSkip {
  outputId: string;
  reason:
    | "outbox_row_exists"
    | "not_selected"
    | "receipt_missing"
    | "receipt_date_invalid";
}

export interface BackfillPlan {
  candidates: BackfillCandidate[];
  skipped: BackfillSkip[];
}

export function planSelectionEffectsBackfill(rows: ProvenReceiptRow[]): BackfillPlan {
  const candidates: BackfillCandidate[] = [];
  const skipped: BackfillSkip[] = [];
  for (const row of rows) {
    if (row.hasOutboxRow) {
      skipped.push({ outputId: row.outputId, reason: "outbox_row_exists" });
      continue;
    }
    if (!row.isSelected) {
      skipped.push({ outputId: row.outputId, reason: "not_selected" });
      continue;
    }
    if (!row.receiptId) {
      skipped.push({ outputId: row.outputId, reason: "receipt_missing" });
      continue;
    }
    if (Number.isNaN(new Date(row.receiptRequestedAt).getTime())) {
      skipped.push({ outputId: row.outputId, reason: "receipt_date_invalid" });
      continue;
    }
    candidates.push({
      outputId: row.outputId,
      workspaceId: row.workspaceId,
      workItemId: row.workItemId,
      receiptId: row.receiptId,
      requestedAt: row.receiptRequestedAt,
    });
  }
  return { candidates, skipped };
}
