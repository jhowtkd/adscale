// Query configuration presets for TanStack Query
// Used to standardize staleTime across the app

export const STALE_TIME = {
  // Static data that rarely changes
  STATIC: 5 * 60 * 1000, // 5 minutes

  // Semi-static data that changes occasionally
  SEMI_STATIC: 60 * 1000, // 1 minute

  // Dynamic data that changes frequently
  DYNAMIC: 30 * 1000, // 30 seconds

  // Real-time data that changes very frequently
  REALTIME: 10 * 1000, // 10 seconds

  // Analysis results that shouldn't refetch for a long time
  ANALYSIS: 24 * 60 * 60 * 1000, // 24 hours
} as const;

// Query key categories for standardization
const QUERY_KEYS = {
  dashboard: ["dashboard", "stats"],
  campaigns: {
    list: ["campaigns", "list"],
    detail: (id: string) => ["campaigns", id],
  },
  derivations: (campaignId: string) => ["derivations", campaignId],
  plan: (campaignId: string) => ["plan", campaignId],
  brandKit: ["brand-kit"],
  clientProfiles: ["client-profiles"],
  workspaceTeam: ["workspace", "team"],
  workspaceAssets: ["workspace", "assets"],
  notifications: ["notifications"],
  billing: ["billing"],
  templates: ["templates"],
  preflight: (assetId: string) => ["preflight", assetId],
  onboarding: ["onboarding"],
} as const;
