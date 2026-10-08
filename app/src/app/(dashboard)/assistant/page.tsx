import ConversationScreen from "@/components/assistant/conversation/ConversationScreen";
import { redirect } from "next/navigation";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import { db } from "@/server/db";
import { createPostgresEquipeUnitOfWork } from "@/server/equipe/data/postgres";
import { findEquipeThreadByAssistantThread } from "@/server/equipe/module/threads";
import { z } from "zod";

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ threadId?: string | string[] }>;
}) {
  const { threadId: rawThreadId } = await searchParams;
  const threadId = typeof rawThreadId === "string" && rawThreadId.trim() ? rawThreadId : undefined;
  const { workspace } = await requireWorkspaceAccess();
  // Only the conversations bound to an account open here. A thread of the workspace that no account owns (a creation whose
  // binding was refused) would answer outside the Strategist and the free ceiling, so it goes home like an invalid one.
  const thread = threadId && z.string().uuid().safeParse(threadId).success
    ? await getAssistantThreadById(workspace.id, threadId)
    : null;
  const owned = thread
    ? await findEquipeThreadByAssistantThread(createPostgresEquipeUnitOfWork(db).repos, workspace.id, thread.clientProfileId, thread.id)
    : null;
  if (!thread || !owned) redirect("/");
  return <ConversationScreen threadId={thread.id} />;
}
