export type FeedbackType = "bug" | "suggestion" | "question" | "other";
export type FeedbackSeverity = "low" | "medium" | "high" | "critical";
export type FeedbackCategory =
  | "ui"
  | "generation"
  | "billing"
  | "performance"
  | "other";
export type FeedbackContextKind = "global" | "campaign" | "derivation";

export type FeedbackAssetRef = {
  kind: "campaign_asset" | "workspace_asset" | "derivation_output";
  id: string;
  key?: string;
};

export type FeedbackContextPayload = {
  contextKind?: FeedbackContextKind;
  campaignId?: string;
  derivationId?: string;
  assetRefs?: FeedbackAssetRef[];
  route?: string;
};

export type SubmitFeedbackInput = {
  type: FeedbackType;
  severity: FeedbackSeverity;
  category: FeedbackCategory;
  message: string;
  followUpAllowed: boolean;
} & FeedbackContextPayload;
