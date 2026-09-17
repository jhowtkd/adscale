import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  enqueueSelectionEffects,
  SELECTION_EFFECT_VERSION,
} from "../repositories/selection-effects";
import {
  planSelectionEffectsBackfill,
  type BackfillArgs,
  type BackfillCandidate,
  type BackfillSkip,
  type ProvenReceiptRow,
} from "./backfill-selection-effects-plan";

/**
 * Provenance query for the selection-effects backfill (ICE-03B): selected
 * outputs whose legacy jsonb still carries a recipe receipt, left-joined
 * against the outbox so already-covered obligations are skipped, never
 * rewritten. Only the recipe kind has a receipt to prove — library and
 * value-event obligations are not invented here.
 */
export async function fetchProvenReceiptRows(input: {
  limit: number;
  workspaceId?: string;
}): Promise<ProvenReceiptRow[]> {
  const scoped = input.workspaceId
    ? sql`AND output.workspace_id = ${input.workspaceId}`
    : sql``;
  const result = await db.execute(sql`
    SELECT
      output.id AS output_id,
      output.workspace_id AS workspace_id,
      output.work_item_id AS work_item_id,
      output.selection_effects -> 'recipe' ->> 'receiptId' AS receipt_id,
      output.selection_effects -> 'recipe' ->> 'requestedAt' AS receipt_requested_at,
      (effect.id IS NOT NULL) AS has_outbox
    FROM adscale_app.creative_work_outputs AS output
    LEFT JOIN adscale_app.creative_work_selection_effects AS effect
      ON effect.workspace_id = output.workspace_id
     AND effect.output_id = output.id
     AND effect.kind = 'recipe'
     AND effect.effect_version = ${SELECTION_EFFECT_VERSION}
    WHERE output.is_selected = true
      AND output.selection_effects -> 'recipe' ->> 'receiptId' IS NOT NULL
      AND output.selection_effects -> 'recipe' ->> 'receiptId' <> ''
      ${scoped}
    ORDER BY output.workspace_id ASC, output.id ASC
    LIMIT ${input.limit}
  `);
  return result.rows.map((row) => ({
    outputId: String(row.output_id),
    workspaceId: String(row.workspace_id),
    workItemId: String(row.work_item_id),
    isSelected: true,
    receiptId: String(row.receipt_id ?? ""),
    receiptRequestedAt: String(row.receipt_requested_at ?? ""),
    hasOutboxRow: row.has_outbox === true,
  }));
}

export interface BackfillExecution {
  mode: "dry-run" | "apply";
  candidates: BackfillCandidate[];
  skipped: BackfillSkip[];
  enqueued: number;
}

export async function executeSelectionEffectsBackfill(
  plan: BackfillArgs,
): Promise<BackfillExecution> {
  const rows = await fetchProvenReceiptRows({
    limit: plan.limit,
    ...(plan.workspaceId ? { workspaceId: plan.workspaceId } : {}),
  });
  const { candidates, skipped } = planSelectionEffectsBackfill(rows);
  if (plan.dryRun) {
    return { mode: "dry-run", candidates, skipped, enqueued: 0 };
  }
  let enqueued = 0;
  for (const candidate of candidates) {
    // Idempotent on the dedup constraint: a concurrent backfill or a live
    // selection converges on the same row instead of duplicating it.
    const [created] = await enqueueSelectionEffects(db, {
      workspaceId: candidate.workspaceId,
      workItemId: candidate.workItemId,
      outputId: candidate.outputId,
      requestedAt: new Date(candidate.requestedAt),
      effects: [
        {
          kind: "recipe",
          payload: { version: 1, kind: "recipe", receiptId: candidate.receiptId },
        },
      ],
    });
    if (created.created) enqueued += 1;
  }
  // Pending backfilled rows converge on their own via the sweep backstop;
  // waking per row would spam the queue and is unnecessary.
  return { mode: "apply", candidates, skipped, enqueued };
}
