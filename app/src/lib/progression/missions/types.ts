export type MissionKey =
  | "setup"
  | "upload"
  | "readiness"
  | "guided_briefing"
  | "strategy_recipe"
  | "preview"
  | "batch"
  | "review"
  | "regeneration"
  | "export"
  | "share";

export type MissionStatus = "completed" | "active" | "blocked" | "upcoming";

export interface MissionCreditInfo {
  creditCost: number;
  adCost: number;
  costLabel: "single" | "from";
  insufficientCredits: boolean;
}

export interface MissionItem {
  key: MissionKey;
  status: MissionStatus;
  href: string;
  completedAt?: string;
  evidenceId?: string;
  evidenceType?: string;
  blockedReason?: string;
  credit?: MissionCreditInfo;
}

export interface MissionCreditContext {
  remainingCredits: number;
  remainingAds: number | null;
  accessKind: "paid" | "trial" | "beta" | "tester" | "none";
  showUpgradePrompt: boolean;
}

export interface WorkspaceMissionsResponse {
  missions: MissionItem[];
  activeMissionKey: MissionKey | null;
  completedCount: number;
  totalCount: number;
  progressPercent: number;
  lastCalculatedAt: string;
  creditContext?: MissionCreditContext;
}
