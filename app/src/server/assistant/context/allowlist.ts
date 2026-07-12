export const CONTEXT_CATEGORIES = [
  "clientProfile",
  "campaign",
  "thread",
  "recentMessages",
  "brandKit",
  "brandMemory",
  "goal",
] as const;

export type ContextCategory = (typeof CONTEXT_CATEGORIES)[number];

export interface ClientProfileContext {
  name: string;
  industry?: string | null;
  tone?: string | null;
}

export interface CampaignContext {
  name: string;
  objective?: string | null;
  audience?: string | null;
  platforms?: string[] | null;
  status?: string | null;
}

export interface ThreadContext {
  name: string;
  campaignId?: string | null;
}

export interface MessageContext {
  role: string;
  content: string;
  toolName?: string;
  summary?: string;
  attachments?: Array<{
    assetId: string;
    key: string;
    url?: string;
    type: string;
    name: string;
    size: number;
  }>;
}

export interface BrandKitContext {
  toneNotes?: string | null;
  visualNotes?: string | null;
  toneOfVoice?: string | null;
  constraints?: string | null;
  colors?: string[] | null;
  fonts?: string[] | null;
  logoAssetKey?: string | null;
  prohibitedElements?: string | null;
  requiredElements?: string | null;
}

export interface BrandMemoryContextShape {
  block: string;
}

/**
 * Allowlisted goal-run projection for the model context. Only durable, safe
 * identifiers and the editable plan/brief state reach the model — never prompts,
 * output keys, signed URLs, or provider payloads.
 */
export interface GoalContext {
  id: string;
  revision: number;
  stage: string;
  objective: string;
  planVersionId: string | null;
  brief: {
    productOffer: string;
    audience: string;
    constraints: string;
    objective: string;
    cta: string;
    referenceIds: string[];
    baseAssetId: string | null;
  };
  plan: {
    strategy: string;
    angles: string[];
    hooks: string[];
    ctas: string[];
  };
  assumptions: string[];
  blockers: string[];
}

export interface AllowedContextShape {
  clientProfile?: ClientProfileContext | null;
  campaign?: CampaignContext | null;
  thread: ThreadContext;
  recentMessages: MessageContext[];
  brandKit?: BrandKitContext | null;
  brandMemory?: BrandMemoryContextShape | null;
  goal?: GoalContext | null;
}

export const CLIENT_PROFILE_ALLOWED_KEYS = ["name", "industry", "tone"] as const;
export const CAMPAIGN_ALLOWED_KEYS = [
  "name",
  "objective",
  "audience",
  "platforms",
  "status",
] as const;
export const THREAD_ALLOWED_KEYS = ["name", "campaignId"] as const;
export const BRAND_KIT_ALLOWED_KEYS = [
  "toneNotes",
  "visualNotes",
  "toneOfVoice",
  "constraints",
  "colors",
  "fonts",
  "logoAssetKey",
  "prohibitedElements",
  "requiredElements",
] as const;
export const GOAL_ALLOWED_KEYS = [
  "id",
  "revision",
  "stage",
  "objective",
  "planVersionId",
  "brief",
  "plan",
  "assumptions",
  "blockers",
] as const;

export function pickAllowedFields<T extends Record<string, unknown>>(
  obj: T | null | undefined,
  allowedKeys: readonly string[]
): Partial<T> | null {
  if (!obj) return null;

  const result: Partial<T> = {};
  for (const key of allowedKeys) {
    if (key in obj && obj[key] !== undefined) {
      (result as Record<string, unknown>)[key] = obj[key];
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}
