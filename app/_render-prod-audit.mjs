import pg from 'pg';

const conn = process.env.DATABASE_URL;
const client = new pg.Client({
  connectionString: conn,
  ssl: { rejectUnauthorized: false, require: true },
  connectionTimeoutMillis: 10000,
  statement_timeout: 20000,
});

async function q(sql, params = []) {
  const r = await client.query(sql, params);
  return r.rows;
}

async function main() {
  await client.connect();
  console.log('Connected.');

  // 1) Schemas
  console.log('\n=== SCHEMAS ===');
  const schemas = await q("select schema_name from information_schema.schemata order by schema_name");
  console.log(schemas.map(s => s.schema_name).join(', '));

  // 2) Migrations table — drizzle typically uses drizzle.__drizzle_migrations or a migrations table
  console.log('\n=== MIGRATION TABLES ===');
  const migTables = await q(`
    select table_schema, table_name
    from information_schema.tables
    where table_name ilike '%migration%' or table_name ilike '%drizzle%'
    order by table_schema, table_name
  `);
  console.log(migTables.map(t => `${t.table_schema}.${t.table_name}`).join('\n'));

  // 3) Try to list applied migrations — search across schemas
  for (const t of migTables) {
    console.log(`\n=== ${t.table_schema}.${t.table_name} contents ===`);
    const rows = await q(`select * from "${t.table_schema}"."${t.table_name}" order by 1 limit 200`);
    console.log(`rows: ${rows.length}`);
    if (rows.length > 0) {
      console.log('columns:', Object.keys(rows[0]).join(', '));
      for (const r of rows.slice(0, 20)) {
        // show only the migration id / hash / filename if present
        const id = r.id ?? r.hash ?? r.name ?? r.filename ?? r.migration_name ?? r.created_at ?? '';
        const tag = r.tag ?? r.name ?? '';
        console.log(`  ${JSON.stringify({ ...r, ...(r.id ? {} : {}) }).slice(0, 220)}`);
      }
      // Specifically search for 0062 / 0063
      const has62 = rows.some(r => Object.values(r).some(v => String(v).includes('0062')));
      const has63 = rows.some(r => Object.values(r).some(v => String(v).includes('0063')));
      console.log(`\nContains 0062: ${has62}`);
      console.log(`Contains 0063: ${has63}`);
    }
  }

  // 4) Guided journey / telemetry tables
  console.log('\n=== GUIDED / TELEMETRY TABLES ===');
  const gjTables = await q(`
    select table_schema, table_name
    from information_schema.tables
    where (table_name ilike '%guided%' or table_name ilike '%journey%' or table_name ilike '%telemetr%' or table_name ilike '%funnel%' or table_name ilike '%event%')
    order by table_schema, table_name
  `);
  console.log(gjTables.map(t => `${t.table_schema}.${t.table_name}`).join('\n'));

  // 5) For each guided/telemetry table, count rows
  for (const t of gjTables) {
    const r = await q(`select count(*)::int as n from "${t.table_schema}"."${t.table_name}"`);
    console.log(`  ${t.table_schema}.${t.table_name}: ${r[0].n} rows`);
  }

  await client.end();
}

main().catch(e => { console.error('ERR:', e.message); process.exit(1); });