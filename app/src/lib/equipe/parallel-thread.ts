// Opens a parallel conversation from the navigation: the Assistant thread is created first, then bound to the
// account by `open_parallel_thread`. The binding is what sends the conversation through the Strategist and the
// free-account ceiling, so the thread is only opened once it is bound, and a thread whose binding was refused is
// taken back. No new route: the calls are existing ones.

import { apiFetch } from "@/lib/api-client";
import { EquipeCommandError, postEquipeCommand } from "@/lib/equipe/commands";

/** The module stores the topic in a 200-character column. */
export const PARALLEL_TOPIC_MAX = 200;

async function bind(accountId: string, assistantThreadId: string, topic: string) {
  await postEquipeCommand(accountId, { type: "open_parallel_thread", payload: { assistantThreadId, topic } });
}

async function bindWithRetry(accountId: string, assistantThreadId: string, topic: string) {
  try {
    await bind(accountId, assistantThreadId, topic);
  } catch (error) {
    // A refusal is final (permission, account state). Only a lost connection or a server error is worth one more try.
    if (error instanceof EquipeCommandError && error.status < 500) throw error;
    try {
      await bind(accountId, assistantThreadId, topic);
    } catch (retry) {
      // The first answer was lost after the module had bound the thread: it is already this account's conversation.
      if (!(retry instanceof EquipeCommandError && retry.code === "thread_conflict")) throw retry;
    }
  }
}

/**
 * Takes back the thread created for a binding that was refused, so it does not stay in the workspace as a conversation
 * no account owns. The server only deletes a thread nobody used and no account owns, so asking is always safe, and a
 * failure here must not hide why the binding failed.
 */
async function discard(assistantThreadId: string) {
  try {
    await apiFetch(`/api/assistant/threads/${assistantThreadId}`, { method: "DELETE" });
  } catch {
    // Best effort: the conversation is unreachable through the pilot's screens either way.
  }
}

export async function openParallelConversation(input: {
  accountId: string;
  clientProfileId: string;
  topic: string;
}): Promise<string> {
  const topic = input.topic.trim().slice(0, PARALLEL_TOPIC_MAX).trim();
  if (!topic) throw new Error("topic_required");
  const response = await apiFetch("/api/assistant/threads", {
    method: "POST",
    timeoutMs: 60_000,
    headers: { "Content-Type": "application/json" },
    // Classic experience: the goal-agent pilot must not claim a conversation that belongs to the account.
    body: JSON.stringify({ clientProfileId: input.clientProfileId, name: topic, experience: "classic" }),
  });
  if (!response.ok) throw new Error("thread_create_failed");
  const { thread } = (await response.json()) as { thread: { id: string } };
  try {
    await bindWithRetry(input.accountId, thread.id, topic);
  } catch (error) {
    await discard(thread.id);
    throw error;
  }
  return thread.id;
}
