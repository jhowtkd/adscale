import OpenAI from "openai";
import { env } from "@/server/validation/env";

let _minimax: OpenAI | undefined;

export function getMiniMaxClient(): OpenAI {
  if (!_minimax) {
    _minimax = new OpenAI({
      apiKey: env.MINIMAX_API_KEY,
      baseURL: "https://api.minimax.io/v1",
      timeout: 120_000,
    });
  }
  return _minimax;
}

export function resetMiniMaxClientForTests(): void {
  _minimax = undefined;
}
