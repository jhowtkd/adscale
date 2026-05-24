import { eq, and, desc, isNull } from "drizzle-orm";
import { db } from "../db";
import { notifications } from "../db/schema";

export interface CreateNotificationInput {
  userId: string;
  workspaceId: string;
  type: string;
  title: string;
  message: string;
  derivationId?: string | null;
  campaignId?: string | null;
}

export async function createNotification(data: CreateNotificationInput) {
  const result = await db
    .insert(notifications)
    .values({
      userId: data.userId,
      workspaceId: data.workspaceId,
      type: data.type,
      title: data.title,
      message: data.message,
      derivationId: data.derivationId ?? null,
      campaignId: data.campaignId ?? null,
    })
    .returning();
  return result[0];
}

export async function getNotificationsByUser(userId: string, workspaceId: string, limit = 50) {
  return db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.workspaceId, workspaceId)
      )
    )
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function getUnreadNotificationCount(userId: string, workspaceId: string) {
  const rows = await db
    .select({ count: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.workspaceId, workspaceId),
        isNull(notifications.readAt)
      )
    );
  return rows.length;
}

export async function markNotificationAsRead(notificationId: string, userId: string) {
  const result = await db
    .update(notifications)
    .set({ readAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, userId)
      )
    )
    .returning();
  return result[0] ?? null;
}

export async function markAllNotificationsAsRead(userId: string, workspaceId: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.workspaceId, workspaceId),
        isNull(notifications.readAt)
      )
    );
}

export async function deleteNotificationsByUser(userId: string, workspaceId: string) {
  await db
    .delete(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.workspaceId, workspaceId)
      )
    );
}
