/**
 * TEMPORARY DEBUG ROUTE — for v13.8 Phase 202 evidence only.
 *
 * Returns 404 unless BOTH env vars are set:
 *   - ENABLE_DEBUG_ROUTES=true
 *   - DEBUG_AUDIT_TOKEN=<random secret>
 *
 * Auth: header `X-Debug-Token` must equal DEBUG_AUDIT_TOKEN.
 *
 * Read-only. No writes.
 *
 * {{ status: temporary, will be removed after Phase 202 closes }}
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

async function getGuidedStartCounts() {
  const result = await db.execute(sql`
    select
      path,
      count(*) filter (where event_key = 'guided_flow_started')::int as starts,
      count(*) filter (where event_key = 'guided_flow_completed')::int as completions,
      count(*) filter (where event_key = 'guided_flow_abandoned')::int as abandons,
      count(*) filter (where event_key = 'guided_action_confirmed')::int as actions_confirmed,
      count(*) filter (where event_key = 'guided_action_failed')::int as actions_failed,
      count(*)::int as total_events
    from adscale_app.assistant_guided_flow_events
    group by path
    order by path
  `);
  return result.rows;
}

async function getRecentEvents(limit = 30) {
  const result = await db.execute(sql`
    select
      id,
      path,
      step,
      event_key,
      thread_id,
      campaign_id,
      action_record_id,
      occurred_at
    from adscale_app.assistant_guided_flow_events
    order by occurred_at desc
    limit ${sql.raw(String(Math.min(limit, 200)))}
  `);
  return result.rows;
}

async function getSummary() {
  const result = await db.execute(sql`
    select
      (select count(*)::int from adscale_app.assistant_guided_flow_events
        where event_key = 'guided_flow_started') as total_starts,
      (select count(distinct path)::int from adscale_app.assistant_guided_flow_events
        where event_key = 'guided_flow_started') as distinct_paths,
      (select count(distinct thread_id)::int from adscale_app.assistant_guided_flow_events
        where event_key = 'guided_flow_started') as distinct_threads,
      (select max(occurred_at) from adscale_app.assistant_guided_flow_events
        where event_key = 'guided_flow_started') as last_started_at
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
  const action = url.searchParams.get("action") ?? "summary";

  try {
    const result: Record<string, unknown> = { ok: true, action, capturedAt: new Date().toISOString() };

    if (action === "summary" || action === "all") {
      result.summary = await getSummary();
    }
    if (action === "counts" || action === "all") {
      result.counts = await getGuidedStartCounts();
    }
    if (action === "recent" || action === "all") {
      const limit = Number(url.searchParams.get("limit") ?? 30);
      result.recent = await getRecentEvents(limit);
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