import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/server/db";
import { derivations, campaigns } from "../src/server/db/schema";
import { sql } from "drizzle-orm";

async function main() {
  console.log("=== Recent Derivations ===");
  const ders = await db
    .select()
    .from(derivations)
    .orderBy(sql`created_at desc`)
    .limit(10);
  console.log(JSON.stringify(ders, null, 2));

  console.log("\n=== Recent Campaigns ===");
  const camps = await db
    .select()
    .from(campaigns)
    .orderBy(sql`created_at desc`)
    .limit(5);
  console.log(JSON.stringify(camps, null, 2));
}

main().catch(console.error);
