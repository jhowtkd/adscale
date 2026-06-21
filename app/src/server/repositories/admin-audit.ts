import { db } from "@/server/db";
import { adminAuditLog, type NewAdminAuditLog } from "@/server/db/schema";

export type RecordAdminAuditInput = Omit<NewAdminAuditLog, "id" | "createdAt"> & {
  reason: string;
};

export async function recordAdminAuditLog(input: RecordAdminAuditInput): Promise<string> {
  const [row] = await db
    .insert(adminAuditLog)
    .values({
      actorEmail: input.actorEmail,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      payload: input.payload ?? null,
      reason: input.reason,
      status: input.status ?? "success",
    })
    .returning({ id: adminAuditLog.id });

  return row.id;
}
