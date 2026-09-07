import { protocolIdentityContract } from "@/server/creative-work/identity-policy";
import type { ContentBrief, StyleBrief } from "@/server/ai/image-analysis";
import type { CreativeSourceUsage } from "@/lib/hooks/use-creative-work";
import { MAX_PIECE_REFERENCES, type PieceReferenceCategory } from "@/server/creative-work/piece-reference";
import type { ComposerIntent } from "./composer-state";

export type DraftSource = ({ assetId: string } | { templateId: string }) & { usage?: CreativeSourceUsage };

export type ComposerSourceAction =
  | { workItemId: string; action: "attachSource"; assetId: string; templateId?: never; usage: CreativeSourceUsage }
  | { workItemId: string; action: "attachSource"; templateId: string; assetId?: never; usage: CreativeSourceUsage }
  | { workItemId: string; action: "updateSource"; sourceId: string; usage: CreativeSourceUsage }
  | { workItemId: string; action: "updatePieceReference"; sourceId: string; category?: PieceReferenceCategory; userInstruction?: string | null }
  | { workItemId: string; action: "replacePieceReference"; sourceId: string; assetId: string }
  | { workItemId: string; action: "promotePieceReference"; sourceId: string }
  | { workItemId: string; action: "retrySource" | "removeSource"; sourceId: string }
  | { workItemId: string; action: "editSourceAnalysis"; sourceId: string; content: ContentBrief | null; style: StyleBrief | null };

/** Restyle keeps the original as content; extra files become style. Carousel is style-only. */
export function usageForAttachedFile(input: {
  intent: ComposerIntent;
  preferredUsage?: CreativeSourceUsage;
  hasRestyleContent: boolean;
}): CreativeSourceUsage {
  if (input.intent === "carousel") return "style";
  if (input.preferredUsage) return input.preferredUsage;
  if (input.intent === "restyle") {
    const original = protocolIdentityContract("restyle").restyleOriginalUsage ?? "content";
    return input.hasRestyleContent ? "style" : original;
  }
  return "both";
}

export function usageForDraftSource(
  intent: ComposerIntent,
  usage?: CreativeSourceUsage,
): CreativeSourceUsage {
  if (usage) return usage;
  if (intent === "carousel") return "style";
  if (intent === "restyle") return protocolIdentityContract("restyle").restyleOriginalUsage ?? "content";
  return "both";
}

export function limitAttachedImages(input: {
  intent: ComposerIntent;
  images: File[];
  existingSourceCount: number;
  existingNonFailedCount: number;
}): { accepted: File[]; rejectedByLimit: number } {
  const accepted = input.intent === "single"
    ? input.images.slice(0, Math.max(0, MAX_PIECE_REFERENCES - input.existingSourceCount))
    : input.intent === "carousel"
      ? input.images.slice(0, Math.max(0, 1 - input.existingNonFailedCount))
      : input.images;
  return { accepted, rejectedByLimit: input.images.length - accepted.length };
}
