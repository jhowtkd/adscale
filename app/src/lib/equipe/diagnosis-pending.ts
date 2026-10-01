/**
 * The diagnosis is built in the background and its messages (the "building" line, the card, the error card)
 * are added to the conversation by the server, not by a turn of the person. The thread therefore has to be
 * polled while one is pending, even after the person left and came back: the state is read from the persisted
 * messages, never from what this tab remembers.
 */
export const DIAGNOSIS_POLL_MS = 3_000;
/** A pending marker older than this stops being polled (a stalled job must not keep a tab polling forever). */
export const DIAGNOSIS_POLL_WINDOW_MS = 15 * 60_000;

type ThreadMessage = { type: string; payload: Record<string, unknown>; createdAt: Date | string };

/**
 * Pending = the last marker is "handoff confirmed" (the diagnose intent is written with it), "building" or a
 * retry in flight, and no diagnosis card (ready, insufficient or failed) came after it.
 */
export function threadAwaitsDiagnosis(messages: ThreadMessage[] | undefined, now = Date.now()): boolean {
  let since: number | null = null;
  for (const message of messages ?? []) {
    const at = new Date(message.createdAt).getTime();
    if (message.type === "equipe_card" && message.payload.kind === "diagnosis") since = null;
    else if ((message.type === "assistant" && (message.payload.handoffStep === "done" || message.payload.diagnosis === "pending"))
      || (message.type === "equipe_event" && message.payload.kind === "diagnosis.started")) since = Number.isFinite(at) ? at : now;
  }
  return since !== null && now - since < DIAGNOSIS_POLL_WINDOW_MS;
}
