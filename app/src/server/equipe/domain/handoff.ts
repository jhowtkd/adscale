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
export type HandoffReading = Partial<Record<HandoffGroup, {
  runId: string; taskIntentId: string; status: "pending" | "running" | "found" | "not_found" | "failed";
  error?: string;
}>>;
export type HandoffCaptured = Partial<Record<HandoffGroup, HandoffItem[]>> & { publicContent?: HandoffItem[] };
export type HandoffDecisions = {
  revising?: boolean;
  needsConfirmation?: Array<"identity" | "images">;
  identity?: { name: HandoffItem; logo: HandoffItem | null; colors: HandoffItem[]; fonts: HandoffItem[]; paletteChoice: HandoffOrigin };
  networks?: HandoffItem[];
  images?: { kept: string[]; removed: string[]; uploaded: HandoffItem[] };
};
export type HandoffState = {
  step: HandoffStep; version: number; source: HandoffSource | null; readingId: string | null;
  readsUsed: number; reading: HandoffReading; captured: HandoffCaptured; decisions: HandoffDecisions;
};
export const isGroupFinished = (status: string | undefined) => status === "found" || status === "not_found" || status === "failed";
export const identityReady = (s: HandoffState) => ["name", "logo", "colors", "fonts"].every(g => isGroupFinished(s.reading[g as HandoffGroup]?.status)) && s.reading.name?.status !== "failed";
export const allGroupsFinished = (s: HandoffState) => HANDOFF_GROUPS.every(g => isGroupFinished(s.reading[g]?.status));

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
      if (s.step !== "summary" || !allGroupsFinished(s) || !s.source || s.reading.name?.status === "failed" || !s.decisions.identity || !s.decisions.networks || !s.decisions.images || s.decisions.needsConfirmation?.length) return err("invalid_transition", "Finish reading and confirming your brand first.");
      step = "done"; break;
    case "back":
      if (s.step !== "summary" || !target || !["source", "identity", "networks", "images"].includes(target)) return err("invalid_transition", "Return from the summary to a brand step.");
      step = target; break;
  }
  return ok({ ...s, step, version: s.version + (action !== "progress" || step !== s.step ? 1 : 0) });
}
