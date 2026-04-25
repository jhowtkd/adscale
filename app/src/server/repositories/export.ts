import { eq, desc } from "drizzle-orm";
import { db } from "../db";
import { exports } from "../db/schema";

export async function createExportRecord(
  workspaceId: string,
  derivationId: string,
  format: string,
  key: string
) {
  const result = await db
    .insert(exports)
    .values({
      workspaceId,
      derivationId,
      format,
      key,
    })
    .returning();
  return result[0];
}

export async function getExportsByWorkspace(workspaceId: string) {
  return db
    .select()
    .from(exports)
    .where(eq(exports.workspaceId, workspaceId))
    .orderBy(desc(exports.createdAt));
}
