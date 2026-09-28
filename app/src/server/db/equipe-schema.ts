import { sql, type SQL, type SQLWrapper } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  assistantThreads,
  clientProfiles,
  creativeWorkItems,
  creativeWorkOutputs,
  user,
  workspaces,
} from "./schema";

// Compartimento da Equipe (conta = marca num workspace). Arquivo próprio,
// fora do schema.ts do app, para a fronteira ficar visível e removível.
// Todo repositório recebe o escopo da conta primeiro; sem RLS (como no app).
export const equipeSchema = pgSchema("adscale_equipe");

// Listas de valores: fonte única (os checks SQL derivam daqui). Os zods da
// camada de dados importam estas constantes — nunca duplique os literais.
function inList(column: SQLWrapper, values: readonly string[]): SQL {
  return sql`${column} in (${sql.raw(values.map((v) => `'${v}'`).join(", "))})`;
}

export const EQUIPE_ACCOUNT_STATUS = [
  "deploying",
  "paused",
  "calibrating",
  "active",
  "suspended",
  "closed",
] as const;
export const EQUIPE_PERSON_ROLE = ["approver", "substitute", "custodian", "member"] as const;
export const EQUIPE_STAFF_ROLE = ["support", "quality", "operations"] as const;
export const EQUIPE_FRONT_KEY = ["social_instagram", "midia_paga"] as const;
export const EQUIPE_FRONT_STATUS = ["draft", "calibrating", "released", "paused", "closed"] as const;
export const EQUIPE_ONBOARDING_STEP = [
  "scope_confirm",
  "materials",
  "context",
  "plan",
  "mandate",
  "connection",
  "go_live",
] as const;
export const EQUIPE_ONBOARDING_STATUS = ["pending", "in_progress", "done", "skipped", "paused"] as const;
export const EQUIPE_VERSION_STATUS = ["draft", "proposed", "approved", "superseded"] as const;
export const EQUIPE_MANDATE_STATUS = [
  "draft",
  "proposed",
  "approved",
  "suspended",
  "superseded",
] as const;
export const EQUIPE_IDEA_KIND = ["plan_change", "mandate_change", "content"] as const;
export const EQUIPE_IDEA_STATUS = ["proposed", "accepted", "rejected"] as const;
export const EQUIPE_BATCH_STATUS = ["open", "delivered", "approved", "closed"] as const;
// Stored item status IS the domain ItemStatus 1:1 (see domain/item.ts) —
// decline (do_not_publish) vs cancel (cancelled) and manual approval
// (available_for_download) are distinct stored states.
export const EQUIPE_ITEM_STATUS = [
  "awaiting_approval",
  "adjusting",
  "scheduled",
  "held",
  "missed_window",
  "do_not_publish",
  "cancelled",
  "sending",
  "verifying",
  "published",
  "failed",
  "available_for_download",
  "published_declared",
  "published_confirmed",
] as const;
export const EQUIPE_ACTOR_TYPE = ["client_person", "staff", "agent", "system"] as const;
export const EQUIPE_AGENT_ROLE = [
  "strategist",
  "research",
  "writer",
  "reviewer_text",
  "reviewer_visual",
  "measurement",
] as const;
export const EQUIPE_ROUND_STATUS = ["open", "closed"] as const;
export const EQUIPE_SCORE_VERDICT = ["pass", "fail", "critical"] as const;
export const EQUIPE_SEVERITY = ["low", "medium", "high", "critical", "critical_cross_account"] as const;
export const EQUIPE_ESCALATION_STATUS = [
  "open",
  "acknowledged",
  "resolving",
  "awaiting_client",
  "resolved",
  "merged",
  "closed",
] as const;
export const EQUIPE_EXCEPTION_STATUS = ["open", "claimed", "resolved", "closed"] as const;
export const EQUIPE_PAUSE_LEVEL = ["publishing", "execution", "billing"] as const;
export const EQUIPE_PAUSE_SCOPE = ["account", "front", "global"] as const;
export const EQUIPE_PAUSE_STATUS = ["active", "lifted"] as const;
export const EQUIPE_INTENT_STATUS = [
  "pending",
  "sending",
  "verifying",
  "published",
  "failed",
  "held",
  "canceled",
] as const;
export const EQUIPE_CONNECTION_STATUS = ["active", "expired", "revoked", "error"] as const;
export const EQUIPE_THREAD_KIND = ["primary", "parallel"] as const;

