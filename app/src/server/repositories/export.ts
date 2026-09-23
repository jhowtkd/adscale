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

export async function createExportRecords(
  workspaceId: string,
  derivationIds: string[],
  format: string,
  key: string,
) {
  if (derivationIds.length === 0) return;
  await db.insert(exports).values(derivationIds.map((derivationId) => ({
    workspaceId,
    derivationId,
    format,
    key,
  })));
}

async function getExportsByWorkspace(workspaceId: string) {
  return db
    .select()
    .from(exports)
    .where(eq(exports.workspaceId, workspaceId))
    .orderBy(desc(exports.createdAt));
}
