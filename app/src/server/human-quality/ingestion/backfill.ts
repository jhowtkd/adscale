import { captureAndAutoPromote } from "../auto-promote";
import { listEligibleDerivationsForBackfill } from "../../repositories/human-quality-ingestion";

export interface CorpusBackfillCursor {
  createdAt: string;
  id: string;
}

export interface CorpusBackfillBatchResult {
  processed: number;
  created: number;
  promoted: number;
  skipped: number;
  blocked: number;
  nextCursor: CorpusBackfillCursor | null;
}

const BACKFILL_CONCURRENCY = 5;

export async function runCorpusBackfillBatch(input: {
  batchSize?: number;
  cursor?: CorpusBackfillCursor | null;
  workspaceId?: string;
}): Promise<CorpusBackfillBatchResult> {
  const batchSize = input.batchSize ?? 500;
  const rows = await listEligibleDerivationsForBackfill({
    batchSize,
    cursor: input.cursor
      ? { createdAt: new Date(input.cursor.createdAt), id: input.cursor.id }
      : null,
    workspaceId: input.workspaceId,
  });

  let created = 0;
  let promoted = 0;
  let skipped = 0;
  let blocked = 0;

  for (let offset = 0; offset < rows.length; offset += BACKFILL_CONCURRENCY) {
    const campaignTasks = new Map<string, Promise<unknown>>();
    const settled = await Promise.allSettled(rows.slice(offset, offset + BACKFILL_CONCURRENCY)
      .map((row) => {
        // Profile resolution can update the campaign; serialize siblings to avoid races.
        const previous = campaignTasks.get(row.campaignId) ?? Promise.resolve();
        const task = previous.then(() => captureAndAutoPromote({
          workspaceId: row.workspaceId,
          derivationId: row.derivationId,
        }));
        campaignTasks.set(row.campaignId, task);
        return task;
      }));
    const failure = settled.find((result) => result.status === "rejected");
    // No cursor is returned after a failed chunk; retrying the same cursor is idempotent.
    if (failure?.status === "rejected") throw failure.reason;
    for (const settledResult of settled) {
      if (settledResult.status !== "fulfilled") continue;
      const result = settledResult.value;
      if (!result.candidate) {
        skipped += 1;
        continue;
      }
      created += 1;
      if (result.promoted?.created) promoted += 1;
      if (result.promoteError) blocked += 1;
    }
  }

  const last = rows[rows.length - 1];
  return {
    processed: rows.length,
    created,
    promoted,
    skipped,
    blocked,
    nextCursor: last
      ? { createdAt: last.createdAt.toISOString(), id: last.derivationId }
      : null,
  };
}
