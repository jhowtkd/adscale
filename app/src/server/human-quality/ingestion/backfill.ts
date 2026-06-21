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

  for (const row of rows) {
    const result = await captureAndAutoPromote({
      workspaceId: row.workspaceId,
      derivationId: row.derivationId,
    });

    if (!result.candidate) {
      skipped += 1;
      continue;
    }

    created += 1;
    if (result.promoted?.created) {
      promoted += 1;
    }
    if (result.promoteError) {
      blocked += 1;
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
