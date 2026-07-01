import { z } from "zod";
import { requireRole, requireWorkspaceAccess } from "@/server/auth/workspace";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import { runAssistantTurn } from "@/server/assistant/orchestrator";
import { encodeAssistantSseEvent } from "@/server/assistant/stream/sse";
import { apiError, handleApiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/with-rate-limit";
import { isAllowedImageType } from "@/lib/upload-config";
import { getWorkspaceAssetById } from "@/server/repositories/workspace-asset";
import { objectStorage } from "@/server/storage";

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
          for await (const event of runAssistantTurn({
            workspaceId: workspace.id,
            clientProfileId: thread.clientProfileId,
            threadId,
            userId: user.id,
            userMessage: parsed.data.message,
            attachments,
          })) {
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
