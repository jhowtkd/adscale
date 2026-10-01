import { err, ok, type Result } from "./result";

export const HANDOFF_STEPS = ["source", "reading", "identity", "networks", "images", "summary", "done"] as const;
export const HANDOFF_GROUPS = ["name", "logo", "colors", "fonts", "networks", "images"] as const;
export type HandoffStep = typeof HANDOFF_STEPS[number];
export type HandoffGroup = typeof HANDOFF_GROUPS[number];
export type HandoffOrigin = "site" | "instagram" | "user";
export type HandoffSource = { kind: "site" | "instagram"; value: string; normalized: string };
export type HandoffItem = {
  id: string; value: string; origin: HandoffOrigin; key?: string;
  caption?: string; width?: number; height?: number; platform?: string;
};
export type HandoffRun = {
  runId: string; taskIntentId: string; status: "pending" | "running" | "found" | "not_found" | "failed";
  error?: string;
};
export type HandoffReading = Partial<Record<HandoffGroup, HandoffRun & { bySource?: Partial<Record<"site" | "instagram", HandoffRun>> }>>;
export function readingRun(group: HandoffReading[HandoffGroup], origin: "site" | "instagram") {
  return group?.bySource ? group.bySource[origin] : group;
}
/** A group remains unfinished until all its current sources have returned. */
export function withReadingRun(group: HandoffReading[HandoffGroup], origin: "site" | "instagram", run: HandoffRun) {
  const bySource = { ...group?.bySource, [origin]: run };
  const runs = Object.values(bySource);
  const status = runs.some(r => r.status === "running") ? "running" : runs.some(r => r.status === "pending") ? "pending"
    : runs.some(r => r.status === "found") ? "found" : runs.some(r => r.status === "failed") ? "failed" : "not_found";
  return { ...run, status, bySource } satisfies NonNullable<HandoffReading[HandoffGroup]>;
}
export type HandoffCaptured = Partial<Record<HandoffGroup, HandoffItem[]>> & { publicContent?: HandoffItem[] };
export type HandoffDecisions = {
  revising?: boolean;
  needsConfirmation?: Array<"identity" | "images">;
  identity?: { name: HandoffItem; logo: HandoffItem | null; colors: HandoffItem[]; fonts: HandoffItem[]; paletteChoice: HandoffOrigin };
  /** Managed logo the person uploaded on the identity step. It is a draft, not a decision: it leaves the version alone and
   *  lives only until identity is confirmed, so reloading the card resumes with the same upload. */
  uploadedLogo?: HandoffItem;
  /** Managed images the person uploaded on the images step and has not decided yet. Same kind of draft as `uploadedLogo`:
   *  it keeps the version and the conversation untouched, and confirming the images consumes it. */
  uploadedImages?: HandoffItem[];
  networks?: HandoffItem[];
  images?: { kept: string[]; removed: string[]; uploaded: HandoffItem[] };
};
export type HandoffState = {
  step: HandoffStep; version: number; source: HandoffSource | null; readingId: string | null;
  readsUsed: number; reading: HandoffReading; captured: HandoffCaptured; decisions: HandoffDecisions;
};
/** Networks one handoff_confirm_networks may keep. */
export const HANDOFF_MAX_NETWORKS = 10;
/** The networks to start from: what was captured, in discovery order, within the limit and with at most one Instagram profile,
 *  so confirming the card untouched is never refused by the command. */
export function defaultNetworkSelection(captured: readonly HandoffItem[]): string[] {
  const picked: string[] = []; let instagram = false;
  for (const item of captured) {
    if (picked.length >= HANDOFF_MAX_NETWORKS) break;
    if (item.platform === "instagram") { if (instagram) continue; instagram = true; }
    picked.push(item.id);
  }
  return picked;
}
export const isGroupFinished = (status: string | undefined) => status === "found" || status === "not_found" || status === "failed";
export const identityReady = (s: HandoffState) => ["name", "logo", "colors", "fonts"].every(g => isGroupFinished(s.reading[g as HandoffGroup]?.status)) && s.reading.name?.status !== "failed";
export const allGroupsFinished = (s: HandoffState) => HANDOFF_GROUPS.every(g => isGroupFinished(s.reading[g]?.status));
export const hasFailedConfirmedInstagram = (s: HandoffState) => Boolean(s.decisions.networks?.some(i => i.platform === "instagram") &&
  Object.values(s.reading).some(g => (g?.bySource?.instagram ?? (s.source?.kind === "instagram" ? g : undefined))?.status === "failed"));

/** Only this machine changes step. Progress bumps version only on a step transition. */
export function transitionHandoff(s: HandoffState, action: "source" | "progress" | "identity" | "networks" | "images" | "summary" | "back", target?: HandoffStep): Result<HandoffState> {
  let step = s.step;
  switch (action) {
    case "source":
      if (s.step === "done") return err("invalid_transition", "Handoff already completed.");
      step = "reading"; break;
    case "progress":
      if (s.step === "reading" && identityReady(s)) step = "identity";
      break;
    case "identity":
      if (s.step !== "identity" || !identityReady(s)) return err("invalid_transition", "Identity is still being read.");
      step = s.decisions.revising && s.decisions.networks ? (s.decisions.needsConfirmation?.includes("images") || !s.decisions.images ? "images" : "summary") : "networks"; break;
    case "networks":
      if (s.step !== "networks" || !isGroupFinished(s.reading.networks?.status)) return err("invalid_transition", "Networks are still being read.");
      step = s.decisions.needsConfirmation?.includes("identity") ? "identity" : s.decisions.revising && s.decisions.images && !s.decisions.needsConfirmation?.includes("images") ? "summary" : "images"; break;
    case "images":
      if (s.step !== "images" || !isGroupFinished(s.reading.images?.status)) return err("invalid_transition", "Images are still being read.");
      step = "summary"; break;
    case "summary":
      if (s.step !== "summary" || !allGroupsFinished(s) || !s.source || s.reading.name?.status === "failed" || hasFailedConfirmedInstagram(s) || !s.decisions.identity || (s.decisions.identity.logo && !s.decisions.identity.logo.key) || !s.decisions.networks || !s.decisions.images || s.decisions.needsConfirmation?.length || s.captured.images?.some(i => !s.decisions.images?.kept.includes(i.id) && !s.decisions.images?.removed.includes(i.id))) return err("invalid_transition", "Finish reading and confirming your brand first.");
      step = "done"; break;
    case "back":
      if (s.step !== "summary" || !target || !["source", "identity", "networks", "images"].includes(target)) return err("invalid_transition", "Return from the summary to a brand step.");
      // The source step only leaves through a new reading; with none left, going back to it would strand the person there.
      if (target === "source" && s.readsUsed >= 3) return err("reading_limit", "You have used all 3 readings, so the source can no longer change. Your account and captured brand remain available, and you can still edit the other steps.");
      step = target; break;
  }
  return ok({ ...s, step, version: s.version + (action !== "progress" || step !== s.step ? 1 : 0) });
}
