import { inngest } from "./client";
import { logger } from "@/lib/logger";
import {
  runSelectionEffectsSweep,
  SELECTION_EFFECTS_SWEEP_CRON,
  SELECTION_EFFECTS_WAKEUP_EVENT,
} from "@/server/application/process-selection-effects";

/**
 * Selection-effect recovery (ICE-03B): the selection outbox wakes this
 * function after commit, and the periodic paged sweep recovers lost
 * wake-ups. The outbox is the authority — the event carries no scope and
 * the sweep claims globally, oldest first.
 *
 * The processor never generates images, charges, re-approves or selects
 * another output: it replays strict idempotent sinks with durable
 * owner-compared confirmation.
 */
export const selectionEffectsProcessorJob = inngest.createFunction(
  {
    id: "selection-effects-processor",
    triggers: [{ event: SELECTION_EFFECTS_WAKEUP_EVENT }, { cron: SELECTION_EFFECTS_SWEEP_CRON }],
    retries: 0,
    onFailure: async ({ error }) => {
      // Leases expire and the next sweep reclaims: log, never loop here.
      logger.error("[selectionEffectsProcessor] sweep failed", { error });
    },
  },
  async ({ event }) => {
    const owner = `selection-effects:${event.id}`;
    const result = await runSelectionEffectsSweep({ owner });
    logger.info("[selectionEffectsProcessor] sweep finished", {
      trigger: event.name,
      ...result,
    });
    return result;
  },
);
