import type { GuidedFlowPath, GuidedFlowStatus } from "@/lib/guided-flow/types";

export type { GuidedFlowPath, GuidedFlowStatus };

export interface GuidedFlow {
  id: string;
  workspaceId: string;
  clientProfileId: string;
  threadId: string;
  path: GuidedFlowPath;
  status: GuidedFlowStatus;
  currentStep: string;
  slots: Record<string, unknown>;
  missingFields: string[];
  assetIds: string[];
  referenceIds: string[];
  campaignId: string | null;
  recoverableError?: Record<string, unknown> | null;
  revision?: number;
  schemaVersion?: number;
  createdAt: string;
  updatedAt: string;
}
