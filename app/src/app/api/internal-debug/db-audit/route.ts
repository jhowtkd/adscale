/**
 * TEMPORARY DEBUG ROUTE — for v13.8 Phase 202 audit only.
 *
 * Returns 404 unless BOTH env vars are set:
 *   - ENABLE_DEBUG_ROUTES=true
 *   - DEBUG_AUDIT_TOKEN=<random secret>
 *
 * Auth: header `X-Debug-Token` must equal DEBUG_AUDIT_TOKEN.
 *
 * Read-only. Whitelisted SQL only (no user-supplied queries).
 *
 * {{ status: temporary, do not ship to prod without cleanup }}
 * {{ owner: Phase 202 staging evidence collection }}
 */
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/server/db";

function isEnabled(): boolean {
  return (
    process.env.ENABLE_DEBUG_ROUTES === "true" &&
    !!process.env.DEBUG_AUDIT_TOKEN
  );
}

function checkAuth(request: Request): boolean {
  const token = request.headers.get("x-debug-token");
  return token === process.env.DEBUG_AUDIT_TOKEN;
}

async function getMigrations() {
  // drizzle stores migrations in public.__drizzle_migrations (or similar)
  const result = await db.execute(sql`
    select
      m.id,
      m.hash,
      m.created_at,
      m."0070_index" as idx
    from public."__drizzle_migrations" m
    order by m.id
  `);
  return result.rows;
}

async function checkMigrationsExist() {
  // Check 0062 / 0063 columns exist on expected tables
  const cols = await db.execute(sql`
    select table_schema, table_name, column_name
    from information_schema.columns
    where table_schema = 'adscale_app'
      and (
        (table_name = 'assistant_guided_flows' and column_name in ('revision','schema_version','recoverable_error'))
        or (table_name = 'assistant_action_records' and column_name in ('source_flow_revision','source_snapshot_digest'))
      )
    order by table_name, column_name
  `);
  return cols.rows;
}

async function getGuidedStartCounts() {
  const result = await db.execute(sql`
    select
      event_key,
      path,
      count(*)::int as count,
      min(occurred_at) as first_seen,
      max(occurred_at) as last_seen
    from adscale_app.assistant_guided_flow_events
    group by event_key, path
    order by event_key, path
  `);
  return result.rows;
}

async function getGuidedRecentEvents() {
  const result = await db.execute(sql`
    select
      id,
      workspace_id,
      client_profile_id,
      thread_id,
      path,
      step,
      event_key,
      occurred_at,
      campaign_id
    from adscale_app.assistant_guided_flow_events
    order by occurred_at desc
    limit 20
  `);
  return result.rows;
}

async function getDrizzleJournal() {
  // drizzle also stores a journal in drizzle/__drizzle_migrations journal file
  // But we can also check if the table exists in public
  const result = await db.execute(sql`
    select to_regclass('public.__drizzle_migrations') as table_exists,
           to_regclass('adscale_app.assistant_guided_flow_events') as guided_events_exists,
           to_regclass('adscale_app.assistant_guided_flows') as guided_flows_exists,
           to_regclass('adscale_app.assistant_action_records') as action_records_exists,
           to_regclass('adscale_app.assistant_guided_flow_transitions') as guided_transitions_exists
  `);
  return result.rows[0] ?? {};
}

export async function GET(request: Request) {
  if (!isEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get("action") ?? "all";

  try {
    const result: Record<string, unknown> = { ok: true, action };

    if (action === "migrations" || action === "all") {
      result.tableCheck = await getDrizzleJournal();
      try {
        result.migrations = await getMigrations();
      } catch (e) {
        result.migrationsError = e instanceof Error ? e.message : String(e);
      }
      result.expectedColumns = await checkMigrationsExist();
    }

    if (action === "guided" || action === "all") {
      result.guidedStartCounts = await getGuidedStartCounts();
      result.guidedRecentEvents = await getGuidedRecentEvents();
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}