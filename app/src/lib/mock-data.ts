// ============================================
// ADScale - Mock Data
// ============================================

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
  isPreview?: boolean;
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
// Mock User
// ============================================

export const mockUser: User = {
  id: "usr_1",
  firstName: "Alex",
  lastName: "Chen",
  email: "alex@adscale.io",
  avatar: "",
  role: "Admin",
  credits: 120,
  creditsTotal: 1000,
  creditsUsedThisMonth: 412,
};

// ============================================
// Mock Workspace
// ============================================

export const mockWorkspace: Workspace = {
  id: "ws_1",
  name: "Alex's Workspace",
  plan: "Pro",
  memberCount: 3,
};

// ============================================
// Mock Campaigns
// ============================================

export const mockCampaigns: Campaign[] = [
  {
    id: "cmp_1",
    name: "Summer Sale Promo",
    platforms: ["Meta"],
    status: "active",
    variations: 24,
    creditsUsed: 58,
    lastModified: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
  },
  {
    id: "cmp_2",
    name: "Product Launch Q3",
    platforms: ["TikTok"],
    status: "generating",
    variations: 12,
    creditsUsed: 29,
    lastModified: new Date(Date.now() - 5 * 60 * 60 * 1000),
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  },
  {
    id: "cmp_3",
    name: "Holiday Collection",
    platforms: ["Meta"],
    status: "completed",
    variations: 48,
    creditsUsed: 115,
    lastModified: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    createdAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000),
  },
  {
    id: "cmp_4",
    name: "Flash Sale Banners",
    platforms: ["Google"],
    status: "active",
    variations: 16,
    creditsUsed: 38,
    lastModified: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
  },
  {
    id: "cmp_5",
    name: "Back to School",
    platforms: ["Meta", "TikTok"],
    status: "draft",
    variations: 0,
    creditsUsed: 0,
    lastModified: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
  },
  {
    id: "cmp_6",
    name: "Winter Clearance",
    platforms: ["Google", "Meta"],
    status: "failed",
    variations: 4,
    creditsUsed: 12,
    lastModified: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
    createdAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000),
  },
];

// ============================================
// Mock Derivations
// ============================================

export const mockDerivations: Derivation[] = [
  {
    id: "der_1",
    campaignId: "cmp_1",
    name: "Summer Sale - Carousel 1",
    status: "completed",
    platform: "Meta",
    prompt: "Bright summer colors with beach background, featuring 50% OFF text overlay",
    creditCost: 2.4,
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    completedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000),
  },
  {
    id: "der_2",
    campaignId: "cmp_1",
    name: "Summer Sale - Story Format",
    status: "completed",
    platform: "Meta",
    prompt: "Vertical story format with gradient overlay and animated text",
    creditCost: 2.4,
    createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
    completedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000 + 25 * 60 * 1000),
  },
  {
    id: "der_3",
    campaignId: "cmp_2",
    name: "Q3 Launch - Hook A",
    status: "generating",
    platform: "TikTok",
    prompt: "Trending audio visualizer with product showcase and bold text hooks",
    creditCost: 3.0,
    createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
  },
  {
    id: "der_4",
    campaignId: "cmp_2",
    name: "Q3 Launch - Hook B",
    status: "generating",
    platform: "TikTok",
    prompt: "Split-screen comparison before and after with energetic transitions",
    creditCost: 3.0,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
  },
  {
    id: "der_5",
    campaignId: "cmp_3",
    name: "Holiday - Gift Guide",
    status: "completed",
    platform: "Meta",
    prompt: "Cozy holiday setting with gift boxes and warm lighting, family oriented",
    creditCost: 2.4,
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    completedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000 + 45 * 60 * 1000),
  },
  {
    id: "der_6",
    campaignId: "cmp_4",
    name: "Flash Sale - Display",
    status: "completed",
    platform: "Google",
    prompt: "Clean display ad with countdown timer and urgency messaging",
    creditCost: 1.8,
    createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
    completedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000 + 20 * 60 * 1000),
  },
  {
    id: "der_7",
    campaignId: "cmp_6",
    name: "Winter - Static Banner",
    status: "failed",
    platform: "Google",
    prompt: "Snowy background with product placement and clearance messaging",
    creditCost: 1.8,
    createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
  },
];

// ============================================
// Mock Creative Plans
// ============================================

