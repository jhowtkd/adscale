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
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("client_profiles_workspace_id_idx").on(table.workspaceId),
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
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("campaign_assets_campaign_id_idx").on(table.campaignId),
    index("campaign_assets_workspace_id_idx").on(table.workspaceId),
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
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("usage_events_workspace_id_idx").on(table.workspaceId)]
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
