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

export interface MissionItem {
  key: MissionKey;
  status: MissionStatus;
  href: string;
  completedAt?: string;
  evidenceId?: string;
  evidenceType?: string;
  blockedReason?: string;
}

export interface WorkspaceMissionsResponse {
  missions: MissionItem[];
  activeMissionKey: MissionKey | null;
  completedCount: number;
  totalCount: number;
  progressPercent: number;
  lastCalculatedAt: string;
}
