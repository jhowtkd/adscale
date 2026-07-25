import OpenAI from "openai";
import { env } from "@/server/validation/env";

let openaiAssistantClient: OpenAI | undefined;

export function getOpenAIAssistantClient(): OpenAI {
  if (!openaiAssistantClient) {
    openaiAssistantClient = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      timeout: 120_000,
    });
  }
  return openaiAssistantClient;
}

export function resetOpenAIAssistantClientForTests(): void {
  openaiAssistantClient = undefined;
}