// Conta da Equipe: uma marca (client_profile) num workspace. O próprio id é
// o account_id usado pelas demais tabelas.
export const equipeAccounts = equipeSchema.table(
  "equipe_accounts",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientProfileId: uuid("client_profile_id")
      .notNull()
      .references(() => clientProfiles.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("deploying"),
    launchedAt: timestamp("launched_at", { mode: "date" }),
    closedAt: timestamp("closed_at", { mode: "date" }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("equipe_accounts_workspace_profile_uq").on(t.workspaceId, t.clientProfileId),
    index("equipe_accounts_workspace_idx").on(t.workspaceId),
    check("equipe_accounts_status_check", inList(t.status, EQUIPE_ACCOUNT_STATUS)),
  ]
);

// Pessoas da conta (lado cliente). Separado de workspace_members.role.
export const equipeAccountPeople = equipeSchema.table(
  "equipe_account_people",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => equipeAccounts.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    role: text("role").notNull(),
    name: text("name").notNull(),
    email: text("email"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("equipe_account_people_account_idx").on(t.accountId),
    check("equipe_account_people_role_check", inList(t.role, EQUIPE_PERSON_ROLE)),
  ]
);

// Equipe interna (global: sem workspace/account). Gerida pelo dono da plataforma.
export const equipeStaff = equipeSchema.table(
  "equipe_staff",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    role: text("role").notNull(),
    displayName: text("display_name").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("equipe_staff_user_role_uq")
      .on(t.userId, t.role)
      .where(sql`${t.userId} is not null`),
    check("equipe_staff_role_check", inList(t.role, EQUIPE_STAFF_ROLE)),
  ]
);

// Frentes de atuação da conta (ex.: social_instagram, midia_paga).
export const equipeFronts = equipeSchema.table(
  "equipe_fronts",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => equipeAccounts.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    status: text("status").notNull().default("draft"),
    calibrationSequence: integer("calibration_sequence").notNull().default(0),
    roundsUsed: integer("rounds_used").notNull().default(0),
    releasedAt: timestamp("released_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("equipe_fronts_account_key_uq").on(t.accountId, t.key),
    check("equipe_fronts_key_check", inList(t.key, EQUIPE_FRONT_KEY)),
    check("equipe_fronts_status_check", inList(t.status, EQUIPE_FRONT_STATUS)),
  ]
);

// As 7 etapas da implantação, com dono, prazo e teto de lembretes.
export const equipeOnboardingSteps = equipeSchema.table(
  "equipe_onboarding_steps",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => equipeAccounts.id, { onDelete: "cascade" }),
    step: text("step").notNull(),
    status: text("status").notNull().default("pending"),
    owner: text("owner"),
    dueAt: timestamp("due_at", { mode: "date" }),
    remindersSent: integer("reminders_sent").notNull().default(0),
    remindersCap: integer("reminders_cap").notNull().default(3),
    completedAt: timestamp("completed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("equipe_onboarding_steps_account_step_uq").on(t.accountId, t.step),
    check("equipe_onboarding_steps_step_check", inList(t.step, EQUIPE_ONBOARDING_STEP)),
    check("equipe_onboarding_steps_status_check", inList(t.status, EQUIPE_ONBOARDING_STATUS)),
  ]
);

