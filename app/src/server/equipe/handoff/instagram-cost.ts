import { handoffInstagramCostEventSchema } from "./contract";
import type { HandoffReaders } from "./readers";

type Step = { run<T>(id: string, fn: () => Promise<T>): Promise<T> };

/**
 * Reads, and records, what the provider charged for the Instagram run a reading dispatched (ticket 13, D-4). It is a function of its own, started by the reading
 * once every group is recorded: the cost stabilises about ten seconds after a run ends, and the steps of one function run one at a time, so as a step of the reading
 * it held the screen for those seconds (10.5 s of a 60 s reading, measured). The run to measure is the one the reading's own events recorded; recording the usage is
 * idempotent per reading, so a redelivery or a retry measures again and writes nothing new. Best effort, like the reader's own: a cost that cannot be read is recorded
 * as unknown, never as free, and never turns a recorded reading into a failure.
 */
export function createInstagramCostHandler(readers: Pick<HandoffReaders, "instagram">) {
  return async ({ event, step }: { event: { data: unknown }; step: Step }) => {
    const context = handoffInstagramCostEventSchema.parse(event.data);
    const measure = readers.instagram.measureCost?.bind(readers.instagram);
    if (!measure) return { measured: false };
    try {
      await step.run(`instagram-cost-${context.taskIntentId}`, async () => { await measure(context); return null; });
    } catch { return { measured: false }; }
    return { measured: true };
  };
}
