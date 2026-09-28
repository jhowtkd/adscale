// Proactive Equipe messages (#551): batch ready, reminders, and
// "chamei uma pessoa", written by the module side (actor system/agent) to
// the account's MAIN thread through the assistant message repository.
// Jobs and agents call this; the chat UI never does. When the account has
// no primary thread yet, the post is skipped (null) instead of failing.

import type { EquipeEventPayload } from "@/server/repositories/assistant-types";
import type { EquipeModuleDeps } from "../module/ports";
import { getEquipeThreads } from "../module/threads";
import { buildBatchCard } from "./cards";
import type { EquipeConversationWriter } from "./chat-turn";

export type ProactiveEquipeMessage =
  | { kind: "batch_ready"; batchId: string; text?: string; actor?: "system" | "agent" }
  | { kind: "reminder"; text: string; actor?: "system" | "agent"; ref?: { itemId?: string; batchId?: string } }
  | { kind: "staff_called"; staffName: string; text?: string; actor?: "system" | "agent" }
  | { kind: "custom_event"; eventKind: string; text: string; actor?: "system" | "agent" };

export type PostProactiveMessageInput = {
  deps: EquipeModuleDeps;
  messages: EquipeConversationWriter;
  workspaceId: string;
  accountId: string;
  message: ProactiveEquipeMessage;
};

export type ProactivePostResult = {
  messageId: string;
  threadId: string;
};

export async function postProactiveMessage(
  input: PostProactiveMessageInput,
): Promise<ProactivePostResult | null> {
  const view = await getEquipeThreads(input.deps.uow.repos, input.workspaceId, input.accountId);
  const assistantThreadId = view?.primary?.assistantThreadId ?? null;
  if (!assistantThreadId) return null;

  if (input.message.kind === "batch_ready") {
    const card = await buildBatchCard(
      input.deps.uow.repos,
      input.workspaceId,
      input.accountId,
      input.message.batchId,
    );
    if (card) {
      const content = input.message.text ?? `Lote pronto para revisar: ${card.title}`;
      const posted = await input.messages.post({
        threadId: assistantThreadId,
        type: "equipe_card",
        content,
        payload: { ...card, items: card.items.map((item) => ({ ...item })) },
      });
      return { messageId: posted.id, threadId: assistantThreadId };
    }
  }

  const event = toEventPayload(input.message);
  const posted = await input.messages.post({
    threadId: assistantThreadId,
    type: "equipe_event",
    content: event.text,
    payload: { ...event },
  });
  return { messageId: posted.id, threadId: assistantThreadId };
}

function toEventPayload(message: ProactiveEquipeMessage): EquipeEventPayload {
  switch (message.kind) {
    case "batch_ready":
      return { kind: "batch_ready", text: message.text ?? "Um lote ficou pronto para revisar.", actor: message.actor ?? "agent" };
    case "reminder":
      return {
        kind: "reminder",
        text: message.text,
        actor: message.actor ?? "system",
        ...(message.ref ? { ref: message.ref } : {}),
      };
    case "staff_called":
      return {
        kind: "staff_called",
        text: message.text ?? `Chamei ${message.staffName} para ajudar aqui.`,
        actor: message.actor ?? "agent",
        actorName: message.staffName,
      };
    case "custom_event":
      return { kind: message.eventKind, text: message.text, actor: message.actor ?? "system" };
  }
}