export const mockCreativePlans: CreativePlan[] = [
  {
    id: "plan_1",
    campaignId: "cmp_1",
    strategy:
      "Leverage summer excitement with vibrant, sun-drenched visuals. Focus on urgency-driven messaging tied to limited-time seasonal offers. Test carousel vs single-image formats to identify optimal engagement patterns.",
    angles: [
      { number: 1, title: "FOMO Urgency", description: "Countdown-driven messaging emphasizing limited availability" },
      { number: 2, title: "Lifestyle Aspirational", description: "Show the product in ideal summer scenarios — beach, BBQ, road trips" },
      { number: 3, title: "Social Proof", description: "Customer testimonials and crowd imagery to build trust" },
    ],
    hooks: [
      "🔥 50% OFF ends tonight!",
      "Your summer just got better...",
      "Don't miss out — selling fast!",
      "The sale everyone's talking about",
    ],
    ctas: ["Shop Now", "Get 50% Off", "Claim Deal", "Shop Summer"],
    status: "completed",
    createdAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000),
  },
  {
    id: "plan_2",
    campaignId: "cmp_2",
    strategy:
      "Create buzz around the Q3 product launch with TikTok-native content. Emphasize authenticity, quick cuts, and trend-jacking. Use creator-style presentation to blend into the For You Page feed seamlessly.",
    angles: [
      { number: 1, title: "Unboxing Surprise", description: "First-reaction unboxing with genuine excitement" },
      { number: 2, title: "Problem/Solution", description: "Show the pain point, then reveal the product as the hero" },
      { number: 3, title: "Behind the Scenes", description: "Factory/office footage showing craftsmanship and quality" },
    ],
    hooks: [
      "POV: You just found the product of 2025",
      "This changes everything...",
      "Wait for the reveal 👀",
      "I wasn't expecting THIS",
    ],
    ctas: ["Learn More", "Pre-Order Now", "Link in Bio", "Get Early Access"],
    status: "generating",
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
  },
];

// ============================================
// Mock Activity Feed
// ============================================

export const mockActivityFeed: ActivityItem[] = [
  {
    id: "act_1",
    type: "plan",
    message: "Creative plan generated for Summer Sale",
    timestamp: new Date(Date.now() - 5 * 60 * 1000),
  },
  {
    id: "act_2",
    type: "derivation",
    message: "Variation #8 completed for Product Launch Q3",
    timestamp: new Date(Date.now() - 12 * 60 * 1000),
  },
  {
    id: "act_3",
    type: "campaign",
    message: "Campaign 'Holiday Collection' created",
    timestamp: new Date(Date.now() - 60 * 60 * 1000),
  },
  {
    id: "act_4",
    type: "export",
    message: "12 derivations exported as PNG",
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
  },
  {
    id: "act_5",
    type: "alert",
    message: "Credit balance below 15%",
    timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000),
  },
  {
    id: "act_6",
    type: "derivation",
    message: "Variation #3 failed — retrying Winter Clearance",
    timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000),
  },
  {
    id: "act_7",
    type: "campaign",
    message: "Flash Sale Banners marked as active",
    timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000),
  },
];

// ============================================
// Credit Usage Data (last 7 days)
// ============================================

export interface CreditUsageDay {
  day: string;
  shortDay: string;
  credits: number;
  date: Date;
}

export const mockCreditUsage: CreditUsageDay[] = [
  { day: "Monday", shortDay: "Mon", credits: 45, date: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000) },
  { day: "Tuesday", shortDay: "Tue", credits: 82, date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) },
  { day: "Wednesday", shortDay: "Wed", credits: 63, date: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) },
  { day: "Thursday", shortDay: "Thu", credits: 91, date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
  { day: "Friday", shortDay: "Fri", credits: 54, date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
  { day: "Saturday", shortDay: "Sat", credits: 38, date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) },
  { day: "Sunday", shortDay: "Sun", credits: 39, date: new Date(Date.now() - 0 * 24 * 60 * 60 * 1000) },
];

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

export const mockDashboardStats: DashboardStats = {
  totalCampaigns: 12,
  derivationsThisMonth: 156,
  creditsUsed: 847,
  creditsTotal: 1000,
  activePlatforms: 3,
  campaignsChange: 23,
  derivationsChange: 41,
  creditsRemaining: 12,
};

// ============================================
// Platform data
// ============================================

export const platformColors: Record<AdPlatform, { bg: string; text: string }> = {
  Meta: { bg: "var(--accent-green-dim)", text: "var(--accent-green)" },
  TikTok: { bg: "rgba(225,29,72,0.12)", text: "var(--accent-rose)" },
  Google: { bg: "var(--accent-green-dim)", text: "var(--accent-green)" },
};

// ============================================
// Helper functions
// ============================================

export function getCampaignById(id: string): Campaign | undefined {
  return mockCampaigns.find((c) => c.id === id);
}

export function getDerivationsByCampaign(campaignId: string): Derivation[] {
  return mockDerivations.filter((d) => d.campaignId === campaignId);
}

export function getPlanByCampaign(campaignId: string): CreativePlan | undefined {
  return mockCreativePlans.find((p) => p.campaignId === campaignId);
}
