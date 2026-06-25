import { getBrandKit } from "@/server/db/repositories/brand-kit";
import { getBrandMemoryContext } from "@/server/memory/brand-memory-context";
import { getCampaignById } from "@/server/repositories/campaign";
import { getClientProfile } from "@/server/repositories/client-reference";
import { listAssistantMessages } from "@/server/repositories/assistant-message";
import {
  getAssistantThreadById,
} from "@/server/repositories/assistant-thread";
import type { AssistantModelMessage, AssistantModelRequest } from "../model/client";
import {
  type AllowedContextShape,
  BRAND_KIT_ALLOWED_KEYS,
  CAMPAIGN_ALLOWED_KEYS,
  CLIENT_PROFILE_ALLOWED_KEYS,
  THREAD_ALLOWED_KEYS,
  pickAllowedFields,
} from "./allowlist";
import { ContextScopeError, sanitizeContextValue } from "./sanitize";

export interface AssistantContextInput {
  workspaceId: string;
  clientProfileId: string;
  threadId: string;
  messageLimit?: number;
}

export class AssistantContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssistantContextError";
  }
}

const DEFAULT_MESSAGE_LIMIT = 20;

function mapMessage(
  message: Awaited<ReturnType<typeof listAssistantMessages>>[number]
): AllowedContextShape["recentMessages"][number] {
  if (message.type === "tool") {
    const payload = (message.payload ?? {}) as Record<string, unknown>;
    return {
      role: message.type,
      content: message.content,
      toolName: typeof payload.toolName === "string" ? payload.toolName : undefined,
      summary: typeof payload.summary === "string" ? payload.summary : message.content,
    };
  }

  return {
    role: message.type,
    content: message.content,
  };
}

export async function buildAssistantContext(
  input: AssistantContextInput
): Promise<AllowedContextShape> {
  const thread = await getAssistantThreadById(input.workspaceId, input.threadId);
  if (!thread) {
    throw new AssistantContextError("Thread not found");
  }

  if (thread.clientProfileId !== input.clientProfileId) {
    throw new AssistantContextError("Thread client profile mismatch");
  }

  const messageLimit = input.messageLimit ?? DEFAULT_MESSAGE_LIMIT;

  const [profile, messages, brandKit, brandMemory] = await Promise.all([
    getClientProfile(input.workspaceId, input.clientProfileId),
    listAssistantMessages(input.workspaceId, input.threadId),
    getBrandKit(input.workspaceId, input.clientProfileId).catch(() => null),
    getBrandMemoryContext({
      workspaceId: input.workspaceId,
      clientProfileId: input.clientProfileId,
    }),
  ]);

  let campaign = null;
  if (thread.campaignId) {
    campaign = await getCampaignById(thread.campaignId, input.workspaceId);
    if (
      campaign?.clientProfileId &&
      campaign.clientProfileId !== input.clientProfileId
    ) {
      throw new AssistantContextError("Campaign client profile mismatch");
    }
  }

  const recentMessages = messages.slice(-messageLimit).map(mapMessage);

  const assembled: AllowedContextShape = {
    clientProfile: pickAllowedFields(
      profile
        ? {
            name: profile.name,
            industry: profile.description,
            tone: profile.toneNotes,
          }
        : null,
      CLIENT_PROFILE_ALLOWED_KEYS
    ) as AllowedContextShape["clientProfile"],
    campaign: pickAllowedFields(
      campaign
        ? {
            name: campaign.name,
            objective: campaign.objective,
            audience: campaign.audience,
            platforms: campaign.platforms,
            status: campaign.status,
          }
        : null,
      CAMPAIGN_ALLOWED_KEYS
    ) as AllowedContextShape["campaign"],
    thread: pickAllowedFields(
      {
        name: thread.name,
        campaignId: thread.campaignId,
      },
      THREAD_ALLOWED_KEYS
    ) as AllowedContextShape["thread"],
    recentMessages,
    brandKit: pickAllowedFields(
      brandKit
        ? {
            toneNotes: brandKit.toneNotes,
            visualNotes: brandKit.visualNotes,
            toneOfVoice: brandKit.toneNotes,
            constraints: brandKit.constraints,
          }
        : null,
      BRAND_KIT_ALLOWED_KEYS
    ) as AllowedContextShape["brandKit"],
    brandMemory: brandMemory.block
      ? { block: brandMemory.block }
      : null,
  };

  try {
    return sanitizeContextValue(
      assembled,
      input.clientProfileId
    ) as AllowedContextShape;
  } catch (error) {
    if (error instanceof ContextScopeError) {
      throw new AssistantContextError(error.message);
    }
    throw error;
  }
}

export function toModelMessages(
  context: AllowedContextShape,
  userMessage: string
): AssistantModelMessage[] {
  const history: AssistantModelMessage[] = context.recentMessages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  return [...history, { role: "user", content: userMessage }];
}

export function buildSystemPrompt(context: AllowedContextShape): string {
  return [
    "You are ADScale assistant. Use the following scoped context.",
    JSON.stringify(context),
  ].join("\n\n");
}

export function toAssistantModelRequest(
  context: AllowedContextShape,
  userMessage: string,
  tools?: AssistantModelRequest["tools"]
): AssistantModelRequest {
  return {
    systemPrompt: buildSystemPrompt(context),
    messages: toModelMessages(context, userMessage),
    tools,
  };
}
