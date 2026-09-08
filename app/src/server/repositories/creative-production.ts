import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import {
  campaigns as c,
  creativeWorkCarouselSlides as s,
  creativeWorkItems as w,
  creativeWorkOutputs as o,
  derivations as d,
} from "@/server/db/schema";
import type { CreativeProductionKind } from "@/lib/creative-production";

const cursorSchema = z.object({
  at: z.string().datetime({ precision: 6 }),
  id: z.string().regex(/^(output|slide|derivation):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
});
const querySchema = z.object({
  clientProfileId: z.string().uuid(),
  campaignId: z.string().uuid().nullable(),
  limit: z.number().int().min(1).max(48),
  cursor: cursorSchema.nullable(),
});

export type ProductionCursor = z.infer<typeof cursorSchema>;
export type ProductionQuery = z.infer<typeof querySchema> & { workspaceId: string };
export type ProductionRow = {
  id: string;
  kind: CreativeProductionKind;
  sourceId: string;
  workId: string | null;
  campaignId: string | null;
  title: string;
  format: string | null;
  outputKey: string;
  createdAt: Date;
  sortAt: string;
  position: number | null;
};

export function parseProductionSearchParams(params: URLSearchParams) {
  let cursor: unknown = null;
  try {
    const value = params.get("cursor");
    if (value) cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const parsed = querySchema.safeParse({
    clientProfileId: params.get("clientProfileId"),
    campaignId: params.get("campaignId"),
    limit: params.has("limit") ? Number(params.get("limit")) : 24,
    cursor,
  });
  return parsed.success ? parsed.data : null;
}

export function encodeProductionCursor(row: Pick<ProductionRow, "sortAt" | "id">) {
  return Buffer.from(JSON.stringify({ at: row.sortAt, id: row.id })).toString("base64url");
}

export function productionPageSql(input: ProductionQuery): SQL {
  const workScope = sql`${w.workspaceId} = ${input.workspaceId}
    and ${w.clientProfileId} = ${input.clientProfileId}
    ${input.campaignId ? sql`and ${w.campaignId} = ${input.campaignId}` : sql``}`;
  const campaignScope = sql`${c.workspaceId} = ${input.workspaceId}
    and ${c.clientProfileId} = ${input.clientProfileId}
    ${input.campaignId ? sql`and ${c.id} = ${input.campaignId}` : sql``}`;
  const after = input.cursor
    ? sql`where (created_at, id) < (${input.cursor.at}::timestamp, ${input.cursor.id})`
    : sql``;
  return sql`
    with produced as (
      select 'output:' || ${o.id}::text as id, 'output'::text as kind,
        ${o.id}::text as source_id, ${w.id}::text as work_id,
        ${w.campaignId}::text as campaign_id, ${w.title} as title,
        ${o.targetFormat} as format, ${o.outputKey} as output_key,
        ${o.createdAt} as created_at, null::integer as position
      from ${o} inner join ${w} on ${w.id} = ${o.workItemId}
      where ${workScope} and ${o.workspaceId} = ${input.workspaceId}
        and ${w.toolKind} <> 'carousel'
        and ${o.status} = 'completed' and ${o.outputKey} is not null
      union all
      select 'slide:' || ${s.id}::text, 'slide'::text, ${s.id}::text,
        ${w.id}::text, ${w.campaignId}::text, ${w.title}, ${w.format},
        ${s.outputKey}, ${s.createdAt}, ${s.position}
      from ${s} inner join ${w} on ${w.id} = ${s.workItemId}
      where ${workScope} and ${s.workspaceId} = ${input.workspaceId}
        and ${w.toolKind} = 'carousel' and ${s.isCurrent} = true
        and ${s.status} = 'completed' and ${s.outputKey} is not null
      union all
      select 'derivation:' || ${d.id}::text, 'derivation'::text, ${d.id}::text,
        null::text, ${c.id}::text, ${c.name}, ${d.format}, ${d.outputKey},
        ${d.createdAt}, null::integer
      from ${d} inner join ${c} on ${c.id} = ${d.campaignId}
      where ${campaignScope} and ${d.workspaceId} = ${input.workspaceId}
        and ${d.status} = 'completed' and ${d.isPreview} = false
        and ${d.outputKey} is not null
    )
    select id, kind, source_id as "sourceId", work_id as "workId",
      campaign_id as "campaignId", title, format, output_key as "outputKey",
      created_at as "createdAt", position,
      to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "sortAt"
    from produced ${after} order by created_at desc, id desc limit ${input.limit + 1}
  `;
}

export async function readCreativeProductionPage(input: ProductionQuery) {
  const result = await db.execute<ProductionRow>(productionPageSql(input));
  const production = result.rows.slice(0, input.limit);
  const last = production.at(-1);
  return {
    rows: production,
    nextCursor: result.rows.length > input.limit && last
      ? encodeProductionCursor(last)
      : null,
  };
}
