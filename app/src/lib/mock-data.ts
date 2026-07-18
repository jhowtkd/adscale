// ============================================
// ADScale - Domain UI types + platform colors
// (legacy mock fixtures removed — unused)
// ============================================

import type {
  ExportStatusPayload,
  OlharVerdictPayload,
} from "@/server/ai/olhar/dual-verdict";

export type CampaignStatus =
  | "draft"
  | "active"
  | "queued"
  | "processing"
  | "generating"
  | "completed"
  | "failed"
  | "approved"
  | "rejected";

export type AdPlatform = "Meta" | "TikTok" | "Google";

export interface Campaign {
  id: string;
  name: string;
  client?: string;
  objective?: string;
  audience?: string;
  platforms?: AdPlatform[];
  tone?: string;
  offer?: string;
  constraints?: string;
  notes?: string;
  generationMode?: "art_variation" | "format_adaptation" | "restyling";
  creativeLevel?: "conservative" | "balanced" | "bold" | "extreme";
  styleIntensity?: "soft" | "medium" | "strong";
  ctaVariants?: string[];
  targetFormats?: string[];
  creativeDiagnosisStatus?: "pending" | "analyzing" | "ready" | "failed";
  creativeDiagnosis?: {
    detectedConcept: string;
    elementsToPreserve: string[];
    variationOpportunities: string[];
  } | null;
  creativeDiagnosisSource?: "ai" | "edited" | "regenerated" | null;
  clientProfileId?: string;
  selectedReferenceIds?: string[];
  status: CampaignStatus;
  variations: number;
  creditsUsed: number;
  previewPendingBatch?: boolean;
  lastModified: Date;
  createdAt: Date;
}

export type ScoreStatus = "pending" | "heuristic" | "analyzed" | "failed";

export interface CreativeScoreBreakdown {
  ctaClarity: number;
  textLegibility: number;
  briefMatch: number;
  visualQuality: number;
  formatFit: number;
  variationLevelFit?: number;
  informationPreservation?: number;
}

// ============================================
// Annotations
// ============================================

export type AnnotationType = "freehand" | "text" | "circle" | "rectangle" | "arrow";

export interface Annotation {
  id: string;
  type: AnnotationType;
  x: number; // normalized 0-1
  y: number; // normalized 0-1
  color: string;
  strokeWidth: number;
  // freehand
  path?: string; // SVG path data
  // text
  text?: string;
  fontSize?: number;
  // shapes
  width?: number; // normalized 0-1
  height?: number; // normalized 0-1
  // arrow
  endX?: number; // normalized 0-1
  endY?: number; // normalized 0-1
}

export interface Derivation {
  id: string;
  campaignId: string;
  name: string;
  status: CampaignStatus;
  platform: AdPlatform;
  prompt: string;
  creditCost: number;
  imageUrl?: string;
  outputKey?: string | null;
  generationMode?: "art_variation" | "format_adaptation" | "restyling";
  variantIndex?: number;
  ctaText?: string;
  format?: string;
  qualityScore?: number | null;
  scoreStatus?: ScoreStatus | null;
  scoreBreakdown?: CreativeScoreBreakdown | null;
  scoreIssues?: string[] | null;
  regenerationSuggestion?: string | null;
  scoredAt?: Date | null;
  qaStatus?: "pending" | "ready" | "warning" | "review" | "failed" | null;
  qaChecklist?: Record<string, { status: string; note: string }> | null;
  qaIssues?: string[] | null;
  qaSuggestions?: string[] | null;
  qaAnalyzedAt?: Date | null;
  qualityVerdict?: "invalid" | "improvable" | "acceptable" | null;
  hardFailures?: Array<{ code: string; message: string; criterion?: string }> | null;
  polishSuggestions?: string[] | null;
  qualityGatedAt?: Date | null;
  olharVerdict?: OlharVerdictPayload | null;
  exportStatus?: ExportStatusPayload | null;
  styleAssetId?: string | null;
  isPreview?: boolean;
  autoRetryAttempted?: boolean;
  autoRetryReason?: string | null;
  annotations?: Annotation[];
  createdAt: Date;
  completedAt?: Date;
}

export interface CreativePlan {
  id: string;
  campaignId: string;
  strategy: string;
  angles: Array<{
    number: number;
    title: string;
    description: string;
  }>;
  hooks: string[];
  ctas: string[];
  status: CampaignStatus;
  createdAt: Date;
}

export interface ActivityItem {
  id: string;
  type: "plan" | "derivation" | "campaign" | "export" | "alert";
  message: string;
  timestamp: Date;
}

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar: string;
  role: string;
  credits: number;
  creditsTotal: number;
  creditsUsedThisMonth: number;
}

export interface Workspace {
  id: string;
  name: string;
  plan: string;
  memberCount: number;
}

// ============================================
// Credit Usage Data (last 7 days)
// ============================================

export interface CreditUsageDay {
  day: string;
  shortDay: string;
  credits: number;
  date: Date;
}

// ============================================
// Stats Summary
// ============================================

export interface DashboardStats {
  totalCampaigns: number;
  derivationsThisMonth: number;
  creditsUsed: number;
  creditsTotal: number;
  activePlatforms: number;
  campaignsChange: number;
  derivationsChange: number;
  creditsRemaining: number;
}

// ============================================
// Platform data
// ============================================

export const platformColors: Record<AdPlatform, { bg: string; text: string }> = {
  Meta: { bg: "var(--neutral-bg)", text: "var(--neutral-text)" },
  TikTok: { bg: "var(--neutral-bg)", text: "var(--neutral-text)" },
  Google: { bg: "var(--neutral-bg)", text: "var(--neutral-text)" },
};
