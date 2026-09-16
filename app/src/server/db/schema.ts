import {
  text,
  timestamp,
  boolean,
  uuid,
  integer,
  real,
  numeric,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
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
  bio: text("bio"),
  timezone: text("timezone"),
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
  description: text("description"),
  industry: text("industry"),
  website: text("website"),
  timezone: text("timezone"),
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

/**
 * Bearer tokens do MCP por workspace (primeira fatia, #356 rev. 2).
 * Guarda só o hash sha256 — o segredo aparece uma vez, na criação.
 * O agente age em nome do operador que criou o token.
 */
export const mcpWorkspaceTokens = adscaleSchema.table(
  "mcp_workspace_tokens",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    prefix: text("prefix").notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    lastUsedAt: timestamp("last_used_at", { mode: "date" }),
    revokedAt: timestamp("revoked_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("mcp_workspace_tokens_workspace_id_idx").on(table.workspaceId),
  ]
);

/**
 * Conexão Meta: o login OAuth. Pertence ao workspace (#345).
 * Token (system user de integração) cifrado com AES-GCM; ciphertext aqui.
 */
export const metaConnections = adscaleSchema.table(
  "meta_connections",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    status: text("status")
      .notNull()
      .default("ativa")
      .$type<"ativa" | "expirada" | "revogada" | "com_erro">(),
    tokenCiphertext: text("token_ciphertext"),
    tokenUpdatedAt: timestamp("token_updated_at", { mode: "date" }),
    lastSyncAt: timestamp("last_sync_at", { mode: "date" }),
    lastSyncError: text("last_sync_error"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("meta_connections_workspace_id_idx").on(table.workspaceId)]
);

/**
 * Conta de anúncios exposta pela Conexão. Vinculada a no máximo uma
 * marca; uma marca pode ter várias contas (#345).
 */
export const metaAdAccounts = adscaleSchema.table(
  "meta_ad_accounts",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => metaConnections.id, { onDelete: "cascade" }),
    /** Dígitos, sem prefixo act_. */
    adAccountId: text("ad_account_id").notNull(),
    name: text("name"),
    currency: text("currency").notNull().default("BRL"),
    brandId: uuid("brand_id").references(() => clientProfiles.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("meta_ad_accounts_connection_account_uq").on(table.connectionId, table.adAccountId),
    index("meta_ad_accounts_brand_id_idx").on(table.brandId),
  ]
);

/**
 * Anúncio veiculado: spec completa importada (mídia + texto + CTA).
 * Pertence à Conta, não à marca (#345). Id = ad_account_id:creative_id (#346 rev. 2).
 */
