import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { usageEvents } from "../db/schema";
import type { StudioUsageEvent, StudioUsageWindow } from "../beta-analytics/aggregate";

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

function isUniqueIdempotencyViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

export async function trackUsage(
  workspaceId: string,
  type: string,
  amount: number,
  metadata?: Record<string, unknown>,
  idempotencyKey?: string,
  tx?: DbOrTx
) {
  const client = tx ?? db;
  try {
    const result = await client
      .insert(usageEvents)
      .values({
        workspaceId,
        type,
        amount,
        idempotencyKey,
        metadata: metadata ?? null,
      })
      .returning();
    return result[0];
  } catch (error) {
    if (idempotencyKey && isUniqueIdempotencyViolation(error)) {
      // Inside an open transaction Postgres marks the tx aborted after 23505.
      // Do not query on the same client — rethrow so the caller maps it to duplicate.
      if (tx) {
        throw error;
      }
      const existing = await getUsageByIdempotencyKey(
        workspaceId,
        idempotencyKey
      );
      if (existing) {
        return existing;
      }
    }
    throw error;
  }
}

export async function getUsageByIdempotencyKey(
  workspaceId: string,
  idempotencyKey: string,
  tx?: DbOrTx
) {
  const client = tx ?? db;
  const rows = await client
    .select()
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.workspaceId, workspaceId),
        eq(usageEvents.idempotencyKey, idempotencyKey)
      )
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function getUsageByIdempotencyKeys(workspaceId: string, keys: string[]) {
  if (keys.length === 0) return new Map<string, Awaited<ReturnType<typeof getUsageByIdempotencyKey>>>();
  const rows = await db.select().from(usageEvents).where(and(
    eq(usageEvents.workspaceId, workspaceId),
    inArray(usageEvents.idempotencyKey, keys),
  ));
  return new Map(rows.map((row) => [row.idempotencyKey!, row]));
}

export async function getUsageForWorkspace(workspaceId: string) {
  return db
    .select()
    .from(usageEvents)
    .where(eq(usageEvents.workspaceId, workspaceId))
    .orderBy(desc(usageEvents.createdAt));
}

/** Exact debit/refund existence per Studio work and its 24-hour session window. */
export async function listStudioUsageEventsForWindows(
  windows: StudioUsageWindow[]
): Promise<StudioUsageEvent[]> {
  const events: StudioUsageEvent[] = [];
  for (let offset = 0; offset < windows.length; offset += 100) {
    const batch = windows.slice(offset, offset + 100).map((window) => ({
      workspace_id: window.workspaceId,
      creative_work_id: window.creativeWorkId,
      started_at: window.startedAt.toISOString(),
      ends_at: window.endsAt.toISOString(),
    }));
    const result = await db.execute(sql`
      WITH windows AS (
        SELECT DISTINCT workspace_id, creative_work_id, started_at, ends_at
        FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb)
          AS w(workspace_id uuid, creative_work_id text, started_at timestamp, ends_at timestamp)
      )
      SELECT w.workspace_id, w.creative_work_id,
        min(extract(epoch from u.created_at) * 1000) FILTER (WHERE u.amount > 0) AS debit_ms,
        min(extract(epoch from u.created_at) * 1000) FILTER (
          WHERE u.amount < 0 AND u.metadata -> 'refund' = 'true'::jsonb
        ) AS refund_ms,
        min(extract(epoch from u.created_at) * 1000) FILTER (
          WHERE u.amount < 0 AND u.metadata -> 'refund' = 'true'::jsonb
            AND u.metadata ->> 'description' = 'creative_work_dispatch_refund'
        ) AS compensate_ms
      FROM windows AS w
      LEFT JOIN ${usageEvents} AS u
        ON u.workspace_id = w.workspace_id
        AND u.created_at >= w.started_at
        AND u.created_at <= w.ends_at
        AND u.metadata ->> 'creativeWorkId' = w.creative_work_id
      GROUP BY w.workspace_id, w.creative_work_id, w.started_at, w.ends_at
    `);
    for (const row of result.rows) {
      const workspaceId = String(row.workspace_id);
      const creativeWorkId = String(row.creative_work_id);
      for (const [field, amount, metadata] of [
        ["debit_ms", 1, { creativeWorkId }],
        ["refund_ms", -1, { creativeWorkId, refund: true }],
        ["compensate_ms", -1, { creativeWorkId, refund: true, description: "creative_work_dispatch_refund" }],
      ] as const) {
        if (row[field] === null || row[field] === undefined) continue;
        const milliseconds = Number(row[field]);
        if (!Number.isFinite(milliseconds)) throw new Error("invalid_studio_usage_timestamp");
        events.push({ workspaceId, amount, metadata, createdAt: new Date(milliseconds) });
      }
    }
  }
  return events;
}
