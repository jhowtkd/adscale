import { handoffText } from "@/lib/equipe/handoff-copy";
import { FREE_INTRO_EVENT, LIBRARY_ASSEMBLED_EVENT } from "../handoff/contract";
import { DIAGNOSIS_BUILDING_TEXT, DIAGNOSIS_CARD_TITLE } from "@/lib/equipe/diagnosis-copy";
import { DIAGNOSTIC_RECORDED_EVENT } from "../agents/free-budget";
import { DIAGNOSIS_FAILED_EVENT, DIAGNOSIS_RESTORED_EVENT, DIAGNOSIS_STARTED_EVENT, diagnosisContentSchema } from "../handoff/diagnosis-contract";
import { diagnosisCardLine, diagnosisCardPayload, diagnosisFailureCardPayload } from "../handoff/diagnosis";
import type { EquipeEvent } from "../data";
import type { CommandContext } from "./shared";
import type { CreateAssistantMessageInput } from "../../repositories/assistant-message";
import { buildBatchCard } from "../agents/cards";
import { templateFor } from "../jobs/notification-templates";
import { authorizeAccountExecution, PROACTIVE_REMINDERS, requiresExecutionForMessage } from "./execution-authorization";
import { requestSupportPayloadSchema } from "./envelope";

/** One source event -> one message, in the same store read by the Assistant. */
export async function projectConversationEvent(ctx: CommandContext, event: EquipeEvent) {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const purpose = event.eventType === "support_exception.opened"
    ? requestSupportPayloadSchema.shape.purpose.parse(payload.purpose) : undefined;
  const reminder = event.eventType === "notification.requested" && PROACTIVE_REMINDERS.includes(String(payload.templateKey));
  if (!reminder && ![
    "handoff.decided", "handoff.card", "account.free_opened", FREE_INTRO_EVENT, LIBRARY_ASSEMBLED_EVENT,
    "staff.message_posted", "staff.contact_registered", "support_exception.assumed",
    "support_exception.closed", "support_exception.opened", "batch.delivered",
    DIAGNOSIS_STARTED_EVENT, DIAGNOSTIC_RECORDED_EVENT, DIAGNOSIS_RESTORED_EVENT, DIAGNOSIS_FAILED_EVENT,
  ].includes(event.eventType)) return null;
  const scope = { workspaceId: ctx.workspaceId, accountId: ctx.accountId };
  if (event.workspaceId !== scope.workspaceId || event.accountId !== scope.accountId) {
    throw new Error("conversation_event_scope_mismatch");
  }
  // Human incident/support communication remains available. Automated content
  // and reminders must stop before reading cards or conversation context.
  if (requiresExecutionForMessage(event)) {
    const allowed = await authorizeAccountExecution(ctx.repos, scope);
    if (!allowed.ok) return null;
  }
  const primary = (await ctx.repos.threads.list(scope)).find((row) => row.kind === "primary");
  if (!primary?.assistantThreadId) return null;
  const account = await ctx.repos.accounts.get(scope.workspaceId, scope.accountId);
  const thread = await ctx.repos.conversations.get(scope.workspaceId, primary.assistantThreadId);
  if (!account || !thread || thread.clientProfileId !== account.clientProfileId) {
    throw new Error("conversation_thread_scope_mismatch");
  }
  const actor = event.actorType === "staff" ? "staff" : event.actorType === "agent" ? "agent" : "system";
  const staff = actor === "staff" && event.actorId ? await ctx.internal.staff.get(event.actorId) : null;
  const name = typeof payload.staffName === "string" ? payload.staffName : staff?.displayName ?? "ADScale";
  let input: CreateAssistantMessageInput;
  if (["handoff.card", "account.free_opened"].includes(event.eventType)) {
    const [h] = await ctx.repos.handoffs.list(scope);
    if (!h) return null;
    input = h.step === "done" ? { threadId: thread.id, type: "assistant", content: handoffText("done"), payload: { handoffStep: "done" } }
      : { threadId: thread.id, type: "equipe_card", content: handoffText(h.step), payload: { kind: "handoff", accountId: scope.accountId, handoffId: h.id, step: h.step, title: handoffText(h.step), items: [] } };
  } else if (event.eventType === FREE_INTRO_EVENT) {
    // The Strategist's opening line, before the first handoff card. The client shows it in the reader's language.
    input = { threadId: thread.id, type: "assistant", content: handoffText("intro"), payload: { handoffStep: "intro" } };
  } else if (event.eventType === LIBRARY_ASSEMBLED_EVENT) {
    const items = typeof payload.items === "number" && Number.isInteger(payload.items) && payload.items >= 0 ? payload.items : 0;
    const text = `Biblioteca montada · ${items} ${items === 1 ? "item" : "itens"}`;
    input = { threadId: thread.id, type: "equipe_event", content: text, payload: { kind: LIBRARY_ASSEMBLED_EVENT, text, items } };
  } else if (event.eventType === DIAGNOSIS_STARTED_EVENT) {
    input = { threadId: thread.id, type: "equipe_event", content: DIAGNOSIS_BUILDING_TEXT,
      payload: { kind: DIAGNOSIS_STARTED_EVENT, text: DIAGNOSIS_BUILDING_TEXT, actor } };
  } else if (event.eventType === DIAGNOSTIC_RECORDED_EVENT || event.eventType === DIAGNOSIS_RESTORED_EVENT) {
    // The document is written in this same transaction (or already was, when the person went back to it); the card is its immutable copy.
    const document = typeof payload.documentId === "string" ? await ctx.repos.documents.get(scope, payload.documentId) : null;
    const content = document ? diagnosisContentSchema.safeParse(document.content) : null;
    if (!document || !content?.success) return null;
    const [h] = await ctx.repos.handoffs.list(scope);
    input = { threadId: thread.id, type: "equipe_card", content: diagnosisCardLine(content.data),
      payload: { ...diagnosisCardPayload({ accountId: scope.accountId, documentId: document.id, content: content.data, readsUsed: h?.readsUsed ?? 3 }) } };
  } else if (event.eventType === DIAGNOSIS_FAILED_EVENT) {
    input = { threadId: thread.id, type: "equipe_card", content: `${DIAGNOSIS_CARD_TITLE} · não foi possível montar`,
      payload: { ...diagnosisFailureCardPayload({ accountId: scope.accountId, code: String(payload.code ?? "unknown"), retryable: payload.retryable === true }) } };
  } else if (event.eventType === "handoff.decided") {
    const text = `Você confirmou uma parte da marca · ${ctx.now.toISOString()}`;
    input = { threadId: thread.id, type: "equipe_event", content: text, payload: { kind: "handoff.decided", text, command: payload.command, step: payload.step } };
  } else if (event.eventType === "staff.message_posted" || event.eventType === "staff.contact_registered") {
    if (actor !== "staff" || !event.actorId) throw new Error("invalid_staff_message_author");
    input = {
      threadId: thread.id, type: "staff_message",
      content: String(payload.body ?? payload.summary ?? ""),
      payload: { staffId: event.actorId, name },
    };
  } else if (event.eventType === "batch.delivered" && event.objectId) {
    const card = await buildBatchCard(ctx.repos, scope.workspaceId, scope.accountId, event.objectId);
    if (!card || card.items.length === 0) return null;
    input = { threadId: thread.id, type: "equipe_card", content: `Lote pronto para revisar: ${card.title}`, payload: { ...card, actor, actorId: event.actorId } };
  } else {
    const text = reminder ? templateFor(String(payload.templateKey)).template.message
      : event.eventType === "support_exception.assumed" ? `${name} entrou na conversa.`
        : event.eventType === "support_exception.closed" ? `${name} devolveu a conversa ao Estrategista IA.`
          : payload.trigger === "out_of_contract_request" && purpose === "plan" ? "Recebemos seu pedido sobre o plano. Uma pessoa vai falar com você em até 1 dia útil."
          : "Chamei uma pessoa do ADScale para ajudar aqui.";
    input = { threadId: thread.id, type: "equipe_event", content: text,
      payload: { kind: reminder ? "reminder" : event.eventType, text, actor, actorId: event.actorId, ...(actor === "staff" ? { actorName: name } : {}) } };
  }
  const posted = await ctx.repos.conversations.post(scope.workspaceId, event.id, input);
  return { messageId: posted.id, threadId: thread.id };
}