// Contexto de marketing por seção, versionado. fields: cada campo com status
// (sustentado/inferido/desconhecido) e fonte. Seção aprovada gera recibo.
export const equipeContextVersions = equipeSchema.table(
  "equipe_context_versions",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => equipeAccounts.id, { onDelete: "cascade" }),
    section: text("section").notNull(),
    version: integer("version").notNull(),
    fields: jsonb("fields").notNull().default({}),
    status: text("status").notNull().default("draft"),
    authorRole: text("author_role"),
    authorId: text("author_id"),
    receiptId: uuid("receipt_id").references(() => equipeReceipts.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("equipe_context_versions_account_section_version_uq").on(
      t.accountId,
      t.section,
      t.version
    ),
    check("equipe_context_versions_status_check", inList(t.status, EQUIPE_VERSION_STATUS)),
  ]
);

// Plano versionado da conta.
export const equipePlans = equipeSchema.table(
  "equipe_plans",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => equipeAccounts.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    status: text("status").notNull().default("draft"),
    content: jsonb("content").notNull().default({}),
    receiptId: uuid("receipt_id").references(() => equipeReceipts.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("equipe_plans_account_version_uq").on(t.accountId, t.version),
    check("equipe_plans_status_check", inList(t.status, EQUIPE_VERSION_STATUS)),
  ]
);

// Mandato versionado: shadow, limites, janela, validade e condição de parada.
export const equipeMandates = equipeSchema.table(
  "equipe_mandates",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => equipeAccounts.id, { onDelete: "cascade" }),
    frontId: uuid("front_id").references(() => equipeFronts.id, { onDelete: "set null" }),
    version: integer("version").notNull(),
    status: text("status").notNull().default("draft"),
    shadow: boolean("shadow").notNull().default(false),
    limits: jsonb("limits"),
    window: jsonb("window"),
    validFrom: timestamp("valid_from", { mode: "date" }),
    validUntil: timestamp("valid_until", { mode: "date" }),
    stopCondition: jsonb("stop_condition"),
    receiptId: uuid("receipt_id").references(() => equipeReceipts.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("equipe_mandates_account_version_uq").on(t.accountId, t.version),
    index("equipe_mandates_account_idx").on(t.accountId),
    check("equipe_mandates_status_check", inList(t.status, EQUIPE_MANDATE_STATUS)),
  ]
);

// Propostas do Estrategista. Aceitar gera nova versão de Plano ou Mandato.
export const equipeIdeas = equipeSchema.table(
  "equipe_ideas",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => equipeAccounts.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("proposed"),
    payload: jsonb("payload").notNull().default({}),
    resultingPlanVersion: integer("resulting_plan_version"),
    resultingMandateVersion: integer("resulting_mandate_version"),
    decidedAt: timestamp("decided_at", { mode: "date" }),
    receiptId: uuid("receipt_id").references(() => equipeReceipts.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("equipe_ideas_account_idx").on(t.accountId),
    check("equipe_ideas_kind_check", inList(t.kind, EQUIPE_IDEA_KIND)),
    check("equipe_ideas_status_check", inList(t.status, EQUIPE_IDEA_STATUS)),
  ]
);

// Lotes de itens, com prazo "aprovar até".
export const equipeBatches = equipeSchema.table(
  "equipe_batches",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => equipeAccounts.id, { onDelete: "cascade" }),
    frontId: uuid("front_id").references(() => equipeFronts.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    status: text("status").notNull().default("open"),
    approveByAt: timestamp("approve_by_at", { mode: "date" }),
    deliveredAt: timestamp("delivered_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("equipe_batches_account_idx").on(t.accountId),
    check("equipe_batches_status_check", inList(t.status, EQUIPE_BATCH_STATUS)),
  ]
);

