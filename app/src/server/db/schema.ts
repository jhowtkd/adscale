import {
  pgTable,
  text,
  timestamp,
  boolean,
  uuid,
  integer,
  jsonb,
  index,
  foreignKey,
} from "drizzle-orm/pg-core";

// ============================================
// Better Auth tables
// ============================================

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("session_user_id_idx").on(table.userId)]
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
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

export const verification = pgTable("verification", {
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

export const workspaces = pgTable("workspaces", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("workspace_members_workspace_id_idx").on(table.workspaceId),
    index("workspace_members_user_id_idx").on(table.userId),
  ]
);

export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
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
    status: text("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("campaigns_workspace_id_idx").on(table.workspaceId)]
);

export const campaignAssets = pgTable(
  "campaign_assets",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    key: text("key").notNull(),
    type: text("type").notNull(),
    size: integer("size"),
    width: integer("width"),
    height: integer("height"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("campaign_assets_campaign_id_idx").on(table.campaignId),
    index("campaign_assets_workspace_id_idx").on(table.workspaceId),
  ]
);

export const creativePlans = pgTable(
  "creative_plans",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
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

export const derivations = pgTable(
  "derivations",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    planId: uuid("plan_id").references(() => creativePlans.id),
    parentId: uuid("parent_id"),
    status: text("status").notNull().default("queued"),
    prompt: text("prompt"),
    outputKey: text("output_key"),
    format: text("format"),
    cost: integer("cost"),
    feedback: text("feedback"),
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
    }),
  ]
);

export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    type: text("type").notNull(),
    amount: integer("amount"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("usage_events_workspace_id_idx").on(table.workspaceId)]
);

export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    type: text("type").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("activity_events_workspace_id_idx").on(table.workspaceId),
    index("activity_events_user_id_idx").on(table.userId),
  ]
);

export const exports = pgTable(
  "exports",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    derivationId: uuid("derivation_id")
      .notNull()
      .references(() => derivations.id),
    format: text("format").notNull(),
    key: text("key").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("exports_workspace_id_idx").on(table.workspaceId),
    index("exports_derivation_id_idx").on(table.derivationId),
  ]
);
