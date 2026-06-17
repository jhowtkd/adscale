import {
  text,
  timestamp,
  boolean,
  uuid,
  integer,
  numeric,
  date,
  jsonb,
  index,
  uniqueIndex,
  check,
  varchar,
  foreignKey,
  pgSchema,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const adscaleSchema = pgSchema("adscale_app");

// ============================================
// Better Auth tables
// ============================================

export const user = adscaleSchema.table("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  locale: text("locale").notNull().default("pt-BR"),
  emailNotificationsEnabled: boolean("email_notifications_enabled").notNull().default(true),
  lowCreditsNotifiedAt: timestamp("low_credits_notified_at", { mode: "date" }),
  trialExpiringNotifiedAt: timestamp("trial_expiring_notified_at", { mode: "date" }),
  onboardingCompletedAt: timestamp("onboarding_completed_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const session = adscaleSchema.table(
  "session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("session_user_id_idx").on(table.userId)]
);

export const account = adscaleSchema.table(
  "account",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      mode: "date",
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      mode: "date",
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("account_user_id_idx").on(table.userId)]
);

export const verification = adscaleSchema.table("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

// ============================================
// App tables
// ============================================

export const workspaces = adscaleSchema.table("workspaces", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const workspaceMembers = adscaleSchema.table(
  "workspace_members",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("workspace_members_workspace_id_idx").on(table.workspaceId),
    index("workspace_members_user_id_idx").on(table.userId),
  ]
);

export const workspaceInvites = adscaleSchema.table(
  "workspace_invites",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull().default("member"),
    token: text("token").notNull().unique(),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("workspace_invites_workspace_id_idx").on(table.workspaceId),
    index("workspace_invites_token_idx").on(table.token),
    index("workspace_invites_email_idx").on(table.email),
  ]
);

// ============================================
// Billing tables
// ============================================

export const billingCustomers = adscaleSchema.table(
  "billing_customers",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .unique()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    stripeCustomerId: text("stripe_customer_id").notNull().unique(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("billing_customers_workspace_id_idx").on(table.workspaceId),
    index("billing_customers_stripe_customer_id_idx").on(table.stripeCustomerId),
  ]
);

export const subscriptions = adscaleSchema.table(
  "subscriptions",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    billingCustomerId: uuid("billing_customer_id").references(() => billingCustomers.id, {
      onDelete: "set null",
    }),
    stripeSubscriptionId: text("stripe_subscription_id").notNull().unique(),
    stripeCustomerId: text("stripe_customer_id").notNull(),
    status: text("status").notNull(),
    planKey: text("plan_key").notNull(),
    priceId: text("price_id").notNull(),
    currentPeriodStart: timestamp("current_period_start", { mode: "date" }),
    currentPeriodEnd: timestamp("current_period_end", { mode: "date" }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("subscriptions_workspace_id_idx").on(table.workspaceId),
    index("subscriptions_billing_customer_id_idx").on(table.billingCustomerId),
    index("subscriptions_status_idx").on(table.status),
  ]
);

export const creditGrants = adscaleSchema.table(
  "credit_grants",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    sourceId: text("source_id"),
    amount: integer("amount").notNull(),
    remaining: integer("remaining").notNull(),
    expiresAt: timestamp("expires_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("credit_grants_workspace_id_idx").on(table.workspaceId),
    index("credit_grants_source_id_idx").on(table.sourceId),
  ]
);

export const workspaceEntitlements = adscaleSchema.table(
  "workspace_entitlements",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    status: text("status").notNull(),
    sourceCode: text("source_code"),
    redeemedByUserId: text("redeemed_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    metadata: jsonb("metadata"),
    startsAt: timestamp("starts_at", { mode: "date" }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("workspace_entitlements_workspace_id_idx").on(table.workspaceId),
    index("workspace_entitlements_kind_status_idx").on(table.kind, table.status),
    uniqueIndex("workspace_entitlements_workspace_kind_uidx").on(
      table.workspaceId,
      table.kind
    ),
  ]
);

export const betaAccessRedemptions = adscaleSchema.table(
  "beta_access_redemptions",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .unique()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    entitlementId: uuid("entitlement_id")
      .notNull()
      .references(() => workspaceEntitlements.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("beta_access_redemptions_user_id_idx").on(table.userId),
    index("beta_access_redemptions_entitlement_id_idx").on(table.entitlementId),
  ]
);

export const processedStripeEvents = adscaleSchema.table(
  "processed_stripe_events",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    stripeEventId: text("stripe_event_id").notNull().unique(),
    type: text("type").notNull(),
    payload: jsonb("payload"),
    processedAt: timestamp("processed_at", { mode: "date" }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("processed_stripe_events_stripe_event_id_idx").on(table.stripeEventId),
    index("processed_stripe_events_type_idx").on(table.type),
  ]
);

export const clientProfiles = adscaleSchema.table(
  "client_profiles",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .unique()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    visualNotes: text("visual_notes"),
    toneNotes: text("tone_notes"),
    constraints: text("constraints"),
    brandColors: jsonb("brand_colors"),
    brandFonts: jsonb("brand_fonts"),
    logoAssetKey: text("logo_asset_key"),
    toneOfVoice: text("tone_of_voice"),
    prohibitedElements: text("prohibited_elements"),
    requiredElements: text("required_elements"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("client_profiles_workspace_id_idx").on(table.workspaceId),
  ]
);

export const competitorAnalyses = adscaleSchema.table(
  "competitor_analyses",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .references(() => campaigns.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    platform: text("platform"),
    website: text("website"),
    screenshots: text("screenshots").array(),
    strengths: jsonb("strengths"),
    weaknesses: jsonb("weaknesses"),
    differentiators: jsonb("differentiators"),
    analysis: jsonb("analysis"),
    analyzedAt: timestamp("analyzed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("competitor_analyses_workspace_id_idx").on(table.workspaceId),
    index("competitor_analyses_campaign_id_idx").on(table.campaignId),
  ]
);

export const clientReferences = adscaleSchema.table(
  "client_references",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientProfileId: uuid("client_profile_id")
      .notNull()
      .references(() => clientProfiles.id, { onDelete: "cascade" }),
    assetKey: text("asset_key").notNull(),
    label: text("label").notNull(),
    kind: text("kind").notNull().default("other"),
    notes: text("notes"),
    sourceDerivationId: uuid("source_derivation_id").references(() => derivations.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("client_references_workspace_id_idx").on(table.workspaceId),
    index("client_references_client_profile_id_idx").on(table.clientProfileId),
  ]
);

export const campaigns = adscaleSchema.table(
  "campaigns",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    client: text("client"),
    product: text("product"),
    objective: text("objective"),
    audience: text("audience"),
    platforms: text("platforms").array(),
    tone: text("tone"),
    offer: text("offer"),
    constraints: text("constraints"),
    platformSpecificNotes: jsonb("platform_specific_notes"),
    notes: text("notes"),
    generationMode: text("generation_mode").notNull().default("art_variation"),
    ctaVariants: text("cta_variants").array(),
    targetFormats: text("target_formats").array(),
    creativeLevel: text("creative_level").notNull().default("balanced"),
    styleIntensity: text("style_intensity").notNull().default("medium"),
    creativeDiagnosisStatus: text("creative_diagnosis_status").notNull().default("pending"),
    creativeDiagnosis: jsonb("creative_diagnosis"),
    creativeDiagnosisSource: text("creative_diagnosis_source"),
    creativeDiagnosisUpdatedAt: timestamp("creative_diagnosis_updated_at", { mode: "date" }),
    clientProfileId: uuid("client_profile_id").references(() => clientProfiles.id, { onDelete: "set null" }),
    selectedReferenceIds: text("selected_reference_ids").array(),
    campaignMemory: jsonb("campaign_memory").$type<
      import("../memory/campaign-memory").CampaignMemoryRecord
    >(),
    status: text("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("campaigns_workspace_id_idx").on(table.workspaceId)]
);

export const campaignTemplates = adscaleSchema.table(
  "campaign_templates",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    client: text("client"),
    product: text("product"),
    objective: text("objective"),
    audience: text("audience"),
    platforms: text("platforms").array(),
    tone: text("tone"),
    offer: text("offer"),
    constraints: text("constraints"),
    notes: text("notes"),
    generationMode: text("generation_mode").notNull().default("art_variation"),
    creativeLevel: text("creative_level").notNull().default("balanced"),
    styleIntensity: text("style_intensity").notNull().default("medium"),
    ctaVariants: text("cta_variants").array(),
    targetFormats: text("target_formats").array(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("campaign_templates_workspace_id_idx").on(table.workspaceId)]
);

export const campaignAssets = adscaleSchema.table(
  "campaign_assets",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    type: text("type").notNull(),
    size: integer("size"),
    width: integer("width"),
    height: integer("height"),
    role: text("role").notNull().default("base"),
    metadata: jsonb("metadata"),
    analysisStatus: text("analysis_status").default("pending"),
    analyzedAt: timestamp("analyzed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("campaign_assets_campaign_id_idx").on(table.campaignId),
    index("campaign_assets_workspace_id_idx").on(table.workspaceId),
  ]
  );

export const pendingUploads = adscaleSchema.table(
  "pending_uploads",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    key: text("key").notNull().unique(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    contentLength: integer("content_length").notNull(),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    completedAt: timestamp("completed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("pending_uploads_campaign_id_idx").on(table.campaignId),
    index("pending_uploads_workspace_id_idx").on(table.workspaceId),
    index("pending_uploads_status_expires_at_idx").on(table.status, table.expiresAt),
  ]
);

export const workspaceAssets = adscaleSchema.table(
  "workspace_assets",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    key: text("key").notNull().unique(),
    type: text("type").notNull(),
    size: integer("size").notNull(),
    width: integer("width"),
    height: integer("height"),
    tags: jsonb("tags").$type<string[]>(),
    aiDescription: text("ai_description"),
    source: text("source").notNull().default("upload"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("workspace_assets_workspace_id_idx").on(table.workspaceId),
    index("workspace_assets_source_idx").on(table.source),
  ]
);

export const creativePlans = adscaleSchema.table(
  "creative_plans",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    strategy: text("strategy"),
    angles: text("angles").array(),
    hooks: text("hooks").array(),
    ctas: text("ctas").array(),
    status: text("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("creative_plans_campaign_id_idx").on(table.campaignId),
    index("creative_plans_workspace_id_idx").on(table.workspaceId),
  ]
);

export const derivationCopyVariants = adscaleSchema.table(
  "derivation_copy_variants",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    derivationId: uuid("derivation_id")
      .notNull()
      .references(() => derivations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    headline: text("headline").notNull(),
    ctaText: text("cta_text"),
    toneLabel: text("tone_label"),
    confidenceScore: integer("confidence_score"),
    isSelected: boolean("is_selected").default(false),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("derivation_copy_variants_derivation_id_idx").on(table.derivationId),
    index("derivation_copy_variants_workspace_id_idx").on(table.workspaceId),
  ]
);

export const derivations = adscaleSchema.table(
  "derivations",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    planId: uuid("plan_id").references(() => creativePlans.id, { onDelete: "set null" }),
    parentId: uuid("parent_id"),
    status: text("status").notNull().default("queued"),
    prompt: text("prompt"),
    outputKey: text("output_key"),
    format: text("format"),
    generationMode: text("generation_mode"),
    variantIndex: integer("variant_index"),
    ctaText: text("cta_text"),
    styleAssetId: text("style_asset_id"),
    cost: integer("cost"),
    feedback: text("feedback"),
    qualityScore: integer("quality_score"),
    scoreStatus: text("score_status").notNull().default("pending"),
    scoreBreakdown: jsonb("score_breakdown"),
    scoreIssues: jsonb("score_issues"),
    regenerationSuggestion: text("regeneration_suggestion"),
    isPreview: boolean("is_preview").notNull().default(false),
    scoredAt: timestamp("scored_at", { mode: "date" }),
    qaStatus: text("qa_status").notNull().default("pending"),
    qaChecklist: jsonb("qa_checklist"),
    qaIssues: jsonb("qa_issues"),
    qaSuggestions: jsonb("qa_suggestions"),
    qaAnalyzedAt: timestamp("qa_analyzed_at", { mode: "date" }),
    qualityVerdict: text("quality_verdict"),
    hardFailures: jsonb("hard_failures"),
    polishSuggestions: jsonb("polish_suggestions"),
    qualityGatedAt: timestamp("quality_gated_at", { mode: "date" }),
    inputPrompt: text("input_prompt"),
    creativeContract: jsonb("creative_contract").$type<
      import("../ai/creative-contract").CreativeContract
    >(),
    regenerationCorrectionBrief: jsonb("regeneration_correction_brief").$type<
      import("../ai/regeneration-correction-brief").RegenerationCorrectionBriefRecord
    >(),
    promptProvenance: jsonb("prompt_provenance").$type<
      import("../ai/creative-contract").PromptProvenance
    >(),
    generationLog: jsonb("generation_log").$type<
      import("../ai/generation-log").DerivationGenerationLog
    >(),
    outputLearningApplication: jsonb("output_learning_application").$type<
      import("../human-quality/corpus").OutputLearningApplicationSnapshot
    >(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("derivations_campaign_id_idx").on(table.campaignId),
    index("derivations_workspace_id_idx").on(table.workspaceId),
    index("derivations_plan_id_idx").on(table.planId),
    index("derivations_parent_id_idx").on(table.parentId),
    index("derivations_workspace_campaign_idx").on(table.workspaceId, table.campaignId),
    index("derivations_workspace_created_at_idx").on(table.workspaceId, table.createdAt),
    foreignKey({
      columns: [table.parentId],
      foreignColumns: [table.id],
    }).onDelete("set null"),
  ]
);

export const creativePerformanceSnapshots = adscaleSchema.table(
  "creative_performance_snapshots",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientProfileId: uuid("client_profile_id")
      .notNull()
      .references(() => clientProfiles.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    derivationId: uuid("derivation_id")
      .notNull()
      .references(() => derivations.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    placement: text("placement").notNull(),
    placementRaw: text("placement_raw").notNull(),
    adAccountId: text("ad_account_id"),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    sourceTimezone: text("source_timezone").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    impressions: numeric("impressions", { precision: 30, scale: 0 }).notNull(),
    clicks: numeric("clicks", { precision: 30, scale: 0 }).notNull(),
    spend: numeric("spend", { precision: 20, scale: 6 }).notNull(),
    conversions: numeric("conversions", { precision: 20, scale: 6 }).notNull(),
    conversionValue: numeric("conversion_value", { precision: 20, scale: 6 }).notNull(),
    sourceType: text("source_type").notNull(),
    externalCampaignId: text("external_campaign_id"),
    externalAdGroupId: text("external_ad_group_id"),
    externalAdId: text("external_ad_id"),
    sourceKey: varchar("source_key", { length: 64 }).notNull(),
    scopeKind: text("scope_kind").notNull(),
    scopeDimensions: jsonb("scope_dimensions").$type<Record<string, string>>(),
    sourceMetadata: jsonb("source_metadata").$type<Record<string, unknown>>(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("creative_performance_workspace_source_key_uq").on(
      table.workspaceId,
      table.sourceKey
    ),
    index("creative_performance_workspace_campaign_idx").on(
      table.workspaceId,
      table.campaignId
    ),
    index("creative_performance_workspace_derivation_idx").on(
      table.workspaceId,
      table.derivationId
    ),
    index("creative_performance_workspace_client_period_idx").on(
      table.workspaceId,
      table.clientProfileId,
      table.startDate,
      table.endDate
    ),
    index("creative_performance_workspace_placement_idx").on(
      table.workspaceId,
      table.platform,
      table.placement
    ),
    check(
      "creative_performance_period_check",
      sql`${table.endDate} >= ${table.startDate}`
    ),
    check(
      "creative_performance_impressions_nonnegative_check",
      sql`${table.impressions} >= 0`
    ),
    check(
      "creative_performance_clicks_nonnegative_check",
      sql`${table.clicks} >= 0`
    ),
    check(
      "creative_performance_clicks_lte_impressions_check",
      sql`${table.clicks} <= ${table.impressions}`
    ),
    check("creative_performance_spend_nonnegative_check", sql`${table.spend} >= 0`),
    check(
      "creative_performance_conversions_nonnegative_check",
      sql`${table.conversions} >= 0`
    ),
    check(
      "creative_performance_value_nonnegative_check",
      sql`${table.conversionValue} >= 0`
    ),
    check(
      "creative_performance_scope_kind_check",
      sql`${table.scopeKind} in ('total', 'segment')`
    ),
  ]
);

export type CreativePerformanceSnapshot =
  typeof creativePerformanceSnapshots.$inferSelect;
export type NewCreativePerformanceSnapshot =
  typeof creativePerformanceSnapshots.$inferInsert;

export const performanceImportBatches = adscaleSchema.table(
  "performance_import_batches",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    sourceType: text("source_type").notNull(),
    fileName: text("file_name"),
    fileHash: text("file_hash"),
    columnMapping: jsonb("column_mapping").$type<Record<string, string>>(),
    parseOptions: jsonb("parse_options").$type<import("../performance/import/types").ParseOptions>(),
    createdCount: integer("created_count").notNull().default(0),
    updatedCount: integer("updated_count").notNull().default(0),
    ignoredCount: integer("ignored_count").notNull().default(0),
    invalidCount: integer("invalid_count").notNull().default(0),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("performance_import_batches_workspace_campaign_idx").on(
      table.workspaceId,
      table.campaignId
    ),
    check(
      "performance_import_batches_source_type_check",
      sql`${table.sourceType} in ('manual', 'csv')`
    ),
  ]
);

export const performanceImportRows = adscaleSchema.table(
  "performance_import_rows",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => performanceImportBatches.id, { onDelete: "cascade" }),
    rowIndex: integer("row_index").notNull(),
    status: text("status").notNull(),
    errors: jsonb("errors").$type<
      Array<{ field: string; message: string; rawValue?: string }>
    >(),
    snapshotId: uuid("snapshot_id").references(
      () => creativePerformanceSnapshots.id,
      { onDelete: "set null" }
    ),
    sourceKey: varchar("source_key", { length: 64 }),
  },
  (table) => [
    index("performance_import_rows_batch_idx").on(table.batchId),
    check(
      "performance_import_rows_status_check",
      sql`${table.status} in ('created', 'updated', 'ignored', 'invalid')`
    ),
  ]
);

export type PerformanceImportBatch =
  typeof performanceImportBatches.$inferSelect;
export type NewPerformanceImportBatch =
  typeof performanceImportBatches.$inferInsert;
export type PerformanceImportRow = typeof performanceImportRows.$inferSelect;
export type NewPerformanceImportRow = typeof performanceImportRows.$inferInsert;

export const creativeHypotheses = adscaleSchema.table(
  "creative_hypotheses",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    title: text("title"),
    variableKey: text("variable_key").notNull(),
    primaryMetric: text("primary_metric").notNull(),
    expectedDirection: text("expected_direction").notNull(),
    rationale: text("rationale").notNull(),
    kind: text("kind").notNull().default("controlled_hypothesis"),
    platform: text("platform"),
    periodStart: date("period_start", { mode: "string" }),
    periodEnd: date("period_end", { mode: "string" }),
    outcome: text("outcome"),
    status: text("status").notNull().default("active"),
    lastComparisonAt: timestamp("last_comparison_at", { mode: "date" }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("creative_hypotheses_workspace_campaign_idx").on(
      table.workspaceId,
      table.campaignId
    ),
    check(
      "creative_hypotheses_expected_direction_check",
      sql`${table.expectedDirection} in ('increase', 'decrease')`
    ),
    check(
      "creative_hypotheses_kind_check",
      sql`${table.kind} in ('controlled_hypothesis', 'observational')`
    ),
    check(
      "creative_hypotheses_outcome_check",
      sql`${table.outcome} is null or ${table.outcome} in ('supported', 'contradicted', 'inconclusive')`
    ),
    check(
      "creative_hypotheses_status_check",
      sql`${table.status} in ('draft', 'active', 'concluded')`
    ),
  ]
);

export const hypothesisVariants = adscaleSchema.table(
  "hypothesis_variants",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    hypothesisId: uuid("hypothesis_id")
      .notNull()
      .references(() => creativeHypotheses.id, { onDelete: "cascade" }),
    derivationId: uuid("derivation_id")
      .notNull()
      .references(() => derivations.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    label: text("label"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("hypothesis_variants_hypothesis_derivation_uq").on(
      table.hypothesisId,
      table.derivationId
    ),
    index("hypothesis_variants_derivation_idx").on(table.derivationId),
    check(
      "hypothesis_variants_role_check",
      sql`${table.role} in ('control', 'variant')`
    ),
  ]
);

export const variantComparisons = adscaleSchema.table(
  "variant_comparisons",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    hypothesisId: uuid("hypothesis_id").references(() => creativeHypotheses.id, {
      onDelete: "set null",
    }),
    kind: text("kind").notNull(),
    verdict: text("verdict").notNull(),
    primaryMetric: text("primary_metric").notNull(),
    expectedDirection: text("expected_direction"),
    winnerDerivationId: uuid("winner_derivation_id").references(
      () => derivations.id,
      { onDelete: "set null" }
    ),
    outcome: text("outcome"),
    platform: text("platform"),
    periodStart: date("period_start", { mode: "string" }),
    periodEnd: date("period_end", { mode: "string" }),
    exclusionReasons: jsonb("exclusion_reasons").$type<
      import("../performance/hypothesis/types").ComparisonExclusion[]
    >(),
    variantResults: jsonb("variant_results").$type<
      import("../performance/hypothesis/types").VariantComparisonReport
    >(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("variant_comparisons_workspace_campaign_idx").on(
      table.workspaceId,
      table.campaignId
    ),
    index("variant_comparisons_hypothesis_idx").on(table.hypothesisId),
    check(
      "variant_comparisons_kind_check",
      sql`${table.kind} in ('controlled_hypothesis', 'observational')`
    ),
    check(
      "variant_comparisons_verdict_check",
      sql`${table.verdict} in ('winner', 'no_clear_winner', 'insufficient_evidence', 'not_comparable')`
    ),
    check(
      "variant_comparisons_outcome_check",
      sql`${table.outcome} is null or ${table.outcome} in ('supported', 'contradicted', 'inconclusive')`
    ),
  ]
);

export type CreativeHypothesis = typeof creativeHypotheses.$inferSelect;
export type NewCreativeHypothesis = typeof creativeHypotheses.$inferInsert;
export type HypothesisVariant = typeof hypothesisVariants.$inferSelect;
export type NewHypothesisVariant = typeof hypothesisVariants.$inferInsert;
export type VariantComparison = typeof variantComparisons.$inferSelect;
export type NewVariantComparison = typeof variantComparisons.$inferInsert;

export const clientPerformanceLearnings = adscaleSchema.table(
  "client_performance_learnings",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientProfileId: uuid("client_profile_id")
      .notNull()
      .references(() => clientProfiles.id, { onDelete: "cascade" }),
    variableKey: text("variable_key").notNull(),
    variableValue: text("variable_value").notNull(),
    primaryMetric: text("primary_metric").notNull(),
    expectedDirection: text("expected_direction"),
    statement: text("statement").notNull(),
    confidence: text("confidence").notNull().default("low"),
    confidenceScore: numeric("confidence_score", { precision: 5, scale: 4 })
      .notNull()
      .default("0"),
    sampleImpressions: integer("sample_impressions").notNull().default(0),
    sampleCampaignCount: integer("sample_campaign_count").notNull().default(0),
    contextPlatforms: text("context_platforms").array(),
    contextObjectives: text("context_objectives").array(),
    supportingEvidence: jsonb("supporting_evidence")
      .$type<import("../performance/learning/types").LearningEvidenceRef[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    contradictingEvidence: jsonb("contradicting_evidence")
      .$type<import("../performance/learning/types").LearningEvidenceRef[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    algorithmVersion: text("algorithm_version").notNull(),
    status: text("status").notNull().default("approved"),
    mem0MemoryId: text("mem0_memory_id"),
    lastEvidenceAt: timestamp("last_evidence_at", { mode: "date" }),
    approvedAt: timestamp("approved_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("client_performance_learnings_identity_uq").on(
      table.workspaceId,
      table.clientProfileId,
      table.variableKey,
      table.variableValue,
      table.primaryMetric
    ),
    index("client_performance_learnings_client_idx").on(
      table.workspaceId,
      table.clientProfileId
    ),
    index("client_performance_learnings_status_idx").on(
      table.workspaceId,
      table.clientProfileId,
      table.status
    ),
    check(
      "client_performance_learnings_confidence_check",
      sql`${table.confidence} in ('low', 'medium', 'high')`
    ),
    check(
      "client_performance_learnings_direction_check",
      sql`${table.expectedDirection} is null or ${table.expectedDirection} in ('increase', 'decrease')`
    ),
    check(
      "client_performance_learnings_status_check",
      sql`${table.status} in ('draft', 'approved', 'superseded', 'removed')`
    ),
  ]
);

export type ClientPerformanceLearning =
  typeof clientPerformanceLearnings.$inferSelect;
export type NewClientPerformanceLearning =
  typeof clientPerformanceLearnings.$inferInsert;

export const clientOutputLearnings = adscaleSchema.table(
  "client_output_learnings",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientProfileId: uuid("client_profile_id")
      .notNull()
      .references(() => clientProfiles.id, { onDelete: "cascade" }),
    variableKey: text("variable_key").notNull(),
    variableValue: text("variable_value").notNull(),
    scopeGenerationMode: text("scope_generation_mode").notNull().default(""),
    scopeFormat: text("scope_format").notNull().default(""),
    preferenceDirection: text("preference_direction").notNull().default("prefer"),
    statement: text("statement").notNull(),
    confidence: text("confidence").notNull().default("low"),
    confidenceScore: numeric("confidence_score", { precision: 5, scale: 4 })
      .notNull()
      .default("0"),
    sampleEventCount: integer("sample_event_count").notNull().default(0),
    sampleCampaignCount: integer("sample_campaign_count").notNull().default(0),
    supportingEvidence: jsonb("supporting_evidence")
      .$type<import("../output-learning/types").OutputLearningEvidenceRef[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    contradictingEvidence: jsonb("contradicting_evidence")
      .$type<import("../output-learning/types").OutputLearningEvidenceRef[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    algorithmVersion: text("algorithm_version").notNull(),
    status: text("status").notNull().default("draft"),
    mem0MemoryId: text("mem0_memory_id"),
    lastEvidenceAt: timestamp("last_evidence_at", { mode: "date" }),
    approvedAt: timestamp("approved_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("client_output_learnings_identity_uq").on(
      table.workspaceId,
      table.clientProfileId,
      table.variableKey,
      table.variableValue,
      table.scopeGenerationMode,
      table.scopeFormat
    ),
    index("client_output_learnings_client_idx").on(
      table.workspaceId,
      table.clientProfileId
    ),
    index("client_output_learnings_status_idx").on(
      table.workspaceId,
      table.clientProfileId,
      table.status
    ),
    check(
      "client_output_learnings_confidence_check",
      sql`${table.confidence} in ('low', 'medium', 'high')`
    ),
    check(
      "client_output_learnings_direction_check",
      sql`${table.preferenceDirection} in ('prefer', 'avoid')`
    ),
    check(
      "client_output_learnings_status_check",
      sql`${table.status} in ('draft', 'approved', 'superseded', 'removed')`
    ),
  ]
);

export type ClientOutputLearning = typeof clientOutputLearnings.$inferSelect;
export type NewClientOutputLearning = typeof clientOutputLearnings.$inferInsert;

export const usageEvents = adscaleSchema.table(
  "usage_events",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    amount: integer("amount"),
    idempotencyKey: text("idempotency_key").unique(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("usage_events_workspace_id_idx").on(table.workspaceId),
    index("usage_events_idempotency_key_idx").on(table.idempotencyKey),
  ]
);

export const activityEvents = adscaleSchema.table(
  "activity_events",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("activity_events_workspace_id_idx").on(table.workspaceId),
    index("activity_events_user_id_idx").on(table.userId),
  ]
);

export const exports = adscaleSchema.table(
  "exports",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    derivationId: uuid("derivation_id")
      .notNull()
      .references(() => derivations.id, { onDelete: "cascade" }),
    format: text("format").notNull(),
    key: text("key").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("exports_workspace_id_idx").on(table.workspaceId),
    index("exports_derivation_id_idx").on(table.derivationId),
  ]
);

export const landingPages = adscaleSchema.table(
  "landing_pages",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    sourceDerivationId: uuid("source_derivation_id")
      .notNull()
      .references(() => derivations.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("queued"),
    title: text("title"),
    structure: jsonb("structure"),
    htmlKey: text("html_key"),
    error: text("error"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("landing_pages_workspace_id_idx").on(table.workspaceId),
    index("landing_pages_campaign_id_idx").on(table.campaignId),
    index("landing_pages_source_derivation_id_idx").on(table.sourceDerivationId),
  ]
);


export const shareLinks = adscaleSchema.table(
  "share_links",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    token: text("token").notNull().unique(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    derivationIds: text("derivation_ids").array().notNull(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("share_links_token_idx").on(table.token),
    index("share_links_campaign_id_idx").on(table.campaignId),
    index("share_links_workspace_id_idx").on(table.workspaceId),
  ]
);

export const personaSimulations = adscaleSchema.table(
  "persona_simulations",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    sourceType: varchar("source_type", { length: 32 }).notNull(),
    sourceId: uuid("source_id").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    results: jsonb("results"),
    cacheExpiresAt: timestamp("cache_expires_at", { mode: "date" }),
    error: text("error"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("persona_simulations_source_idx").on(table.workspaceId, table.sourceType, table.sourceId),
  ]
);

export const creditTransactions = adscaleSchema.table(
  "credit_transactions",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    derivationId: uuid("derivation_id").references(() => derivations.id, { onDelete: "set null" }),
    amount: integer("amount").notNull(),
    type: text("type").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("credit_transactions_workspace_id_idx").on(table.workspaceId),
    index("credit_transactions_user_id_idx").on(table.userId),
    index("credit_transactions_campaign_id_idx").on(table.campaignId),
    index("credit_transactions_created_at_idx").on(table.createdAt),
  ]
);

export const notifications = adscaleSchema.table(
  "notifications",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 32 }).notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    derivationId: uuid("derivation_id").references(() => derivations.id, { onDelete: "set null" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    readAt: timestamp("read_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("notifications_user_id_idx").on(table.userId),
    index("notifications_workspace_id_idx").on(table.workspaceId),
    index("notifications_read_at_idx").on(table.readAt),
    index("notifications_created_at_idx").on(table.createdAt),
  ]
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

export const feedbackReports = adscaleSchema.table(
  "feedback_reports",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("new"),
    type: text("type").notNull(),
    severity: text("severity").notNull(),
    category: text("category").notNull(),
    message: text("message").notNull(),
    followUpAllowed: boolean("follow_up_allowed").notNull().default(false),
    route: text("route"),
    contextKind: text("context_kind").notNull().default("global"),
    campaignId: uuid("campaign_id").references(() => campaigns.id, {
      onDelete: "set null",
    }),
    derivationId: uuid("derivation_id").references(() => derivations.id, {
      onDelete: "set null",
    }),
    assetRefs: jsonb("asset_refs").$type<
      Array<{ kind: string; id: string; key?: string }>
    >(),
    diagnosticContext: jsonb("diagnostic_context"),
    sentryCorrelation: jsonb("sentry_correlation"),
    contextCompleteness: jsonb("context_completeness"),
    internalNotes: text("internal_notes"),
    resolutionSummary: text("resolution_summary"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("feedback_reports_workspace_id_idx").on(table.workspaceId),
    index("feedback_reports_user_id_idx").on(table.userId),
    index("feedback_reports_status_idx").on(table.status),
    index("feedback_reports_created_at_idx").on(table.createdAt),
    index("feedback_reports_campaign_id_idx").on(table.campaignId),
    index("feedback_reports_derivation_id_idx").on(table.derivationId),
  ]
);

export type FeedbackReport = typeof feedbackReports.$inferSelect;
export type NewFeedbackReport = typeof feedbackReports.$inferInsert;

export const betaSessions = adscaleSchema.table(
  "beta_sessions",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    cohortLabel: text("cohort_label"),
    assistanceLevel: text("assistance_level").notNull(),
    startedAt: timestamp("started_at", { mode: "date" }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { mode: "date" }),
    operatorNotes: jsonb("operator_notes")
      .$type<
        Record<
          string,
          {
            notes?: string;
            tags?: string[];
            completedAt?: string;
            blockerIds?: string[];
            feedbackReportId?: string;
          }
        >
      >()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("beta_sessions_workspace_id_idx").on(table.workspaceId)]
);

export type BetaSession = typeof betaSessions.$inferSelect;
export type NewBetaSession = typeof betaSessions.$inferInsert;

export const betaAnalyticsEvents = adscaleSchema.table(
  "beta_analytics_events",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => betaSessions.id, {
      onDelete: "set null",
    }),
    eventKey: text("event_key").notNull(),
    properties: jsonb("properties")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    source: text("source").notNull().default("client"),
    campaignId: uuid("campaign_id").references(() => campaigns.id, {
      onDelete: "set null",
    }),
    derivationId: uuid("derivation_id").references(() => derivations.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("beta_analytics_events_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt
    ),
    index("beta_analytics_events_session_id_idx").on(table.sessionId),
    index("beta_analytics_events_event_key_idx").on(
      table.workspaceId,
      table.eventKey,
      table.createdAt
    ),
  ]
);

export type BetaAnalyticsEvent = typeof betaAnalyticsEvents.$inferSelect;
export type NewBetaAnalyticsEvent = typeof betaAnalyticsEvents.$inferInsert;

export const outputDecisionEvents = adscaleSchema.table(
  "output_decision_events",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    clientProfileId: uuid("client_profile_id").references(() => clientProfiles.id, {
      onDelete: "set null",
    }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    derivationId: uuid("derivation_id")
      .notNull()
      .references(() => derivations.id, { onDelete: "cascade" }),
    parentDerivationId: uuid("parent_derivation_id").references(() => derivations.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    direction: text("direction").notNull(),
    strength: text("strength").notNull(),
    source: text("source").notNull(),
    contextSnapshot: jsonb("context_snapshot")
      .$type<import("../output-learning/output-decision-events").OutputDecisionSnapshot>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("output_decision_events_idempotency_uq")
      .on(table.workspaceId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    index("output_decision_events_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt
    ),
    index("output_decision_events_campaign_idx").on(
      table.workspaceId,
      table.campaignId,
      table.createdAt
    ),
    index("output_decision_events_derivation_idx").on(
      table.workspaceId,
      table.derivationId,
      table.createdAt
    ),
    index("output_decision_events_client_profile_idx").on(
      table.workspaceId,
      table.clientProfileId,
      table.createdAt
    ),
  ]
);

export type OutputDecisionEvent = typeof outputDecisionEvents.$inferSelect;
export type NewOutputDecisionEvent = typeof outputDecisionEvents.$inferInsert;

export const humanQualityCorpusItems = adscaleSchema.table(
  "human_quality_corpus_items",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientProfileId: uuid("client_profile_id")
      .notNull()
      .references(() => clientProfiles.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    derivationId: uuid("derivation_id")
      .notNull()
      .references(() => derivations.id, { onDelete: "cascade" }),
    generationMode: text("generation_mode").notNull(),
    format: text("format").notNull().default(""),
    cohort: text("cohort").notNull().default("baseline"),
    corpusVersion: integer("corpus_version").notNull().default(1),
    artifactRef: jsonb("artifact_ref")
      .$type<import("../human-quality/corpus").HumanQualityArtifactRef>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    qualitySnapshot: jsonb("quality_snapshot")
      .$type<import("../human-quality/corpus").HumanQualityQualitySnapshot>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    selectedByUserId: text("selected_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    selectedAt: timestamp("selected_at", { mode: "date" }).notNull().defaultNow(),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("human_quality_corpus_items_derivation_version_uq").on(
      table.workspaceId,
      table.derivationId,
      table.corpusVersion
    ),
    index("human_quality_corpus_items_workspace_status_idx").on(
      table.workspaceId,
      table.status,
      table.selectedAt
    ),
    index("human_quality_corpus_items_workspace_cohort_idx").on(
      table.workspaceId,
      table.cohort,
      table.generationMode,
      table.format
    ),
    index("human_quality_corpus_items_campaign_idx").on(
      table.workspaceId,
      table.campaignId,
      table.selectedAt
    ),
    check(
      "human_quality_corpus_items_cohort_check",
      sql`${table.cohort} in ('baseline', 'pre_learning', 'post_learning')`
    ),
    check(
      "human_quality_corpus_items_status_check",
      sql`${table.status} in ('pending', 'evaluated', 'removed')`
    ),
  ]
);

export type HumanQualityCorpusItem = typeof humanQualityCorpusItems.$inferSelect;
export type NewHumanQualityCorpusItem = typeof humanQualityCorpusItems.$inferInsert;

export const humanQualityEvaluations = adscaleSchema.table(
  "human_quality_evaluations",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    corpusItemId: uuid("corpus_item_id")
      .notNull()
      .references(() => humanQualityCorpusItems.id, { onDelete: "cascade" }),
    reviewerUserId: text("reviewer_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    visualScore: integer("visual_score").notNull(),
    factualPass: boolean("factual_pass").notNull(),
    intent: text("intent").notNull(),
    primaryFailureReason: text("primary_failure_reason").notNull(),
    otherReasonText: text("other_reason_text"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("human_quality_evaluations_item_idx").on(
      table.workspaceId,
      table.corpusItemId,
      table.createdAt
    ),
    index("human_quality_evaluations_reviewer_idx").on(
      table.workspaceId,
      table.reviewerUserId,
      table.createdAt
    ),
    check(
      "human_quality_evaluations_visual_score_check",
      sql`${table.visualScore} >= 0 and ${table.visualScore} <= 100`
    ),
    check(
      "human_quality_evaluations_intent_check",
      sql`${table.intent} in ('approve', 'reject', 'regenerate')`
    ),
    check(
      "human_quality_evaluations_failure_reason_check",
      sql`${table.primaryFailureReason} in (
        'visual_overload',
        'weak_hierarchy',
        'generic_template_feel',
        'illegible_cta',
        'unfocused_composition',
        'factual_issue',
        'format_or_crop_issue',
        'other'
      )`
    ),
  ]
);

export type HumanQualityEvaluation = typeof humanQualityEvaluations.$inferSelect;
export type NewHumanQualityEvaluation = typeof humanQualityEvaluations.$inferInsert;

export const rubricCalibrationAdjustments = adscaleSchema.table(
  "rubric_calibration_adjustments",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    adjustmentVersion: text("adjustment_version").notNull(),
    status: text("status").notNull().default("proposed"),
    targetModule: text("target_module").notNull(),
    targetKey: text("target_key").notNull(),
    sliceKey: text("slice_key").notNull(),
    rationale: text("rationale").notNull(),
    evidenceRefs: jsonb("evidence_refs")
      .$type<import("../human-quality/calibration/types").CalibrationAdjustmentEvidence>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    proposedAt: timestamp("proposed_at", { mode: "date" }).notNull().defaultNow(),
    acceptedAt: timestamp("accepted_at", { mode: "date" }),
    acceptedBy: text("accepted_by").references(() => user.id, { onDelete: "set null" }),
    changeSpec: jsonb("change_spec")
      .$type<import("../human-quality/improvement/types").QualityImprovementChangeSpec>()
      .default(sql`NULL`),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("rubric_calibration_adjustments_slice_version_uq").on(
      table.sliceKey,
      table.adjustmentVersion,
      table.targetModule,
      table.targetKey
    ),
    index("rubric_calibration_adjustments_version_status_idx").on(
      table.adjustmentVersion,
      table.status,
      table.proposedAt
    ),
    check(
      "rubric_calibration_adjustments_status_check",
      sql`${table.status} in ('proposed', 'accepted', 'superseded')`
    ),
    check(
      "rubric_calibration_adjustments_target_module_check",
      sql`${table.targetModule} in ('score_ceiling', 'observable_rubric', 'gate_classifier')`
    ),
  ]
);

export type RubricCalibrationAdjustment =
  typeof rubricCalibrationAdjustments.$inferSelect;
export type NewRubricCalibrationAdjustment =
  typeof rubricCalibrationAdjustments.$inferInsert;

export const workspaceProgression = adscaleSchema.table(
  "workspace_progression",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .unique()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    levelKey: text("level_key").notNull().default("aprendiz"),
    completed: jsonb("completed")
      .$type<
        Array<{
          key: string;
          label: string;
          completedAt: string;
          evidenceId?: string;
          evidenceType?: string;
        }>
      >()
      .notNull()
      .default([]),
    nextAction: jsonb("next_action")
      .$type<{
        key: string;
        label: string;
        description: string;
        href: string;
        blocked: boolean;
        blockedReason?: string;
      }>()
      .notNull(),
    progressPercent: integer("progress_percent").notNull().default(0),
    lastCalculatedAt: timestamp("last_calculated_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("workspace_progression_workspace_id_idx").on(table.workspaceId),
    index("workspace_progression_level_key_idx").on(table.levelKey),
  ]
);

export type WorkspaceProgression = typeof workspaceProgression.$inferSelect;
export type NewWorkspaceProgression = typeof workspaceProgression.$inferInsert;

export const waitlistSignups = adscaleSchema.table(
  "waitlist_signups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    sector: text("sector").notNull(),
    sectorOther: text("sector_other"),
    whatsapp: text("whatsapp").notNull(),
    consentAt: timestamp("consent_at", { mode: "date" }).notNull(),
    consentVersion: text("consent_version").notNull(),
    locale: text("locale").notNull().default("pt-BR"),
    source: text("source").notNull().default("marketing-site"),
    resendContactId: text("resend_contact_id"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("waitlist_signups_email_uidx").on(table.email)]
);

export type WaitlistSignup = typeof waitlistSignups.$inferSelect;
export type NewWaitlistSignup = typeof waitlistSignups.$inferInsert;

export type PersonaSimulation = typeof personaSimulations.$inferSelect;
export type NewPersonaSimulation = typeof personaSimulations.$inferInsert;