// Itens de produção: frente, lote, estado, horário, limite e Trabalho ligado.
export const equipeItems = equipeSchema.table(
  "equipe_items",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => equipeAccounts.id, { onDelete: "cascade" }),
    frontId: uuid("front_id")
      .notNull()
      .references(() => equipeFronts.id, { onDelete: "cascade" }),
    batchId: uuid("batch_id").references(() => equipeBatches.id, { onDelete: "set null" }),
    creativeWorkId: uuid("creative_work_id").references(() => creativeWorkItems.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("awaiting_approval"),
    scheduledFor: timestamp("scheduled_for", { mode: "date" }),
    deadlineAt: timestamp("deadline_at", { mode: "date" }),
    // Destination account/connection reference, part of the version hash.
    // Set at delivery; only version-creating commands may write it.
    destination: text("destination"),
    currentVersionHash: text("current_version_hash"),
    publishedOutputId: uuid("published_output_id").references(() => creativeWorkOutputs.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("equipe_items_account_idx").on(t.accountId),
    index("equipe_items_batch_idx").on(t.batchId),
    check("equipe_items_status_check", inList(t.status, EQUIPE_ITEM_STATUS)),
  ]
);

// Versões IMUTÁVEIS do item (trigger rejeita UPDATE e DELETE direto; DELETE
// por CASCADE do workspace/account/item passa). Hash cobre saída do Trabalho
// + legenda + conta + horário.
export const equipeItemVersions = equipeSchema.table(
  "equipe_item_versions",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => equipeAccounts.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => equipeItems.id, { onDelete: "cascade" }),
    versionHash: text("version_hash").notNull(),
    // Referência simples (sem FK): o hash da versão já fixa o conteúdo, e uma
    // linha imutável não pode receber SET NULL se a saída for excluída.
    creativeWorkOutputId: uuid("creative_work_output_id"),
    caption: text("caption").notNull().default(""),
    scheduledFor: timestamp("scheduled_for", { mode: "date" }),
    // Destination hashed into this version; set on INSERT only (immutable row).
    destination: text("destination"),
    authorRole: text("author_role").notNull(),
    authorId: text("author_id"),
    reviewerFindings: jsonb("reviewer_findings"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("equipe_item_versions_item_hash_uq").on(t.itemId, t.versionHash),
    index("equipe_item_versions_account_idx").on(t.accountId),
  ]
);

// Recibos IMUTÁVEIS (trigger rejeita UPDATE e DELETE direto; DELETE por
// CASCADE do workspace/account passa): pessoa, papel, objeto, versão (hash),
// ação e horário.
export const equipeReceipts = equipeSchema.table(
  "equipe_receipts",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => equipeAccounts.id, { onDelete: "cascade" }),
    personKind: text("person_kind").notNull(),
    personId: text("person_id"),
    personRole: text("person_role"),
    objectType: text("object_type").notNull(),
    objectId: uuid("object_id").notNull(),
    objectVersion: text("object_version"),
    action: text("action").notNull(),
    detail: jsonb("detail"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("equipe_receipts_account_object_idx").on(t.accountId, t.objectType, t.objectId),
    check("equipe_receipts_person_kind_check", inList(t.personKind, EQUIPE_ACTOR_TYPE)),
  ]
);

// Rodadas de calibração por frente.
export const equipeCalibrationRounds = equipeSchema.table(
  "equipe_calibration_rounds",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => equipeAccounts.id, { onDelete: "cascade" }),
    frontId: uuid("front_id")
      .notNull()
      .references(() => equipeFronts.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    status: text("status").notNull().default("open"),
    closedAt: timestamp("closed_at", { mode: "date" }),
    decision: jsonb("decision"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("equipe_calibration_rounds_front_sequence_uq").on(t.frontId, t.sequence),
    check("equipe_calibration_rounds_status_check", inList(t.status, EQUIPE_ROUND_STATUS)),
  ]
);

