import {
  text,
  timestamp,
  boolean,
  uuid,
  integer,
  jsonb,
  index,
  foreignKey,
  pgSchema,
} from "drizzle-orm/pg-core";

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
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("derivations_campaign_id_idx").on(table.campaignId),
    index("derivations_workspace_id_idx").on(table.workspaceId),
    index("derivations_plan_id_idx").on(table.planId),
    index("derivations_parent_id_idx").on(table.parentId),
    foreignKey({
      columns: [table.parentId],
      foreignColumns: [table.id],
    }).onDelete("set null"),
  ]
);

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
