import { z } from "zod";
import { getLocale, getTranslations } from "next-intl/server";
import { requireRole, requireWorkspaceAccess } from "@/server/auth/workspace";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import { runAssistantTurn } from "@/server/assistant/orchestrator";
import { runGoalAgentTurn } from "@/server/assistant/goal/orchestrator-loop";
import { getGoalRunByThread } from "@/server/repositories/assistant-goal";
import { encodeAssistantSseEvent } from "@/server/assistant/stream/sse";
import { apiError, handleApiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/with-rate-limit";
import { isAllowedImageType } from "@/lib/upload-config";
import { getWorkspaceAssetById } from "@/server/repositories/workspace-asset";
import type { UserMessageAttachment } from "@/server/repositories/assistant-message";
import { objectStorage } from "@/server/storage";
import { db } from "@/server/db";
import { createEquipeRouteDeps } from "@/server/equipe/http/deps";
import { createPostgresEquipeUnitOfWork } from "@/server/equipe/data/postgres";
import { findEquipeThreadByAssistantThread } from "@/server/equipe/module/threads";
import { findFreePlanAccount } from "@/server/equipe/module/free-plan";
import type { EquipeModuleDeps } from "@/server/equipe/module/ports";
import { DrizzleLedgerStore } from "@/server/equipe/agents/ledger";
import { createEquipeAgents } from "@/server/equipe/agents/runner";
import {
  liveConversationWriter,
  runEquipeStrategistTurn,
} from "@/server/equipe/agents/chat-turn";

const attachmentSchema = z.object({
  assetId: z.string().uuid(),
  key: z.string().min(1),
  type: z.string().min(1),
  name: z.string().min(1),
  size: z.number().int().positive(),
});

const chatBodySchema = z
  .object({
    message: z.string().trim(),
    attachments: z.array(attachmentSchema).max(5).optional(),
    payload: z.object({ fromSuggestion: z.boolean().optional() }).strict().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.message && (!value.attachments || value.attachments.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "message or attachments required",
        path: ["message"],
      });
    }

    for (const [index, attachment] of (value.attachments ?? []).entries()) {
      if (!isAllowedImageType(attachment.type)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "invalid attachment type",
          path: ["attachments", index, "type"],
        });
      }
    }
  });

async function normalizeAttachments(
  workspaceId: string,
  attachments: z.infer<typeof attachmentSchema>[] | undefined
) {
  if (!attachments?.length) {
    return undefined;
  }

  const normalized = [];
  for (const attachment of attachments) {
    const asset = await getWorkspaceAssetById(attachment.assetId, workspaceId);
    if (!asset || asset.key !== attachment.key) {
      return null;
    }
    if (!isAllowedImageType(asset.type)) {
      return null;
    }
    normalized.push({
      assetId: asset.id,
      key: asset.key,
      url: objectStorage.publicUrl(asset.key),
      type: asset.type,
      name: asset.name,
      size: asset.size ?? attachment.size,
    });
  }
  return normalized;
}