// Notas da rubrica: valem para a tentativa (item + hash) avaliada.
export const equipeCalibrationScores = equipeSchema.table(
  "equipe_calibration_scores",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => equipeAccounts.id, { onDelete: "cascade" }),
    roundId: uuid("round_id")
      .notNull()
      .references(() => equipeCalibrationRounds.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => equipeItems.id, { onDelete: "cascade" }),
    versionHash: text("version_hash").notNull(),
    rubric: jsonb("rubric"),
    verdict: text("verdict").notNull(),
    feedback: text("feedback"),
    relaxed: boolean("relaxed").notNull().default(false),
    evidence: jsonb("evidence"),
    scoredBy: text("scored_by"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("equipe_calibration_scores_round_item_hash_uq").on(
      t.roundId,
      t.itemId,
      t.versionHash
    ),
    check("equipe_calibration_scores_verdict_check", inList(t.verdict, EQUIPE_SCORE_VERDICT)),
  ]
);

// Escalonamentos: tipo, gravidade, responsáveis, prazo, causa e lição candidata.
export const equipeEscalations = equipeSchema.table(
  "equipe_escalations",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => equipeAccounts.id, { onDelete: "cascade" }),
    frontId: uuid("front_id").references(() => equipeFronts.id, { onDelete: "set null" }),
    itemId: uuid("item_id").references(() => equipeItems.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    severity: text("severity").notNull(),
    ownerRole: text("owner_role").notNull(),
    coOwnerRole: text("co_owner_role"),
    // Resolution parts: [{ kind, resolved }]; one entry normally, two after
    // a merge (#547). Null on rows written before 0121 means "single kind".
    parts: jsonb("parts"),
    dueAt: timestamp("due_at", { mode: "date" }),
    status: text("status").notNull().default("open"),
    cause: text("cause"),
    lessonCandidate: text("lesson_candidate"),
    resolvedAt: timestamp("resolved_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("equipe_escalations_account_idx").on(t.accountId),
    index("equipe_escalations_item_idx").on(t.itemId),
    check("equipe_escalations_severity_check", inList(t.severity, EQUIPE_SEVERITY)),
    check("equipe_escalations_status_check", inList(t.status, EQUIPE_ESCALATION_STATUS)),
  ]
);

// Exceções de atendimento: gatilho, motivo da IA, tentativas, prazo, responsável.
export const equipeExceptions = equipeSchema.table(
  "equipe_exceptions",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => equipeAccounts.id, { onDelete: "cascade" }),
    trigger: text("trigger").notNull(),
    reason: text("reason"),
    attempts: integer("attempts").notNull().default(0),
    dueAt: timestamp("due_at", { mode: "date" }),
    ownerRole: text("owner_role").notNull().default("account_manager"),
    // Staff member who assumed the case (#547); null until assumed.
    assigneeId: uuid("assignee_id"),
    status: text("status").notNull().default("open"),
    resolvedAt: timestamp("resolved_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("equipe_exceptions_account_idx").on(t.accountId),
    check("equipe_exceptions_status_check", inList(t.status, EQUIPE_EXCEPTION_STATUS)),
  ]
);

// Pausas: nível (publicação/execução/inadimplência), escopo, origem, quem retoma.
export const equipePauses = equipeSchema.table(
  "equipe_pauses",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => equipeAccounts.id, { onDelete: "cascade" }),
    frontId: uuid("front_id").references(() => equipeFronts.id, { onDelete: "set null" }),
    level: text("level").notNull(),
    scope: text("scope").notNull(),
    origin: text("origin").notNull(),
    resumableBy: text("resumable_by").notNull(),
    status: text("status").notNull().default("active"),
    reason: text("reason"),
    liftedAt: timestamp("lifted_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("equipe_pauses_account_idx").on(t.accountId),
    check("equipe_pauses_level_check", inList(t.level, EQUIPE_PAUSE_LEVEL)),
    check("equipe_pauses_scope_check", inList(t.scope, EQUIPE_PAUSE_SCOPE)),
    check("equipe_pauses_status_check", inList(t.status, EQUIPE_PAUSE_STATUS)),
  ]
);

