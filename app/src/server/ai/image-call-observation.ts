import { randomUUID } from "node:crypto";
import { logger } from "@/lib/logger";
import type { ImageRenderPolicy } from "./image-render-policy";

type ImageResponseMetadata = {
  usage?: unknown;
  size?: unknown;
  quality?: unknown;
  _request_id?: string | null;
};

export type ImageCallObservation = {
  callId: string;
  key: string;
  operation: "generate" | "edit";
  requested: ImageRenderPolicy;
  requestedSize: string;
  returnedSize: string | null;
  returnedQuality: string | null;
  requestId: string | null;
  durationMs: number;
  usage: unknown | null;
};

export async function observeImageCall<T extends ImageResponseMetadata>(
  policy: ImageRenderPolicy,
  context: { key: string; operation: "generate" | "edit"; size: string },
  call: () => Promise<T>,
): Promise<{ response: T; observation: ImageCallObservation }> {
  const callId = randomUUID();
  const start = Date.now();
  const base = {
    callId,
    key: context.key,
    operation: context.operation,
    requested: policy,
    requestedSize: context.size,
  };
  try {
    logger.info({ event: "image_api_call", ...base, status: "started" });
  } catch {
    // Observability must never change provider or generation behavior.
  }
  try {
    const response = await call();
    const observation: ImageCallObservation = {
      ...base,
      requestId: response._request_id ?? null,
      returnedSize: typeof response.size === "string" ? response.size : null,
      returnedQuality: typeof response.quality === "string" ? response.quality : null,
      durationMs: Date.now() - start,
      usage: response.usage ?? null,
    };
    try {
      logger.info({ event: "image_api_call", ...observation, status: "response" });
    } catch {
      // Observability must never change provider or generation behavior.
    }
    return { response, observation };
  } catch (error) {
    try {
      logger.info({
        event: "image_api_call",
        ...base,
        status: "error",
        durationMs: Date.now() - start,
        usage: null,
        billing: "unknown",
      });
    } catch {
      // Observability must never change provider or generation behavior.
    }
    throw error;
  }
}