export const servedAds = adscaleSchema.table(
  "served_ads",
  {
    id: text("id").primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => metaAdAccounts.id, { onDelete: "cascade" }),
    adAccountId: text("ad_account_id").notNull(),
    creativeId: text("creative_id").notNull(),
    format: text("format")
      .notNull()
      .$type<"imagem" | "video" | "carrossel">(),
    textExcerpt: text("text_excerpt"),
    /** Chaves do ObjectStorage (cópia na ingestão); nunca URL da Meta. */
    mediaImageKey: text("media_image_key"),
    mediaVideoKey: text("media_video_key"),
    mediaThumbKey: text("media_thumb_key"),
    /** TTL 90 dias após a última entrega (#347 rev. 2). */
    lastDeliveredAt: timestamp("last_delivered_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("served_ads_account_id_idx").on(table.accountId)]
);

/** Métricas por Anúncio veiculado + janela (presets 7/30/90, #346). */
export const servedAdMetrics = adscaleSchema.table(
  "served_ad_metrics",
  {
    anuncioId: text("anuncio_id")
      .notNull()
      .references(() => servedAds.id, { onDelete: "cascade" }),
    windowDays: integer("window_days").notNull(),
    impressions: integer("impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    spend: numeric("spend", { precision: 14, scale: 2 }).notNull().default("0"),
    conversions: integer("conversions").notNull().default(0),
    syncedAt: timestamp("synced_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.anuncioId, table.windowDays] }),
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
    uniqueIndex("credit_grants_source_source_id_uidx")
      .on(table.source, table.sourceId)
      .where(sql`${table.sourceId} is not null`),
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
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    visualNotes: text("visual_notes"),
    toneNotes: text("tone_notes"),
    constraints: text("constraints"),
    brandColors: jsonb("brand_colors"),
    brandFonts: jsonb("brand_fonts"),
    brandFontAssets: jsonb("brand_font_assets").$type<
      import("../brand-training/font-assets").StoredBrandFontAsset[]
    >(),
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
    trainingCategory: text("training_category").$type<
      import("../brand-training/contracts").BrandTrainingCategory
    >(),
    usageMode: text("usage_mode").$type<
      import("../brand-training/contracts").BrandTrainingUsageMode
    >(),
    trainingAnalysis: jsonb("training_analysis").$type<
      import("../brand-training/contracts").BrandTrainingAnalysis
    >(),
    reviewStatus: text("review_status").$type<
      import("../brand-training/contracts").BrandTrainingReviewStatus
    >(),
    rejectionReason: jsonb("rejection_reason").$type<
      import("../brand-training/contracts").BrandTrainingRejection
    >(),
    reviewedAt: timestamp("reviewed_at", { mode: "date" }),
    reviewedByUserId: text("reviewed_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    sourceDerivationId: uuid("source_derivation_id").references(() => derivations.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("client_references_workspace_id_idx").on(table.workspaceId),
    index("client_references_client_profile_id_idx").on(table.clientProfileId),
    index("client_references_training_lookup_idx").on(
      table.workspaceId,
      table.clientProfileId,
      table.reviewStatus,
    ),
  ]
);

export const brandKnowledgeClaims = adscaleSchema.table(
  "brand_knowledge_claims",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    clientProfileId: uuid("client_profile_id").notNull().references(() => clientProfiles.id, { onDelete: "cascade" }),
    claimKey: text("claim_key").notNull().$type<import("../brand-knowledge/contracts").BrandKnowledgeClaimKey>(),
    kind: text("kind").notNull().$type<"fact" | "rule" | "preference" | "prohibition">(),
    value: jsonb("value").notNull(),
    scope: jsonb("scope").notNull().$type<{ level: "global"; format?: "1:1" | "4:5" | "9:16"; channel?: string }>(),
    authority: text("authority").notNull().$type<"human" | "explicit" | "measured" | "inferred">(),
    confidence: text("confidence").notNull().$type<"low" | "medium" | "high">(),
    status: text("status").notNull().default("candidate").$type<import("../brand-knowledge/contracts").BrandKnowledgeClaimStatus>(),
    evidenceRefs: jsonb("evidence_refs").notNull().$type<import("../brand-knowledge/contracts").BrandKnowledgeClaimInput["evidenceRefs"]>(),
    extractorVersion: text("extractor_version").notNull(),
    sourceHash: text("source_hash").notNull(),
    reviewDecision: jsonb("review_decision").$type<{
      action: "approved" | "rejected";
      alternatives: Array<{ claimId: string; value: unknown }>;
      evidenceRefs: import("../brand-knowledge/contracts").BrandKnowledgeClaimInput["evidenceRefs"];
    }>(),
    reviewedAt: timestamp("reviewed_at", { mode: "date" }),
    reviewedByUserId: text("reviewed_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("brand_knowledge_claims_source_uq").on(table.workspaceId, table.clientProfileId, table.claimKey, table.sourceHash),
    index("brand_knowledge_claims_scope_idx").on(table.workspaceId, table.clientProfileId, table.status),
    check("brand_knowledge_claims_status_check", sql`${table.status} in ('candidate','approved','rejected','superseded')`),
  ],
);

export const brandKnowledgeVersions = adscaleSchema.table(
  "brand_knowledge_versions",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    clientProfileId: uuid("client_profile_id").notNull().references(() => clientProfiles.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    hash: text("hash").notNull(),
    status: text("status").notNull().default("active").$type<"active" | "superseded">(),
    snapshot: jsonb("snapshot").notNull().$type<import("../brand-knowledge/version-compiler").BrandKnowledgeVersionSnapshot>(),
    publishedByUserId: text("published_by_user_id").notNull().references(() => user.id, { onDelete: "restrict" }),
    publishedAt: timestamp("published_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("brand_knowledge_versions_number_uq").on(table.workspaceId, table.clientProfileId, table.versionNumber),
    uniqueIndex("brand_knowledge_versions_hash_uq").on(table.workspaceId, table.clientProfileId, table.hash),
    uniqueIndex("brand_knowledge_versions_active_uq").on(table.workspaceId, table.clientProfileId).where(sql`${table.status} = 'active'`),
    index("brand_knowledge_versions_history_idx").on(table.workspaceId, table.clientProfileId, table.publishedAt),
    check("brand_knowledge_versions_status_check", sql`${table.status} in ('active','superseded')`),
  ],
);

export const brandTrainingSessions = adscaleSchema.table(
  "brand_training_sessions",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    clientProfileId: uuid("client_profile_id").notNull().references(() => clientProfiles.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").notNull().references(() => user.id, { onDelete: "restrict" }),
    baseVersionId: uuid("base_version_id").references(() => brandKnowledgeVersions.id, { onDelete: "set null" }),
    revision: integer("revision").notNull().default(0),
    status: text("status").notNull().default("review").$type<import("../brand-training/calibration").TrainingSessionStatus>(),
    candidate: jsonb("candidate").notNull().$type<import("../brand-training/calibration").Candidate>(),
    rounds: jsonb("rounds").notNull().default([]).$type<import("../brand-training/calibration").CalibrationRound[]>(),
    extensionCount: integer("extension_count").notNull().default(0),
    activatedVersionId: uuid("activated_version_id").references(() => brandKnowledgeVersions.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("brand_training_sessions_scope_idx").on(table.workspaceId, table.clientProfileId),
    uniqueIndex("brand_training_sessions_open_uq").on(table.workspaceId, table.clientProfileId).where(sql`${table.status} not in ('archived','activated')`),
    check("brand_training_sessions_status_check", sql`${table.status} in ('review','calibrating','pending','activated','archived')`),
  ],
);

export type TrainingSession = typeof brandTrainingSessions.$inferSelect;
export type NewTrainingSession = typeof brandTrainingSessions.$inferInsert;

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
  (table) => [
    index("campaign_templates_workspace_id_idx").on(table.workspaceId),
    index("campaign_templates_catalog_cursor_idx").on(table.workspaceId, table.updatedAt, table.id),
  ]
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
    index("workspace_assets_catalog_cursor_idx").on(table.source, table.createdAt, table.id),
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
    olharVerdict: jsonb("olhar_verdict").$type<
      import("../ai/olhar/dual-verdict").OlharVerdictPayload
    >(),
    exportStatus: jsonb("export_status").$type<
      import("../ai/olhar/dual-verdict").ExportStatusPayload
    >(),
    candidates: jsonb("candidates").$type<
      Array<{
        provider: "openai" | "seedream";
        model: string;
        outputKey: string;
        durationMs: number;
        score?: number;
        quality?: "invalid" | "improvable" | "acceptable";
        costCredits?: number;
        rawRequestId?: string;
        winner: boolean;
      }>
    >(),
    creativeLevel: text("creative_level"),
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
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    derivationIds: text("derivation_ids").array().notNull(),
    creativeWorkId: uuid("creative_work_id"),
    outputId: uuid("output_id"),
    outputVersion: integer("output_version"),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { mode: "date" }),
  },
  (table) => [
    index("share_links_token_idx").on(table.token),
    index("share_links_campaign_id_idx").on(table.campaignId),
    index("share_links_workspace_id_idx").on(table.workspaceId),
    uniqueIndex("share_links_active_output_uq")
      .on(table.outputId)
      .where(sql`${table.revokedAt} is null and ${table.outputId} is not null`),
    check(
      "share_links_package_check",
      sql`(
        (${table.campaignId} is not null and ${table.creativeWorkId} is null and ${table.outputId} is null)
        or
        (${table.campaignId} is null and ${table.creativeWorkId} is not null and ${table.outputId} is not null and ${table.outputVersion} is not null)
      )`,
    ),
  ]
);

export type ShareLink = typeof shareLinks.$inferSelect;
export type NewShareLink = typeof shareLinks.$inferInsert;

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

// ============================================
// Output learning tables
// ============================================

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

export const calibrationSignals = adscaleSchema.table(
  "calibration_signals",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientProfileId: uuid("client_profile_id").references(() => clientProfiles.id, {
      onDelete: "set null",
    }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    derivationId: uuid("derivation_id")
      .notNull()
      .references(() => derivations.id, { onDelete: "cascade" }),
    outputDecisionEventId: uuid("output_decision_event_id").references(
      () => outputDecisionEvents.id,
      { onDelete: "set null" }
    ),
    humanVerdict: text("human_verdict").notNull(),
    systemOlharVerdict: text("system_olhar_verdict"),
    systemExportStatus: text("system_export_status"),
    mismatchBucket: text("mismatch_bucket"),
    sourceLabel: text("source_label").notNull(),
    reviewerId: text("reviewer_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    reviewedAt: timestamp("reviewed_at", { mode: "date" }).notNull(),
    sanitizedNote: text("sanitized_note"),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("calibration_signals_idempotency_uq")
      .on(table.workspaceId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    index("calibration_signals_client_profile_idx").on(
      table.workspaceId,
      table.clientProfileId,
      table.reviewedAt
    ),
    index("calibration_signals_derivation_idx").on(
      table.workspaceId,
      table.derivationId
    ),
  ]
);

export type CalibrationSignal = typeof calibrationSignals.$inferSelect;
export type NewCalibrationSignal = typeof calibrationSignals.$inferInsert;

export const calibrationRules = adscaleSchema.table(
  "calibration_rules",
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
    category: text("category").notNull(),
    status: text("status").notNull().default("candidate"),
    rationale: text("rationale").notNull(),
    supportingSignalIds: jsonb("supporting_signal_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    confidence: text("confidence").notNull().default("low"),
    caveats: jsonb("caveats")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    mismatchBucket: text("mismatch_bucket"),
    version: integer("version").notNull().default(1),
    approvedAt: timestamp("approved_at", { mode: "date" }),
    approvedBy: text("approved_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("calibration_rules_client_status_idx").on(
      table.workspaceId,
      table.clientProfileId,
      table.status
    ),
  ]
);

export type CalibrationRule = typeof calibrationRules.$inferSelect;
export type NewCalibrationRule = typeof calibrationRules.$inferInsert;

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
    autoPromoted: boolean("auto_promoted").notNull().default(false),
    selectedByUserId: text("selected_by_user_id").references(() => user.id, {
      onDelete: "cascade",
    }),
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

export const humanQualityCorpusCandidates = adscaleSchema.table(
  "human_quality_corpus_candidates",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientProfileId: uuid("client_profile_id").references(() => clientProfiles.id, {
      onDelete: "set null",
    }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    derivationId: uuid("derivation_id")
      .notNull()
      .references(() => derivations.id, { onDelete: "cascade" }),
    generationMode: text("generation_mode").notNull(),
    format: text("format").notNull().default(""),
    corpusVersion: integer("corpus_version").notNull().default(1),
    sourceLabel: text("source_label").notNull(),
    artifactRef: jsonb("artifact_ref")
      .$type<import("../human-quality/corpus").HumanQualityArtifactRef>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    qualitySnapshot: jsonb("quality_snapshot")
      .$type<import("../human-quality/corpus").HumanQualityQualitySnapshot>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    promotedCorpusItemId: uuid("promoted_corpus_item_id").references(
      () => humanQualityCorpusItems.id,
      { onDelete: "set null" }
    ),
    promotedAt: timestamp("promoted_at", { mode: "date" }),
    capturedAt: timestamp("captured_at", { mode: "date" }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("human_quality_corpus_candidates_derivation_version_uq").on(
      table.workspaceId,
      table.derivationId,
      table.corpusVersion
    ),
    index("human_quality_corpus_candidates_workspace_source_idx").on(
      table.workspaceId,
      table.sourceLabel,
      table.capturedAt
    ),
    index("human_quality_corpus_candidates_promoted_idx").on(table.promotedCorpusItemId),
    check(
      "human_quality_corpus_candidates_source_label_check",
      sql`${table.sourceLabel} in ('synthetic_fixture', 'operator_imported', 'real_customer')`
    ),
  ]
);

export type HumanQualityCorpusCandidate = typeof humanQualityCorpusCandidates.$inferSelect;
export type NewHumanQualityCorpusCandidate = typeof humanQualityCorpusCandidates.$inferInsert;

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

export const humanQualityFeedbackArtifacts = adscaleSchema.table(
  "human_quality_feedback_artifacts",
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
    evaluationId: uuid("evaluation_id")
      .notNull()
      .references(() => humanQualityEvaluations.id, { onDelete: "cascade" }),
    derivationId: uuid("derivation_id")
      .notNull()
      .references(() => derivations.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    clientProfileId: uuid("client_profile_id")
      .notNull()
      .references(() => clientProfiles.id, { onDelete: "cascade" }),
    sourceLabel: text("source_label").notNull(),
    cohort: text("cohort").notNull(),
    generationMode: text("generation_mode").notNull(),
    format: text("format").notNull().default(""),
    payload: jsonb("payload")
      .$type<import("../human-quality/feedback-artifact").HumanQualityFeedbackArtifactPayload>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("human_quality_feedback_artifacts_corpus_item_uq").on(table.corpusItemId),
    uniqueIndex("human_quality_feedback_artifacts_evaluation_uq").on(table.evaluationId),
    index("human_quality_feedback_artifacts_workspace_source_idx").on(
      table.workspaceId,
      table.sourceLabel,
      table.createdAt
    ),
    check(
      "human_quality_feedback_artifacts_source_label_check",
      sql`${table.sourceLabel} in ('synthetic_fixture', 'operator_imported', 'real_customer')`
    ),
  ]
);

export type HumanQualityFeedbackArtifact = typeof humanQualityFeedbackArtifacts.$inferSelect;
export type NewHumanQualityFeedbackArtifact = typeof humanQualityFeedbackArtifacts.$inferInsert;

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
    rejectedReason: text("rejected_reason"),
    rejectedAt: timestamp("rejected_at", { mode: "date" }),
    rejectedBy: text("rejected_by").references(() => user.id, { onDelete: "set null" }),
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
      sql`${table.status} in ('proposed', 'accepted', 'superseded', 'rejected')`
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

export const clientLearningProposals = adscaleSchema.table(
  "client_learning_proposals",
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
    sliceKey: text("slice_key").notNull(),
    primaryFailureReason: text("primary_failure_reason").notNull(),
    status: text("status").notNull().default("proposed"),
    evidenceRefs: jsonb("evidence_refs")
      .$type<import("../human-quality/calibration/types").ClientLearningProposalEvidence>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    rationale: text("rationale").notNull(),
    proposedAt: timestamp("proposed_at", { mode: "date" }).notNull().defaultNow(),
    acceptedAt: timestamp("accepted_at", { mode: "date" }),
    acceptedBy: text("accepted_by").references(() => user.id, { onDelete: "set null" }),
    rejectedReason: text("rejected_reason"),
    cooldownUntil: timestamp("cooldown_until", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("client_learning_proposals_active_slice_uq")
      .on(table.workspaceId, table.clientProfileId, table.sliceKey)
      .where(sql`${table.status} = 'proposed'`),
    check(
      "client_learning_proposals_status_check",
      sql`${table.status} in ('proposed', 'accepted', 'rejected')`
    ),
  ]
);

export type ClientLearningProposal = typeof clientLearningProposals.$inferSelect;
export type NewClientLearningProposal = typeof clientLearningProposals.$inferInsert;

export type OlharVoiceReviewStatus = "pending_review" | "approved" | "changes_requested";

export type OlharVoiceConfigPayload = {
  principles: string[];
  positiveSignals: string[];
  negativeSignals: string[];
  authorityAndClaims: string[];
  inviteRhythm: string[];
  correctButSoulless: string[];
  matchTerms?: string[];
};

export const clientProfileOlharConfig = adscaleSchema.table(
  "client_profile_olhar_config",
  {
    clientProfileId: uuid("client_profile_id")
      .primaryKey()
      .references(() => clientProfiles.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    voiceId: text("voice_id").notNull(),
    displayName: text("display_name").notNull(),
    config: jsonb("config").$type<OlharVoiceConfigPayload>().notNull(),
    reviewStatus: text("review_status").$type<OlharVoiceReviewStatus>().notNull(),
    source: text("source").notNull().default("seeded"),
    approvedAt: timestamp("approved_at", { mode: "date" }),
    approvedBy: text("approved_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("client_profile_olhar_config_workspace_profile_uq").on(
      table.workspaceId,
      table.clientProfileId
    ),
    check(
      "client_profile_olhar_config_review_status_check",
      sql`${table.reviewStatus} in ('pending_review', 'approved', 'changes_requested')`
    ),
  ]
);

export type ClientProfileOlharConfig = typeof clientProfileOlharConfig.$inferSelect;
export type NewClientProfileOlharConfig = typeof clientProfileOlharConfig.$inferInsert;

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

// ============================================
// Assistant conversation persistence (Phase 178)
// ============================================

export const assistantThreads = adscaleSchema.table(
  "assistant_threads",
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
    campaignId: uuid("campaign_id").references(() => campaigns.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    migratedFromThreadId: uuid("migrated_from_thread_id"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("assistant_threads_workspace_id_idx").on(table.workspaceId),
    index("assistant_threads_client_profile_id_idx").on(table.clientProfileId),
    index("assistant_threads_campaign_id_idx").on(table.campaignId),
    uniqueIndex("assistant_threads_campaign_default_uidx")
      .on(table.workspaceId, table.campaignId)
      .where(sql`${table.isDefault} = true AND ${table.campaignId} IS NOT NULL`),
    foreignKey({
      columns: [table.migratedFromThreadId],
      foreignColumns: [table.id],
      name: "assistant_threads_migrated_from_fk",
    }).onDelete("set null"),
  ]
);

export const assistantMessages = adscaleSchema.table(
  "assistant_messages",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => assistantThreads.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    type: text("type").notNull(),
    content: text("content").notNull(),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    actionRecordId: uuid("action_record_id"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("assistant_messages_thread_sequence_idx").on(table.threadId, table.sequence),
    index("assistant_messages_workspace_id_idx").on(table.workspaceId),
  ]
);

export const assistantActionRecords = adscaleSchema.table(
  "assistant_action_records",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => assistantThreads.id, { onDelete: "cascade" }),
    messageId: uuid("message_id")
      .notNull()
      .references(() => assistantMessages.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    inputSnapshot: jsonb("input_snapshot")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    jobRefs: jsonb("job_refs")
      .$type<Array<{ kind: string; id: string }>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    safeError: text("safe_error"),
    sourceFlowRevision: integer("source_flow_revision"),
    sourceSnapshotDigest: text("source_snapshot_digest"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("assistant_action_records_workspace_id_idx").on(table.workspaceId),
    index("assistant_action_records_thread_status_idx").on(
      table.threadId,
      table.status
    ),
    index("assistant_action_records_flow_binding_idx").on(
      table.threadId,
      table.sourceFlowRevision
    ),
  ]
);

export const assistantGuidedFlows = adscaleSchema.table(
  "assistant_guided_flows",
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
    threadId: uuid("thread_id")
      .notNull()
      .references(() => assistantThreads.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    status: text("status").notNull(),
    currentStep: text("current_step").notNull(),
    slots: jsonb("slots")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    missingFields: jsonb("missing_fields")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    assetIds: jsonb("asset_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    referenceIds: jsonb("reference_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    campaignId: uuid("campaign_id").references(() => campaigns.id, {
      onDelete: "set null",
    }),
    revision: integer("revision").notNull().default(0),
    schemaVersion: integer("schema_version").notNull().default(1),
    recoverableError: jsonb("recoverable_error").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("assistant_guided_flows_thread_id_uidx").on(table.threadId),
    index("assistant_guided_flows_workspace_id_idx").on(table.workspaceId),
  ]
);

export const assistantGuidedFlowTransitions = adscaleSchema.table(
  "assistant_guided_flow_transitions",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    guidedFlowId: uuid("guided_flow_id")
      .notNull()
      .references(() => assistantGuidedFlows.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    commandId: text("command_id").notNull(),
    commandType: text("command_type").notNull(),
    expectedRevision: integer("expected_revision").notNull(),
    resultRevision: integer("result_revision").notNull(),
    previousStep: text("previous_step"),
    nextStep: text("next_step"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("assistant_guided_flow_transitions_flow_command_uidx").on(
      table.guidedFlowId,
      table.commandId
    ),
    index("assistant_guided_flow_transitions_guided_flow_created_idx").on(
      table.guidedFlowId,
      table.createdAt
    ),
  ]
);

// ============================================
// Assistant artifact versioning (Phase 203)
// ============================================

export const assistantArtifactLineages = adscaleSchema.table(
  "assistant_artifact_lineages",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    artifactType: text("artifact_type").notNull(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    clientProfileId: uuid("client_profile_id").notNull().references(() => clientProfiles.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id").notNull().references(() => assistantThreads.id, { onDelete: "cascade" }),
    originalArtifactId: uuid("original_artifact_id").notNull(),
    origin: text("origin").notNull(),
    formatKey: text("format_key"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("assistant_artifact_lineages_source_uidx").on(table.artifactType, table.originalArtifactId),
    index("assistant_artifact_lineages_scope_idx").on(table.workspaceId, table.clientProfileId, table.campaignId, table.threadId),
  ]
);

export const assistantArtifactVersions = adscaleSchema.table(
  "assistant_artifact_versions",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    lineageId: uuid("lineage_id").notNull().references(() => assistantArtifactLineages.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    clientProfileId: uuid("client_profile_id").notNull().references(() => clientProfiles.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id").notNull().references(() => assistantThreads.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    sourceVersionId: uuid("source_version_id"),
    status: text("status").notNull().default("ready"),
    snapshot: jsonb("snapshot").$type<import("../../lib/assistant/artifact-version").ArtifactVersionSnapshot>().notNull(),
    provenance: jsonb("provenance").$type<import("../../lib/assistant/artifact-version").ArtifactVersionProvenance>().notNull(),
    feedback: text("feedback"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("assistant_artifact_versions_lineage_number_uidx").on(table.lineageId, table.versionNumber),
    index("assistant_artifact_versions_scope_idx").on(table.workspaceId, table.clientProfileId, table.campaignId, table.threadId),
    index("assistant_artifact_versions_lineage_created_idx").on(table.lineageId, table.createdAt),
    foreignKey({ columns: [table.sourceVersionId], foreignColumns: [table.id], name: "assistant_artifact_versions_source_fk" }).onDelete("restrict"),
  ]
);

export const assistantArtifactLineageHeads = adscaleSchema.table(
  "assistant_artifact_lineage_heads",
  {
    lineageId: uuid("lineage_id").primaryKey().references(() => assistantArtifactLineages.id, { onDelete: "cascade" }),
    approvedCurrentVersionId: uuid("approved_current_version_id").references(() => assistantArtifactVersions.id, { onDelete: "set null" }),
    workingVersionId: uuid("working_version_id").references(() => assistantArtifactVersions.id, { onDelete: "set null" }),
    revision: integer("revision").notNull().default(0),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  }
);

export const assistantArtifactApprovalEvents = adscaleSchema.table(
  "assistant_artifact_approval_events",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    operationId: uuid("operation_id").notNull(),
    artifactType: text("artifact_type").notNull(),
    lineageId: uuid("lineage_id").notNull().references(() => assistantArtifactLineages.id, { onDelete: "cascade" }),
    promotedVersionId: uuid("promoted_version_id").notNull().references(() => assistantArtifactVersions.id, { onDelete: "restrict" }),
    previousOfficialVersionId: uuid("previous_official_version_id").references(() => assistantArtifactVersions.id, { onDelete: "restrict" }),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    clientProfileId: uuid("client_profile_id").notNull().references(() => clientProfiles.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id").notNull().references(() => assistantThreads.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("assistant_artifact_approval_events_operation_lineage_uidx").on(table.operationId, table.lineageId),
    index("assistant_artifact_approval_events_scope_idx").on(table.workspaceId, table.clientProfileId, table.campaignId, table.threadId),
    index("assistant_artifact_approval_events_lineage_created_idx").on(table.lineageId, table.createdAt),
  ]
);

export const assistantArtifactComparisonAcknowledgements = adscaleSchema.table(
  "assistant_artifact_comparison_acknowledgements",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    creativeTargetVersionId: uuid("creative_target_version_id").notNull().references(() => assistantArtifactVersions.id, { onDelete: "cascade" }),
    planLineageId: uuid("plan_lineage_id").notNull().references(() => assistantArtifactLineages.id, { onDelete: "cascade" }),
    linkedPlanVersionId: uuid("linked_plan_version_id").notNull().references(() => assistantArtifactVersions.id, { onDelete: "cascade" }),
    comparedOfficialPlanVersionId: uuid("compared_official_plan_version_id").notNull().references(() => assistantArtifactVersions.id, { onDelete: "cascade" }),
    comparedPlanHeadRevision: integer("compared_plan_head_revision").notNull(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    clientProfileId: uuid("client_profile_id").notNull().references(() => clientProfiles.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id").notNull().references(() => assistantThreads.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("assistant_artifact_comparison_ack_scope_idx").on(table.workspaceId, table.clientProfileId, table.campaignId, table.threadId),
    index("assistant_artifact_comparison_ack_plan_created_idx").on(table.planLineageId, table.createdAt),
  ]
);

export const assistantPlanFeedbackDrafts = adscaleSchema.table(
  "assistant_plan_feedback_drafts",
  {
    threadId: uuid("thread_id")
      .primaryKey()
      .references(() => assistantThreads.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientProfileId: uuid("client_profile_id")
      .notNull()
      .references(() => clientProfiles.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    draftText: text("draft_text").notNull().default(""),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("assistant_plan_feedback_drafts_scope_idx").on(
      table.workspaceId,
      table.clientProfileId,
      table.campaignId,
      table.threadId
    ),
  ]
);

export const assistantCreativeFeedbackDrafts = adscaleSchema.table(
  "assistant_creative_feedback_drafts",
  {
    threadId: uuid("thread_id")
      .primaryKey()
      .references(() => assistantThreads.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientProfileId: uuid("client_profile_id")
      .notNull()
      .references(() => clientProfiles.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    draftText: text("draft_text").notNull().default(""),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("assistant_creative_feedback_drafts_scope_idx").on(
      table.workspaceId,
      table.clientProfileId,
      table.campaignId,
      table.threadId
    ),
  ]
);

export const assistantArtifactProposals = adscaleSchema.table(
  "assistant_artifact_proposals",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    lineageId: uuid("lineage_id").notNull().references(() => assistantArtifactLineages.id, { onDelete: "cascade" }),
    sourceVersionId: uuid("source_version_id").notNull().references(() => assistantArtifactVersions.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    clientProfileId: uuid("client_profile_id").notNull().references(() => clientProfiles.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id").notNull().references(() => assistantThreads.id, { onDelete: "cascade" }),
    proposalType: text("proposal_type").notNull(),
    status: text("status").notNull().default("pending"),
    payload: jsonb("payload").$type<import("../../lib/assistant/artifact-version").ArtifactProposalPayload>().notNull(),
    feedback: text("feedback"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("assistant_artifact_proposals_scope_idx").on(table.workspaceId, table.clientProfileId, table.campaignId, table.threadId),
    index("assistant_artifact_proposals_lineage_created_idx").on(table.lineageId, table.createdAt),
    check("assistant_artifact_proposals_status_check", sql`${table.status} in ('pending', 'stale', 'confirmed', 'canceled')`),
  ]
);

export const assistantGuidedFlowEvents = adscaleSchema.table(
  "assistant_guided_flow_events",
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
    threadId: uuid("thread_id")
      .notNull()
      .references(() => assistantThreads.id, { onDelete: "cascade" }),
    guidedFlowId: uuid("guided_flow_id").references(() => assistantGuidedFlows.id, {
      onDelete: "set null",
    }),
    path: text("path").notNull(),
    step: text("step").notNull(),
    eventKey: text("event_key").notNull(),
    blockerCategory: text("blocker_category"),
    actionRecordId: uuid("action_record_id").references(
      () => assistantActionRecords.id,
      { onDelete: "set null" }
    ),
    campaignId: uuid("campaign_id").references(() => campaigns.id, {
      onDelete: "set null",
    }),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    occurredAt: timestamp("occurred_at", { mode: "date" }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("assistant_guided_flow_events_workspace_occurred_idx").on(
      table.workspaceId,
      table.occurredAt
    ),
    index("assistant_guided_flow_events_workspace_client_path_occurred_idx").on(
      table.workspaceId,
      table.clientProfileId,
      table.path,
      table.occurredAt
    ),
    index("assistant_guided_flow_events_thread_occurred_idx").on(
      table.threadId,
      table.occurredAt
    ),
    index("assistant_guided_flow_events_guided_flow_occurred_idx").on(
      table.guidedFlowId,
      table.occurredAt
    ),
  ]
);

export type AssistantThread = typeof assistantThreads.$inferSelect;
export type NewAssistantThread = typeof assistantThreads.$inferInsert;
export type AssistantMessage = typeof assistantMessages.$inferSelect;
export type NewAssistantMessage = typeof assistantMessages.$inferInsert;
export type AssistantActionRecord = typeof assistantActionRecords.$inferSelect;
export type NewAssistantActionRecord = typeof assistantActionRecords.$inferInsert;
export type AssistantGuidedFlow = typeof assistantGuidedFlows.$inferSelect;
export type NewAssistantGuidedFlow = typeof assistantGuidedFlows.$inferInsert;
export type AssistantGuidedFlowTransition =
  typeof assistantGuidedFlowTransitions.$inferSelect;
export type NewAssistantGuidedFlowTransition =
  typeof assistantGuidedFlowTransitions.$inferInsert;
export type AssistantGuidedFlowEvent = typeof assistantGuidedFlowEvents.$inferSelect;
export type NewAssistantGuidedFlowEvent = typeof assistantGuidedFlowEvents.$inferInsert;

export const assistantArtifactIterationEvents = adscaleSchema.table(
  "assistant_artifact_iteration_events",
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
    threadId: uuid("thread_id")
      .notNull()
      .references(() => assistantThreads.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, {
      onDelete: "set null",
    }),
    actionRecordId: uuid("action_record_id").references(
      () => assistantActionRecords.id,
      { onDelete: "set null" }
    ),
    path: text("path").notNull(),
    step: text("step").notNull(),
    eventKey: text("event_key").notNull(),
    reasonCode: text("reason_code"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    occurredAt: timestamp("occurred_at", { mode: "date" }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("assistant_artifact_iteration_events_workspace_occurred_idx").on(
      table.workspaceId,
      table.occurredAt
    ),
    index("assistant_artifact_iteration_events_workspace_client_path_occurred_idx").on(
      table.workspaceId,
      table.clientProfileId,
      table.path,
      table.occurredAt
    ),
    index("assistant_artifact_iteration_events_thread_occurred_idx").on(
      table.threadId,
      table.occurredAt
    ),
    index("assistant_artifact_iteration_events_action_record_occurred_idx").on(
      table.actionRecordId,
      table.occurredAt
    ),
  ]
);

export type AssistantArtifactIterationEvent =
  typeof assistantArtifactIterationEvents.$inferSelect;
export type NewAssistantArtifactIterationEvent =
  typeof assistantArtifactIterationEvents.$inferInsert;

export const assistantGuidedFlowStagingEvidence = adscaleSchema.table(
  "assistant_guided_flow_staging_evidence",
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
    threadId: uuid("thread_id")
      .notNull()
      .references(() => assistantThreads.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, {
      onDelete: "set null",
    }),
    path: text("path").notNull(),
    environment: text("environment").notNull(),
    reviewerUserId: text("reviewer_user_id").notNull(),
    checkKey: text("check_key").notNull(),
    verdict: text("verdict").notNull(),
    safeNotes: text("safe_notes"),
    referenceCounts: jsonb("reference_counts")
      .$type<Record<string, number>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("assistant_guided_flow_staging_evidence_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt
    ),
  ]
);

export const assistantGuidedFlowFeedback = adscaleSchema.table(
  "assistant_guided_flow_feedback",
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
    threadId: uuid("thread_id")
      .notNull()
      .references(() => assistantThreads.id, { onDelete: "cascade" }),
    guidedFlowId: uuid("guided_flow_id").references(() => assistantGuidedFlows.id, {
      onDelete: "set null",
    }),
    path: text("path").notNull(),
    step: text("step").notNull(),
    feedbackKind: text("feedback_kind").notNull(),
    rating: text("rating").notNull(),
    reasonText: text("reason_text"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("assistant_guided_flow_feedback_thread_created_idx").on(
      table.threadId,
      table.createdAt
    ),
  ]
);

export type AssistantGuidedFlowStagingEvidence =
  typeof assistantGuidedFlowStagingEvidence.$inferSelect;
export type NewAssistantGuidedFlowStagingEvidence =
  typeof assistantGuidedFlowStagingEvidence.$inferInsert;
export type AssistantGuidedFlowFeedback = typeof assistantGuidedFlowFeedback.$inferSelect;
export type NewAssistantGuidedFlowFeedback = typeof assistantGuidedFlowFeedback.$inferInsert;

export type PersonaSimulation = typeof personaSimulations.$inferSelect;
export type NewPersonaSimulation = typeof personaSimulations.$inferInsert;

// ============================================
// Goal-oriented creative agent (pilot)
// ============================================

export const assistantGoalRuns = adscaleSchema.table(
  "assistant_goal_runs",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientProfileId: uuid("client_profile_id")
      .notNull()
      .references(() => clientProfiles.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => assistantThreads.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, {
      onDelete: "set null",
    }),
    objective: text("objective").notNull().default(""),
    stage: text("stage").notNull().default("intake"),
    brief: jsonb("brief").$type<import("../../lib/assistant/goal").GoalBrief>().notNull().default(sql`'{}'::jsonb`),
    plan: jsonb("plan").$type<import("../../lib/assistant/goal").GoalPlan>().notNull().default(sql`'{}'::jsonb`),
    assumptions: jsonb("assumptions").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    blockers: jsonb("blockers").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    queuedInstruction: text("queued_instruction"),
    resumeStage: text("resume_stage"),
    selectedBaseVersionId: uuid("selected_base_version_id").references(
      () => assistantArtifactVersions.id,
      { onDelete: "set null" }
    ),
    revision: integer("revision").notNull().default(0),
    startedByUserId: text("started_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    completedAt: timestamp("completed_at", { mode: "date" }),
    stoppedAt: timestamp("stopped_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("assistant_goal_runs_thread_uq").on(table.threadId),
    index("assistant_goal_runs_scope_idx").on(
      table.workspaceId,
      table.clientProfileId,
      table.threadId
    ),
    index("assistant_goal_runs_stage_updated_idx").on(table.stage, table.updatedAt),
    check(
      "assistant_goal_runs_stage_check",
      sql`${table.stage} in ('intake','planning','awaiting_generation','generating_variants','choosing_base','reviewing_base','awaiting_package','generating_package','reviewing_package','completed','stopped','failed')`
    ),
  ]
);

export type AssistantGoalRun = typeof assistantGoalRuns.$inferSelect;
export type NewAssistantGoalRun = typeof assistantGoalRuns.$inferInsert;

export const assistantArtifactAnnotations = adscaleSchema.table(
  "assistant_artifact_annotations",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientProfileId: uuid("client_profile_id")
      .notNull()
      .references(() => clientProfiles.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => assistantThreads.id, { onDelete: "cascade" }),
    goalRunId: uuid("goal_run_id")
      .notNull()
      .references(() => assistantGoalRuns.id, { onDelete: "cascade" }),
    versionId: uuid("version_id")
      .notNull()
      .references(() => assistantArtifactVersions.id, { onDelete: "cascade" }),
    actionRecordId: uuid("action_record_id").references(
      () => assistantActionRecords.id,
      { onDelete: "set null" }
    ),
    addressedByVersionId: uuid("addressed_by_version_id").references(
      () => assistantArtifactVersions.id,
      { onDelete: "set null" }
    ),
    x: real("x").notNull(),
    y: real("y").notNull(),
    width: real("width").notNull(),
    height: real("height").notNull(),
    comment: text("comment").notNull(),
    status: text("status").notNull().default("draft"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("assistant_artifact_annotations_version_status_idx").on(
      table.versionId,
      table.status,
      table.createdAt
    ),
    check(
      "assistant_artifact_annotations_rect_check",
      sql`${table.x} >= 0 AND ${table.x} <= 1 AND ${table.y} >= 0 AND ${table.y} <= 1 AND ${table.width} > 0 AND ${table.width} <= 1 AND ${table.height} > 0 AND ${table.height} <= 1 AND ${table.x} + ${table.width} <= 1 AND ${table.y} + ${table.height} <= 1`
    ),
    check(
      "assistant_artifact_annotations_status_check",
      sql`${table.status} in ('draft','submitted','addressed')`
    ),
  ]
);

export type AssistantArtifactAnnotation =
  typeof assistantArtifactAnnotations.$inferSelect;
export type NewAssistantArtifactAnnotation =
  typeof assistantArtifactAnnotations.$inferInsert;

export const clientCorpusConsents = adscaleSchema.table(
  "client_corpus_consents",
  {
    clientProfileId: uuid("client_profile_id")
      .primaryKey()
      .references(() => clientProfiles.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    reviewedByUserId: text("reviewed_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    grantedAt: timestamp("granted_at", { mode: "date" }),
    revokedAt: timestamp("revoked_at", { mode: "date" }),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "client_corpus_consents_status_check",
      sql`${table.status} in ('granted','revoked')`
    ),
  ]
);

export type ClientCorpusConsent = typeof clientCorpusConsents.$inferSelect;
export type NewClientCorpusConsent = typeof clientCorpusConsents.$inferInsert;

// ============================================
// Standalone creative work (Create Post aggregate)
// ============================================

export const creativeWorkItems = adscaleSchema.table(
  "creative_work_items",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    generationCorrelationId: uuid("generation_correlation_id")
      .notNull()
      .defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientProfileId: uuid("client_profile_id")
      .notNull()
      .references(() => clientProfiles.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    draftKey: text("draft_key"),
    title: text("title").notNull(),
    request: text("request").notNull(),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    toolKind: text("tool_kind")
      .notNull()
      .$type<import("../creative-work/contracts").CreativeWorkIntent>(),
    status: text("status")
      .notNull()
      .default("draft")
      .$type<import("../creative-work/contracts").CreativeWorkStatus>(),
    /** Pedido teve ao menos um trecho inserido via Ditado (#351). */
    hasDictatedExcerpt: boolean("has_dictated_excerpt").notNull().default(false),
    brief: jsonb("brief")
      .$type<import("../creative-work/contracts").SocialPostBrief>(),
    format: text("format")
      .notNull()
      .default("4:5")
      .$type<"1:1" | "4:5" | "9:16">(),
    settings: jsonb("settings")
      .$type<import("../creative-work/contracts").CreativeWorkSettings>()
      .notNull(),
    inputSnapshot: jsonb("input_snapshot").$type<
      import("../creative-work/contracts").CreativeWorkInputSnapshot
    >(),
    copy: jsonb("copy").$type<import("../creative-work/contracts").SocialPostCopy>(),
    identitySnapshot: jsonb("identity_snapshot").$type<
      import("../creative-work/contracts").CreativeWorkIdentitySnapshot
    >(),
    trainingSessionId: uuid("training_session_id").references(() => brandTrainingSessions.id, { onDelete: "set null" }),
    trainingRound: integer("training_round"),
    trainingSlot: integer("training_slot"),
    carouselApprovedRevision: text("carousel_approved_revision"),
    carouselQuality: jsonb("carousel_quality").$type<
      import("../creative-work/carousel-contracts").CarouselDeckQualityV1 | null
    >(),
    /**
     * Automatic art-refinement summary (plan 04, T2): recommended output ids,
     * terminal status and open issues. Null on works without refinement.
     */
    artRefinementState: jsonb("art_refinement_state").$type<
      import("../creative-work/art-refinement").ArtRefinementState | null
    >(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("creative_work_items_scope_idx").on(
      table.workspaceId,
      table.clientProfileId,
      table.updatedAt
    ),
    uniqueIndex("creative_work_items_draft_key_uq")
      .on(table.workspaceId, table.createdByUserId, table.draftKey)
      .where(sql`${table.draftKey} is not null`),
    uniqueIndex("creative_work_items_id_workspace_uq").on(table.id, table.workspaceId),
    check(
      "creative_work_items_tool_kind_check",
      sql`${table.toolKind} in ('social_post','variations','single','format_adaptation','restyle')`
    ),
    check(
      "creative_work_items_status_check",
      sql`${table.status} in ('draft','ready','generating','partial','completed','failed')`
    ),
    check(
      "creative_work_items_format_check",
      sql`${table.format} in ('1:1','4:5','9:16')`
    ),
    uniqueIndex("creative_work_items_training_slot_uq")
      .on(table.trainingSessionId, table.trainingRound, table.trainingSlot)
      .where(sql`${table.trainingSessionId} is not null`),
    check(
      "creative_work_items_training_link_check",
      sql`(${table.trainingSessionId} is null and ${table.trainingRound} is null and ${table.trainingSlot} is null) or (${table.trainingSessionId} is not null and ${table.trainingRound} is not null and ${table.trainingSlot} is not null)`
    ),
    check(
      "creative_work_items_training_round_check",
      sql`${table.trainingRound} is null or ${table.trainingRound} > 0`
    ),
    check(
      "creative_work_items_training_slot_range_check",
      sql`${table.trainingSlot} is null or (${table.trainingSlot} >= 0 and ${table.trainingSlot} <= 3)`
    ),
  ]
);

export type CreativeWorkItem = typeof creativeWorkItems.$inferSelect;
export type NewCreativeWorkItem = typeof creativeWorkItems.$inferInsert;

export const creativeWorkSources = adscaleSchema.table(
  "creative_work_sources",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    workItemId: uuid("work_item_id").notNull().references(() => creativeWorkItems.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id").references(() => workspaceAssets.id, { onDelete: "cascade" }),
    templateId: uuid("template_id").references(() => campaignTemplates.id, { onDelete: "cascade" }),
    usage: text("usage").notNull().$type<import("../creative-work/contracts").CreativeSourceUsage>(),
    usageConfirmed: boolean("usage_confirmed").notNull().default(false),
    status: text("status").notNull().$type<import("../creative-work/contracts").CreativeSourceStatus>(),
    contentAnalysis: jsonb("content_analysis").$type<import("../ai/image-analysis").ContentBrief>(),
    styleAnalysis: jsonb("style_analysis").$type<import("../ai/image-analysis").StyleBrief>(),
    pieceReference: jsonb("piece_reference").$type<import("../creative-work/piece-reference").PieceReferenceDraft>(),
    failureCode: text("failure_code"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("creative_work_sources_scope_idx").on(table.workspaceId, table.workItemId),
    uniqueIndex("creative_work_sources_asset_uq")
      .on(table.workItemId, table.assetId)
      .where(sql`${table.assetId} is not null`),
    uniqueIndex("creative_work_sources_template_uq")
      .on(table.workItemId, table.templateId)
      .where(sql`${table.templateId} is not null`),
    check("creative_work_sources_origin_check", sql`num_nonnulls(${table.assetId}, ${table.templateId}) = 1`),
    check("creative_work_sources_usage_check", sql`${table.usage} in ('content','style','both')`),
    check("creative_work_sources_status_check", sql`${table.status} in ('uploaded','analyzing','ready','failed')`),
  ],
);

export type CreativeWorkSource = typeof creativeWorkSources.$inferSelect;
export type NewCreativeWorkSource = typeof creativeWorkSources.$inferInsert;

/**
 * Obrigacao minima de dominio persistida junto com a selecao. Existe para que
 * um efeito "pending" tenha lastro: sem ela a resposta so poderia dizer
 * "failed". Nao e outbox generico — so o efeito que o usuario pediu.
 */
export type CreativeWorkSelectionEffectsState = {
  version: 1;
  recipe?: {
    receiptId: string;
    requestedAt: string;
    state: "pending" | "done" | "failed";
    code?: string;
  };
};

export const creativeWorkOutputs = adscaleSchema.table(
  "creative_work_outputs",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    generationCorrelationId: uuid("generation_correlation_id")
      .notNull()
      .defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    workItemId: uuid("work_item_id")
      .notNull()
      .references(() => creativeWorkItems.id, { onDelete: "cascade" }),
    creativeLevel: text("creative_level")
      .notNull()
      .$type<import("../creative-work/contracts").CreativeLevel>(),
    targetFormat: text("target_format").notNull().$type<"1:1" | "4:5" | "9:16">(),
    versionNumber: integer("version_number").notNull().default(1),
    parentOutputId: uuid("parent_output_id"),
    revisionInstruction: text("revision_instruction"),
    revisionAssetId: uuid("revision_asset_id").references(() => workspaceAssets.id, { onDelete: "set null" }),
    reviewDraft: jsonb("review_draft").$type<import("../creative-work/output-review").OutputReviewDraftV1 | null>(),
    revisionContext: jsonb("revision_context").$type<import("../creative-work/output-review").OutputRevisionContextV1 | null>(),
    // Financial/manual retry ordinal.  retryCount remains the technical job
    // retry counter and must not be used as a billing attempt identifier.
    manualRetryAttempt: integer("manual_retry_attempt"),
    retryCount: integer("retry_count").notNull().default(0),
    imageCallCount: integer("image_call_count").notNull().default(0),
    operationKey: text("operation_key").notNull(),
    status: text("status")
      .notNull()
      .default("queued")
      .$type<import("../creative-work/contracts").CreativeWorkOutputStatus>(),
    outputKey: text("output_key"),
    cost: integer("cost"),
    failureCode: text("failure_code"),
    quality: jsonb("quality"),
    layerization: jsonb("layerization").$type<import("../layerize/contracts").LayerizationState | null>(),
    layerEditor: jsonb("layer_editor").$type<import("../layer-editor/contracts").LayerEditorStateV1 | null>(),
    isSelected: boolean("is_selected").notNull().default(false),
    /** Quem selecionou: operador (Aprovação humana) ou agente (Seleção por agente, #355). Null = legado. */
    selectedBy: text("selected_by").$type<"operator" | "agent">(),
    selectionEffects: jsonb("selection_effects").$type<CreativeWorkSelectionEffectsState | null>(),
    directionId: uuid("direction_id"),
    directionSnapshot: jsonb("direction_snapshot").$type<{
      label: string;
      instruction: string;
      order: number;
      // Frozen from the direction (#123); absent on rows persisted before the band existed.
      safetyBand?: import("../creative-work/contracts").CreativeDirectionSafetyBand;
    }>(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    queuedAt: timestamp("queued_at", { mode: "date" }).notNull().defaultNow(),
    terminalAt: timestamp("terminal_at", { mode: "date" }),
    generationFirstTerminalAt: timestamp("generation_first_terminal_at", { mode: "date" }),
    generationCompletedAt: timestamp("generation_completed_at", { mode: "date" }),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("creative_work_outputs_direction_plan_uq")
      .on(
        table.workItemId,
        table.creativeLevel,
        table.targetFormat,
        table.versionNumber,
        table.directionId,
      )
      .where(sql`${table.directionId} is not null`),
    uniqueIndex("creative_work_outputs_legacy_plan_uq")
      .on(
        table.workItemId,
        table.creativeLevel,
        table.targetFormat,
        table.versionNumber,
      )
      .where(sql`${table.directionId} is null`),
    uniqueIndex("creative_work_outputs_operation_uq").on(table.workItemId, table.operationKey),
    uniqueIndex("creative_work_outputs_selected_uq")
      .on(table.workItemId)
      .where(sql`${table.isSelected} = true`),
    index("creative_work_outputs_scope_idx").on(
      table.workspaceId,
      table.workItemId,
      table.status
    ),
    index("creative_work_outputs_correlation_idx").on(
      table.workspaceId,
      table.generationCorrelationId,
      table.status,
    ),
    check(
      "creative_work_outputs_level_check",
      sql`${table.creativeLevel} in ('conservative','balanced','bold')`
    ),
    check(
      "creative_work_outputs_status_check",
      sql`${table.status} in ('queued','processing','completed','failed')`
    ),
    foreignKey({
      columns: [table.parentOutputId],
      foreignColumns: [table.id],
      name: "creative_work_outputs_parent_fk",
    }).onDelete("set null"),
  ]
);

export type CreativeWorkOutput = typeof creativeWorkOutputs.$inferSelect;
export type NewCreativeWorkOutput = typeof creativeWorkOutputs.$inferInsert;

export const pieceFavorites = adscaleSchema.table(
  "piece_favorites",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    outputId: uuid("output_id")
      .notNull()
      .references(() => creativeWorkOutputs.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("piece_favorites_user_output_uq").on(table.userId, table.outputId),
    index("piece_favorites_workspace_user_idx").on(table.workspaceId, table.userId, table.createdAt),
  ],
);

export type PieceFavorite = typeof pieceFavorites.$inferSelect;
export type NewPieceFavorite = typeof pieceFavorites.$inferInsert;

export const creativeWorkCarouselSlides = adscaleSchema.table(
  "creative_work_carousel_slides",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    workItemId: uuid("work_item_id").notNull(),
    lineageId: uuid("lineage_id").notNull(),
    parentSlideId: uuid("parent_slide_id"),
    versionNumber: integer("version_number").notNull(),
    deckRevision: text("deck_revision").notNull(),
    position: integer("position").notNull(),
    role: text("role")
      .notNull()
      .$type<import("../creative-work/carousel-contracts").CarouselNarrativeRole>(),
    primaryText: text("primary_text").notNull(),
    secondaryText: text("secondary_text"),
    copyAuthority: text("copy_authority")
      .notNull()
      .$type<import("../creative-work/carousel-contracts").CarouselCopyAuthority>(),
    sourceFactIds: jsonb("source_fact_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    layoutFamily: text("layout_family")
      .notNull()
      .$type<import("../creative-work/carousel-contracts").CarouselLayoutFamily>(),
    status: text("status")
      .notNull()
      .default("draft")
      .$type<import("../creative-work/carousel-contracts").CarouselSlideStatus>(),
    providerBaseKey: text("provider_base_key"),
    outputKey: text("output_key"),
    previewKey: text("preview_key"),
    visualContractHash: text("visual_contract_hash").notNull(),
    anchorKey: text("anchor_key"),
    generationOperationKey: text("generation_operation_key").notNull(),
    errorCode: text("error_code"),
    quality: jsonb("quality"),
    isCurrent: boolean("is_current").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    queuedAt: timestamp("queued_at", { mode: "date" }),
    terminalAt: timestamp("terminal_at", { mode: "date" }),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("creative_work_carousel_slides_scope_idx").on(
      table.workspaceId,
      table.workItemId
    ),
    uniqueIndex("creative_work_carousel_slides_current_uq")
      .on(table.workItemId, table.lineageId, table.position)
      .where(sql`${table.isCurrent} = true`),
    uniqueIndex("creative_work_carousel_slides_version_uq").on(
      table.workItemId,
      table.lineageId,
      table.versionNumber
    ),
    uniqueIndex("creative_work_carousel_slides_operation_uq").on(
      table.workItemId,
      table.generationOperationKey
    ),
    check(
      "creative_work_carousel_slides_status_check",
      sql`${table.status} in ('draft','queued','processing','completed','failed')`
    ),
    check(
      "creative_work_carousel_slides_role_check",
      sql`${table.role} in ('hook','context','problem','argument','evidence','method','bridge','closing','cta')`
    ),
    check(
      "creative_work_carousel_slides_copy_authority_check",
      sql`${table.copyAuthority} in ('user_input','ai_proposal','human_edit')`
    ),
    check(
      "creative_work_carousel_slides_layout_family_check",
      sql`${table.layoutFamily} in ('impact','development','respite')`
    ),
    check(
      "creative_work_carousel_slides_version_positive_check",
      sql`${table.versionNumber} > 0`
    ),
    check(
      "creative_work_carousel_slides_position_positive_check",
      sql`${table.position} > 0`
    ),
    check(
      "creative_work_carousel_slides_parent_self_check",
      sql`${table.parentSlideId} is null or ${table.parentSlideId} <> ${table.id}`
    ),
    foreignKey({
      name: "creative_work_carousel_slides_work_item_fk",
      columns: [table.workItemId, table.workspaceId],
      foreignColumns: [creativeWorkItems.id, creativeWorkItems.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "creative_work_carousel_slides_parent_fk",
      columns: [table.parentSlideId],
      foreignColumns: [table.id],
    }).onDelete("cascade"),
  ]
);

export type CreativeWorkCarouselSlide = typeof creativeWorkCarouselSlides.$inferSelect;
export type NewCreativeWorkCarouselSlide = typeof creativeWorkCarouselSlides.$inferInsert;

/**
 * Automatic art-refinement attempt claims (plan 04, T2/T4). One row per
 * root + attempt (1..2): the unique indexes — not application code — are
 * the authority that a root is never revised a third time. Output roots
 * use rootOutputId/parentOutputId; carousel slide roots use
 * rootSlideId/parentSlideId (exactly one root kind per row).
 */
export const creativeWorkRefinementAttempts = adscaleSchema.table(
  "creative_work_refinement_attempts",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    workItemId: uuid("work_item_id")
      .notNull()
      .references(() => creativeWorkItems.id, { onDelete: "cascade" }),
    rootOutputId: uuid("root_output_id"),
    parentOutputId: uuid("parent_output_id"),
    rootSlideId: uuid("root_slide_id"),
    parentSlideId: uuid("parent_slide_id"),
    attempt: integer("attempt").notNull(),
    revisionKey: text("revision_key").notNull(),
    status: text("status")
      .notNull()
      .default("claimed")
      .$type<"claimed" | "dispatched" | "completed" | "failed">(),
    unitCredits: integer("unit_credits").notNull().default(0),
    outputId: uuid("output_id").references(() => creativeWorkOutputs.id, { onDelete: "set null" }),
    slideId: uuid("slide_id").references(() => creativeWorkCarouselSlides.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("creative_work_refinement_attempts_key_uq").on(table.revisionKey),
    uniqueIndex("creative_work_refinement_attempts_output_uq")
      .on(table.workItemId, table.rootOutputId, table.attempt)
      .where(sql`${table.rootOutputId} is not null`),
    uniqueIndex("creative_work_refinement_attempts_slide_uq")
      .on(table.workItemId, table.rootSlideId, table.attempt)
      .where(sql`${table.rootSlideId} is not null`),
    index("creative_work_refinement_attempts_scope_idx").on(
      table.workspaceId,
      table.workItemId,
    ),
    check(
      "creative_work_refinement_attempts_attempt_check",
      sql`${table.attempt} in (1,2)`,
    ),
    check(
      "creative_work_refinement_attempts_status_check",
      sql`${table.status} in ('claimed','dispatched','completed','failed')`,
    ),
    check(
      "creative_work_refinement_attempts_credits_check",
      sql`${table.unitCredits} >= 0`,
    ),
    check(
      "creative_work_refinement_attempts_root_check",
      sql`(${table.rootOutputId} is null) != (${table.rootSlideId} is null)`,
    ),
    check(
      "creative_work_refinement_attempts_parent_check",
      sql`(${table.rootOutputId} is null) = (${table.parentOutputId} is null) and (${table.rootSlideId} is null) = (${table.parentSlideId} is null)`,
    ),
    foreignKey({
      columns: [table.rootOutputId],
      foreignColumns: [creativeWorkOutputs.id],
      name: "creative_work_refinement_attempts_root_output_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.parentOutputId],
      foreignColumns: [creativeWorkOutputs.id],
      name: "creative_work_refinement_attempts_parent_output_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.rootSlideId],
      foreignColumns: [creativeWorkCarouselSlides.id],
      name: "creative_work_refinement_attempts_root_slide_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.parentSlideId],
      foreignColumns: [creativeWorkCarouselSlides.id],
      name: "creative_work_refinement_attempts_parent_slide_fk",
    }).onDelete("set null"),
  ]
);

export type CreativeWorkRefinementAttempt = typeof creativeWorkRefinementAttempts.$inferSelect;
export type NewCreativeWorkRefinementAttempt = typeof creativeWorkRefinementAttempts.$inferInsert;

/**
 * Tentativa vigente de preparacao.
 *
 * Existe para que a chamada externa aconteca FORA da transacao sem reabrir
 * corridas. Hoje `withCreativeWorkPreparationLock` abre a transacao e so entao
 * pede o advisory lock, entao uma escrita curta do mesmo Trabalho espera o
 * modelo responder — medido em 12/09/2026: 227 ms de espera e 5 de 5 escritores
 * concorrentes presos, cada um segurando uma conexao do pool
 * (docs/operations/reliability-metrics.md).
 *
 * A exclusao mutua e do BANCO, nao da aplicacao: o indice unico parcial
 * `..._active_uq` garante no maximo uma tentativa `running` por Trabalho.
 * `inputRevision` congela a revisao de conteudo, `inputFingerprint` as entradas
 * canonicas efetivamente usadas, e `leaseExpiresAt` impede que uma execucao
 * morta bloqueie o Trabalho para sempre.
 */
export const creativeWorkPreparationAttempts = adscaleSchema.table(
  "creative_work_preparation_attempts",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    workItemId: uuid("work_item_id")
      .notNull()
      .references(() => creativeWorkItems.id, { onDelete: "cascade" }),
    kind: text("kind")
      .notNull()
      .$type<import("../creative-work/preparation-attempt").PreparationKind>(),
    inputRevision: text("input_revision").notNull(),
    inputFingerprint: text("input_fingerprint").notNull(),
    state: text("state")
      .notNull()
      .default("running")
      .$type<import("../creative-work/preparation-attempt").PreparationAttemptState>(),
    leaseExpiresAt: timestamp("lease_expires_at", { mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    // A exclusao mutua e do banco: no maximo uma tentativa viva por Trabalho.
    uniqueIndex("creative_work_preparation_attempts_active_uq")
      .on(table.workItemId)
      .where(sql`${table.state} = 'running'`),
    index("creative_work_preparation_attempts_scope_idx").on(
      table.workspaceId,
      table.workItemId,
      table.updatedAt,
    ),
    check(
      "creative_work_preparation_attempts_state_check",
      sql`${table.state} in ('running','completed','failed','invalidated')`
    ),
    check(
      "creative_work_preparation_attempts_kind_check",
      sql`${table.kind} in ('creative_prepare','carousel_plan','carousel_prepare')`
    ),
  ]
);

export type CreativeWorkPreparationAttempt = typeof creativeWorkPreparationAttempts.$inferSelect;
export type NewCreativeWorkPreparationAttempt = typeof creativeWorkPreparationAttempts.$inferInsert;

export const visualRecipes = adscaleSchema.table(
  "visual_recipes",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientProfileId: uuid("client_profile_id")
      .notNull()
      .references(() => clientProfiles.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    document: jsonb("document")
      .notNull()
      .$type<import("../creative-work/visual-recipe").VisualRecipeDocument>(),
    originWorkId: uuid("origin_work_id")
      .notNull()
      .references(() => creativeWorkItems.id, { onDelete: "restrict" }),
    originOutputId: uuid("origin_output_id")
      .notNull()
      .references(() => creativeWorkOutputs.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("visual_recipes_brand_cursor_idx").on(
      table.workspaceId,
      table.clientProfileId,
      table.updatedAt,
      table.id,
    ),
    uniqueIndex("visual_recipes_origin_output_uq").on(table.originOutputId),
  ],
);

export type VisualRecipe = typeof visualRecipes.$inferSelect;
export type NewVisualRecipe = typeof visualRecipes.$inferInsert;

export const pieceReviewComments = adscaleSchema.table(
  "piece_review_comments",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    shareLinkId: uuid("share_link_id")
      .notNull()
      .references(() => shareLinks.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    outputId: uuid("output_id")
      .notNull()
      .references(() => creativeWorkOutputs.id, { onDelete: "restrict" }),
    outputVersion: integer("output_version").notNull(),
    authorLabel: text("author_label").notNull(),
    decision: text("decision")
      .notNull()
      .$type<import("../creative-work/external-piece-review").PieceReviewDecision>(),
    body: text("body"),
    area: jsonb("area").$type<import("../creative-work/external-piece-review").PieceReviewArea | null>(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("piece_review_comments_share_idx").on(table.shareLinkId, table.createdAt, table.id),
    check(
      "piece_review_comments_decision_check",
      sql`${table.decision} in ('comment','approve','request_changes')`,
    ),
  ],
);

export type PieceReviewComment = typeof pieceReviewComments.$inferSelect;
export type NewPieceReviewComment = typeof pieceReviewComments.$inferInsert;

export const brandCommercialOffers = adscaleSchema.table(
  "brand_commercial_offers",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientProfileId: uuid("client_profile_id")
      .notNull()
      .references(() => clientProfiles.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    slug: text("slug").notNull(),
    document: jsonb("document")
      .notNull()
      .$type<import("../creative-work/commercial-offer").CommercialOfferDocument>(),
    originWorkId: uuid("origin_work_id")
      .notNull()
      .references(() => creativeWorkItems.id, { onDelete: "restrict" }),
    validFrom: timestamp("valid_from", { mode: "date" }).notNull(),
    validUntil: timestamp("valid_until", { mode: "date" }).notNull(),
    supersededAt: timestamp("superseded_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("brand_commercial_offers_brand_cursor_idx").on(
      table.workspaceId,
      table.clientProfileId,
      table.updatedAt,
      table.id,
    ),
    uniqueIndex("brand_commercial_offers_slug_version_uq").on(
      table.workspaceId,
      table.clientProfileId,
      table.slug,
      table.version,
    ),
  ],
);

export type BrandCommercialOffer = typeof brandCommercialOffers.$inferSelect;
export type NewBrandCommercialOffer = typeof brandCommercialOffers.$inferInsert;
