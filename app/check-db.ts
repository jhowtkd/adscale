import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { derivations } from "./src/server/db/schema";
import { desc, sql } from "drizzle-orm";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

async function main() {
  const rows = await db.select().from(derivations).orderBy(desc(derivations.createdAt)).limit(30);
  console.log("Total derivations checked:", rows.length);
  
  // Group by campaign
  const byCampaign: Record<string, number> = {};
  for (const r of rows) {
    byCampaign[r.campaignId] = (byCampaign[r.campaignId] || 0) + 1;
  }
  console.log("\nBy campaign (last 30):");
  for (const [cid, count] of Object.entries(byCampaign)) {
    console.log(`  ${cid}: ${count}`);
  }
  
  // Check total count
  const total = await db.select({ count: sql<number>`count(*)` }).from(derivations);
  console.log(`\nTotal derivations in DB: ${total[0].count}`);
  
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
