#!/usr/bin/env node
/**
 * Audit a campaign's derivation session for QA review.
 * Usage: DATABASE_URL=... node scripts/audit-campaign-session.mjs <campaignId>
 */
import pg from "pg";

const campaignId = process.argv[2];
if (!campaignId) {
  console.error("Usage: node scripts/audit-campaign-session.mjs <campaignId>");
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

async function queryWithOptionalColumns(sqlWithNewCols, sqlLegacy) {
  try {
    return await client.query(sqlWithNewCols, [campaignId]);
  } catch (error) {
    if (error?.code === "42703") {
      return client.query(sqlLegacy, [campaignId]);
    }
    throw error;
  }
}

const campaign = await queryWithOptionalColumns(
  `SELECT id, name, generation_mode, creative_level, cta_variants, campaign_memory, creative_diagnosis_status
   FROM adscale_app.campaigns WHERE id = $1`,
  `SELECT id, name, generation_mode, creative_level, cta_variants, creative_diagnosis_status
   FROM adscale_app.campaigns WHERE id = $1`
);

const derivations = await queryWithOptionalColumns(
  `SELECT id, status, generation_mode, format, variant_index, cta_text,
          quality_score, quality_verdict, hard_failures, score_issues,
          qa_status, regeneration_suggestion, generation_log, created_at, updated_at
   FROM adscale_app.derivations
   WHERE campaign_id = $1
   ORDER BY created_at ASC`,
  `SELECT id, status, generation_mode, format, variant_index, cta_text,
          quality_score, quality_verdict, hard_failures, score_issues,
          qa_status, regeneration_suggestion, created_at, updated_at
   FROM adscale_app.derivations
   WHERE campaign_id = $1
   ORDER BY created_at ASC`
);

await client.end();

const summary = {
  campaign: campaign.rows[0] ?? null,
  derivationCount: derivations.rows.length,
  byStatus: {},
  hardFailureCodes: {},
  autoRetries: 0,
  derivations: derivations.rows.map((row) => {
    const log = row.generation_log;
    if (log?.autoRetryAttempted) summary.autoRetries += 1;
    summary.byStatus[row.status] = (summary.byStatus[row.status] ?? 0) + 1;
    const failures = Array.isArray(row.hard_failures) ? row.hard_failures : [];
    for (const f of failures) {
      if (f?.code) {
        summary.hardFailureCodes[f.code] = (summary.hardFailureCodes[f.code] ?? 0) + 1;
      }
    }
    return {
      id: row.id,
      status: row.status,
      mode: row.generation_mode,
      format: row.format,
      ctaText: row.cta_text,
      qualityVerdict: row.quality_verdict,
      qualityScore: row.quality_score,
      hardFailures: failures,
      scoreIssues: row.score_issues,
      regenerationSuggestion: row.regeneration_suggestion,
      autoRetryAttempted: log?.autoRetryAttempted ?? false,
      createdAt: row.created_at,
    };
  }),
};

console.log(JSON.stringify(summary, null, 2));
