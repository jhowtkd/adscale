import type { LearnedGuidanceRef } from "./learned-guidance";

export type NumericGuidanceRef = LearnedGuidanceRef & { readonly revision: number };
export type GuidanceSelectionState = {
  version: number;
  refs: NumericGuidanceRef[];
  pinnedBy: string | null;
  pinnedAt: string | null;
};
export type GuidanceSelection = GuidanceSelectionState & { previousSelection: GuidanceSelectionState | null };
