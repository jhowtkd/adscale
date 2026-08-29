import "./load-env";

import { eq } from "drizzle-orm";

import { db } from "../src/server/db";
import { creativeWorkItems, creativeWorkOutputs } from "../src/server/db/schema";

const workId = process.argv[2];
if (!workId) throw new Error("usage: tsx scripts/reset-failed-creative-work.ts <workId>");

async function main() {
  const deleted = await db
    .delete(creativeWorkOutputs)
    .where(eq(creativeWorkOutputs.workItemId, workId));
  const updated = await db
    .update(creativeWorkItems)
    .set({ status: "draft", updatedAt: new Date() })
    .where(eq(creativeWorkItems.id, workId));
  console.log(`deleted outputs: ${deleted.rowCount}, works reset to draft: ${updated.rowCount}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