async function* runEquipeTurn(input: {
  workspaceId: string;
  accountId: string;
  threadId: string;
  userMessage: string;
  fromSuggestion?: boolean;
  attachments?: UserMessageAttachment[];
  executionPausedMessage: string;
  userId: string;
  locale: string;
}) {
  const moduleDeps: EquipeModuleDeps = createEquipeRouteDeps(input.workspaceId);
  const agents = createEquipeAgents({
    moduleDeps,
    ledger: new DrizzleLedgerStore(db),
    now: () => moduleDeps.clock.now(),
  });
  const people = await moduleDeps.uow.repos.people.list(input);
  const person = people.find(p => p.active && p.userId === input.userId && p.role === "approver");
  yield* runEquipeStrategistTurn({
    locale: input.locale,
    ...(person ? { actor: { kind: "client_person" as const, role: "approver" as const, personId: person.id } } : {}),
    deps: moduleDeps,
    agents,
    messages: liveConversationWriter(input.workspaceId),
    workspaceId: input.workspaceId,
    accountId: input.accountId,
    threadId: input.threadId,
    userMessage: input.userMessage,
    fromSuggestion: input.fromSuggestion,
    attachments: input.attachments,
    executionPausedMessage: input.executionPausedMessage,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const [{ workspace, user }, { threadId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    const rateLimitResult = await checkRateLimit(request, { category: "ai", workspaceId: workspace.id });
    if (rateLimitResult) return rateLimitResult;

    const thread = await getAssistantThreadById(workspace.id, threadId);
    if (!thread) {
      return apiError("threadNotFound", 404);
    }

    await requireRole(workspace.id, user.id, ["owner", "admin", "member"]);

    // Account conversations (#551): a thread in an account's conversation map goes to the Strategist.
    const equipeMatch = await findEquipeThreadByAssistantThread(
      createPostgresEquipeUnitOfWork(db).repos,
      workspace.id,
      thread.clientProfileId,
      threadId
    );
    // A conversation that no account owns (one whose binding was refused, say) would be answered by the classic assistant,
    // outside the Strategist and the free ceiling: it is refused, by the same rule as the /assistant page. A campaign's own
    // thread is the exception: the campaign page keeps its assistant panel...
    if (!equipeMatch && !thread.campaignId) {
      return apiError("threadNotInAccount", 409);
    }
    // ...except on the free plan (ticket 11, part 2): the campaign assistant runs outside the Strategist and the free ceiling.
    if (!equipeMatch) {
      const freePlan = await findFreePlanAccount(workspace.id);
      if (freePlan) return apiError("free_plan", 403, { reason: "free_plan", accountId: freePlan.accountId });
    }

    const body = await request.json();
    const parsed = chatBodySchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const attachments = await normalizeAttachments(
      workspace.id,
      parsed.data.attachments
    );
    if (attachments === null) {
      return apiError("assetNotFound", 404);
    }

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Every thread outside the account's map keeps its current
          // behavior (a non-campaign thread outside it is refused above,
          // always) — goal-agent threads run the bounded tool-result loop
          // and a campaign's own thread keeps the guided orchestrator.
          const goalRun =
            equipeMatch === null ? await getGoalRunByThread(workspace.id, threadId) : null;
          const turn = equipeMatch
            ? runEquipeTurn({
                workspaceId: workspace.id,
                accountId: equipeMatch.account.id,
                threadId,
                userMessage: parsed.data.message,
                fromSuggestion: parsed.data.payload?.fromSuggestion,
                userId: user.id,
                locale: await getLocale(),
                attachments,
                executionPausedMessage: (await getTranslations("assistant.equipe"))("executionPaused"),
              })
            : goalRun && goalRun.stage !== "completed" && goalRun.stage !== "stopped"
              ? runGoalAgentTurn({
                  workspaceId: workspace.id,
                  clientProfileId: thread.clientProfileId,
                  threadId,
                  userId: user.id,
                  userMessage: parsed.data.message,
                  attachments,
                })
              : runAssistantTurn({
                  workspaceId: workspace.id,
                  clientProfileId: thread.clientProfileId,
                  threadId,
                  userId: user.id,
                  userMessage: parsed.data.message,
                  attachments,
                });

          for await (const event of turn) {
            if (event.type === "text_delta") {
              controller.enqueue(
                encodeAssistantSseEvent("text_delta", { text: event.text })
              );
            } else if (event.type === "tool_summary") {
              controller.enqueue(
                encodeAssistantSseEvent("tool_summary", {
                  toolName: event.toolName,
                  summary: event.summary,
                })
              );
            } else if (event.type === "action_card") {
              controller.enqueue(
                encodeAssistantSseEvent("action_card", {
                  actionRecordId: event.actionRecordId,
                  status: event.status,
                })
              );
            } else if (event.type === "equipe_card") {
              controller.enqueue(
                encodeAssistantSseEvent("equipe_card", {
                  messageId: event.messageId,
                  card: event.card,
                })
              );
            } else if (event.type === "goal_state") {
              // Tell the client to refetch its goal projection; we never stream
              // the projection itself over SSE to avoid persisting a stale DTO.
              controller.enqueue(
                encodeAssistantSseEvent("goal_state", {})
              );
            } else if (event.type === "done") {
              controller.enqueue(
                encodeAssistantSseEvent("done", {
                  assistantMessageId: event.assistantMessageId,
                })
              );
            } else if (event.type === "error") {
              controller.enqueue(
                encodeAssistantSseEvent("error", { message: event.message })
              );
            }
          }
        } catch (error) {
          // Surface a generic message to the client and capture the real
          // error (which may contain provider/internal details) on the
          // server via Sentry through handleApiError's logging path.
          // Avoids leaking raw exception text (DB errors, hostnames, SDK
          // diagnostics) over the SSE channel.
          logger.error("[assistant.chat] stream error", error);
          controller.enqueue(
            encodeAssistantSseEvent("error", {
              message: "assistantStreamError",
            })
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleApiError(error, "assistant.threads.[threadId].chat.POST");
  }
}
