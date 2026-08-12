import "server-only";

import { z } from "zod";
import { inngest } from "@/server/jobs/client";
import { heavyImageEventName } from "@/server/jobs/heavy-image-events";
import {
  acceptCreativeWorkLayerizationCallback,
  failCreativeWorkLayerization,
} from "@/server/repositories/creative-work-layerization";

export const creativeWorkLayerizationCallbackSchema = z.object({
  status: z.enum(["COMPLETED", "FAILED"]),
  request_id: z.string().min(1).max(256),
}).passthrough();

export type CreativeWorkLayerizationCallbackResult =
  | { ok: true; replay: boolean }
  | { ok: false; code: "invalid_callback" | "unknown_attempt" };

export async function handleCreativeWorkLayerizationCallback(input: {
  workItemId: string;
  outputId: string;
  attemptId: string;
  token: string;
  payload: unknown;
}): Promise<CreativeWorkLayerizationCallbackResult> {
  const parsed = creativeWorkLayerizationCallbackSchema.safeParse(input.payload);
  if (!parsed.success) return { ok: false, code: "invalid_callback" };
  const accepted = await acceptCreativeWorkLayerizationCallback({
    workItemId: input.workItemId,
    outputId: input.outputId,
    attemptId: input.attemptId,
    token: input.token,
    requestId: parsed.data.request_id,
  });
  if (!accepted.row) return { ok: false, code: "unknown_attempt" };
  if (!accepted.accepted && !accepted.replay) return { ok: false, code: "invalid_callback" };
  if (accepted.replay) return { ok: true, replay: true };
  if (parsed.data.status === "FAILED" && accepted.accepted) {
    await failCreativeWorkLayerization({
      workspaceId: accepted.row.workspaceId,
      workItemId: input.workItemId,
      outputId: input.outputId,
      code: "provider_error",
    });
    return { ok: true, replay: false };
  }
  await inngest.send({
    id: `creative-work-layerize:${input.outputId}:${input.attemptId}:callback`,
    name: heavyImageEventName("creative-work.layerize"),
    data: {
      workspaceId: accepted.row.workspaceId,
      workItemId: input.workItemId,
      outputId: input.outputId,
      attemptId: input.attemptId,
    },
  });
  return { ok: true, replay: accepted.replay };
}
