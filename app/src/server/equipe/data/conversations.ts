import { and, desc, eq, isNull, notExists } from "drizzle-orm";
import { assistantThreads, assistantGoalRuns } from "../../db/schema";
import type { PostgresEquipeExecutor } from "./postgres";
import type { EquipeConversationRepository } from "./repositories";

export function makePgConversations(executor: PostgresEquipeExecutor): EquipeConversationRepository {
  return {
    async get(workspaceId, threadId) {
      const [row] = await executor.select().from(assistantThreads).where(and(
        eq(assistantThreads.workspaceId, workspaceId), eq(assistantThreads.id, threadId),
      ));
      return row ?? null;
    },
    async ensurePrimary(workspaceId, clientProfileId) {
      // Called while holding the account lock. Never take over a creative goal.
      const [existing] = await executor.select().from(assistantThreads).where(and(
        eq(assistantThreads.workspaceId, workspaceId),
        eq(assistantThreads.clientProfileId, clientProfileId),
        isNull(assistantThreads.campaignId),
        notExists(executor.select({ id: assistantGoalRuns.id }).from(assistantGoalRuns)
          .where(eq(assistantGoalRuns.threadId, assistantThreads.id))),
      )).orderBy(desc(assistantThreads.updatedAt)).limit(1);
      if (existing) return existing;
      const [created] = await executor.insert(assistantThreads).values({
        workspaceId, clientProfileId, name: "Conversa principal", isDefault: true,
      }).returning();
      return created;
    },
    async post(workspaceId, sourceEventId, input) {
      // Keep repository construction independent of the application's global db.
      const { createAssistantMessageInTransaction } = await import("../../repositories/assistant-message");
      return createAssistantMessageInTransaction(executor, workspaceId, input, sourceEventId);
    },
  };
}