// Fila de despacho: chave de idempotência (item + hash), lease (mesmo padrão
// da 0110), estado e id externo. Container do IG gravado antes do publish.
export const equipePublicationIntents = equipeSchema.table(
  "equipe_publication_intents",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => equipeAccounts.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => equipeItems.id, { onDelete: "cascade" }),
    versionHash: text("version_hash").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status").notNull().default("pending"),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { mode: "date" }),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { mode: "date" }),
    externalId: text("external_id"),
    containerId: text("container_id"),
    lastError: text("last_error"),
    scheduledFor: timestamp("scheduled_for", { mode: "date" }).notNull(),
    publishedAt: timestamp("published_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("equipe_publication_intents_item_hash_uq").on(t.itemId, t.versionHash),
    uniqueIndex("equipe_publication_intents_key_uq").on(t.idempotencyKey),
    index("equipe_publication_intents_claim_idx").on(t.status, t.nextAttemptAt),
    index("equipe_publication_intents_account_idx").on(t.accountId),
    check("equipe_publication_intents_status_check", inList(t.status, EQUIPE_INTENT_STATUS)),
  ]
);

// Instagram da Equipe (própria, do custodiante). Guarda SÓ a string do token
// já cifrado (AES-256-GCM `v1:`); nada de cripto neste ticket.
export const equipeConnections = equipeSchema.table(
  "equipe_connections",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => equipeAccounts.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("instagram"),
    encryptedToken: text("encrypted_token").notNull(),
    custodianPersonId: uuid("custodian_person_id").references(() => equipeAccountPeople.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("active"),
    lastError: text("last_error"),
    connectedAt: timestamp("connected_at", { mode: "date" }).notNull().defaultNow(),
    lastRefreshedAt: timestamp("last_refreshed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("equipe_connections_account_provider_uq").on(t.accountId, t.provider),
    check("equipe_connections_status_check", inList(t.status, EQUIPE_CONNECTION_STATUS)),
  ]
);

// Mapa conta → conversa do Assistente (principal ou paralela + tema), para
// assistant_threads não mudar.
export const equipeThreads = equipeSchema.table(
  "equipe_threads",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => equipeAccounts.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("primary"),
    topic: text("topic"),
    assistantThreadId: uuid("assistant_thread_id").references(() => assistantThreads.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("equipe_threads_account_primary_uq")
      .on(t.accountId)
      .where(sql`${t.kind} = 'primary'`),
    check("equipe_threads_kind_check", inList(t.kind, EQUIPE_THREAD_KIND)),
  ]
);

// Histórico append-only: fonte do "Histórico" e dos eventos na conversa.
// Escrito na mesma transação que muda o estado. Sem update/delete.
export const equipeEvents = equipeSchema.table(
  "equipe_events",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => equipeAccounts.id, { onDelete: "cascade" }),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    actorRole: text("actor_role"),
    eventType: text("event_type").notNull(),
    objectType: text("object_type"),
    objectId: uuid("object_id"),
    payload: jsonb("payload"),
    occurredAt: timestamp("occurred_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("equipe_events_account_occurred_idx").on(t.accountId, t.occurredAt),
    check("equipe_events_actor_type_check", inList(t.actorType, EQUIPE_ACTOR_TYPE)),
  ]
);

// Ledger de custo dos agentes de IA (#550): uma linha por chamada direta
// de modelo, com papel, modelo, tokens, custo estimado em centavos de USD
// e versão do prompt. Append-only; o teto mensal por conta
// (EQUIPE_AI_MONTHLY_BUDGET_USD_CENTS) soma cost_usd_cents do mês vigente
// em America/Sao_Paulo.
// Chamadas delegadas ao motor (Redação, Direção de arte) não passam por
// aqui: o custo delas segue no spend/cobrança que já existe.
export const equipeAgentLedger = equipeSchema.table(
  "equipe_agent_ledger",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => equipeAccounts.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    taskKind: text("task_kind").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsdCents: integer("cost_usd_cents").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("equipe_agent_ledger_account_idx").on(t.accountId),
    check("equipe_agent_ledger_role_check", inList(t.role, EQUIPE_AGENT_ROLE)),
  ]
);
