import { z } from "zod";
import {
  EQUIPE_ACCOUNT_STATUS,
  EQUIPE_ACTOR_TYPE,
  EQUIPE_BATCH_STATUS,
  EQUIPE_CONNECTION_STATUS,
  EQUIPE_ESCALATION_STATUS,
  EQUIPE_EXCEPTION_STATUS,
  EQUIPE_FRONT_KEY,
  EQUIPE_FRONT_STATUS,
  EQUIPE_IDEA_KIND,
  EQUIPE_IDEA_STATUS,
  EQUIPE_INTENT_STATUS,
  EQUIPE_ITEM_STATUS,
  EQUIPE_MANDATE_STATUS,
  EQUIPE_ONBOARDING_STATUS,
  EQUIPE_ONBOARDING_STEP,
  EQUIPE_PAUSE_LEVEL,
  EQUIPE_PAUSE_SCOPE,
  EQUIPE_PAUSE_STATUS,
  EQUIPE_PERSON_ROLE,
  EQUIPE_ROUND_STATUS,
  EQUIPE_SCORE_VERDICT,
  EQUIPE_SEVERITY,
  EQUIPE_STAFF_ROLE,
  EQUIPE_THREAD_KIND,
  EQUIPE_VERSION_STATUS,
  equipeAccountPeople,
  equipeAccounts,
  equipeBatches,
  equipeCalibrationRounds,
  equipeCalibrationScores,
  equipeConnections,
  equipeContextVersions,
  equipeEscalations,
  equipeEvents,
  equipeExceptions,
  equipeFronts,
  equipeIdeas,
  equipeItemVersions,
  equipeItems,
  equipeMandates,
  equipeOnboardingSteps,
  equipePauses,
  equipePlans,
  equipePublicationIntents,
  equipeReceipts,
  equipeStaff,
  equipeThreads,
} from "../../db/equipe-schema";

// Escopo da conta: primeiro argumento de todo método com escopo de conta.
// Consultas entre contas vivem só no repositório interno (staff/jobs).
export type AccountScope = { workspaceId: string; accountId: string };
export type WorkspaceScope = { workspaceId: string };

export const accountScopeSchema = z.object({
  workspaceId: z.string().uuid(),
  accountId: z.string().uuid(),
});

// Registros tipados (projeção direta das tabelas; sem módulo de domínio aqui).
export type EquipeAccount = typeof equipeAccounts.$inferSelect;
export type EquipeAccountPerson = typeof equipeAccountPeople.$inferSelect;
export type EquipeStaffMember = typeof equipeStaff.$inferSelect;
export type EquipeFront = typeof equipeFronts.$inferSelect;
export type EquipeOnboardingStep = typeof equipeOnboardingSteps.$inferSelect;
export type EquipeContextVersion = typeof equipeContextVersions.$inferSelect;
export type EquipePlan = typeof equipePlans.$inferSelect;
export type EquipeMandate = typeof equipeMandates.$inferSelect;
export type EquipeIdea = typeof equipeIdeas.$inferSelect;
export type EquipeBatch = typeof equipeBatches.$inferSelect;
export type EquipeItem = typeof equipeItems.$inferSelect;
export type EquipeItemVersion = typeof equipeItemVersions.$inferSelect;
export type EquipeReceipt = typeof equipeReceipts.$inferSelect;
export type EquipeCalibrationRound = typeof equipeCalibrationRounds.$inferSelect;
export type EquipeCalibrationScore = typeof equipeCalibrationScores.$inferSelect;
export type EquipeEscalation = typeof equipeEscalations.$inferSelect;
export type EquipeException = typeof equipeExceptions.$inferSelect;
export type EquipePause = typeof equipePauses.$inferSelect;
export type EquipePublicationIntent = typeof equipePublicationIntents.$inferSelect;
export type EquipeConnection = typeof equipeConnections.$inferSelect;
export type EquipeThread = typeof equipeThreads.$inferSelect;
export type EquipeEvent = typeof equipeEvents.$inferSelect;

// Status: os literais vivem no schema (fonte única dos checks SQL).
export type EquipeAccountStatus = (typeof EQUIPE_ACCOUNT_STATUS)[number];
export type EquipePersonRole = (typeof EQUIPE_PERSON_ROLE)[number];
export type EquipeStaffRole = (typeof EQUIPE_STAFF_ROLE)[number];
export type EquipeFrontKey = (typeof EQUIPE_FRONT_KEY)[number];
export type EquipeFrontStatus = (typeof EQUIPE_FRONT_STATUS)[number];
export type EquipeOnboardingStepKey = (typeof EQUIPE_ONBOARDING_STEP)[number];
export type EquipeOnboardingStatus = (typeof EQUIPE_ONBOARDING_STATUS)[number];
export type EquipeVersionStatus = (typeof EQUIPE_VERSION_STATUS)[number];
export type EquipeMandateStatus = (typeof EQUIPE_MANDATE_STATUS)[number];
export type EquipeIdeaKind = (typeof EQUIPE_IDEA_KIND)[number];
export type EquipeIdeaStatus = (typeof EQUIPE_IDEA_STATUS)[number];
export type EquipeBatchStatus = (typeof EQUIPE_BATCH_STATUS)[number];
export type EquipeItemStatus = (typeof EQUIPE_ITEM_STATUS)[number];
export type EquipeActorType = (typeof EQUIPE_ACTOR_TYPE)[number];
export type EquipeRoundStatus = (typeof EQUIPE_ROUND_STATUS)[number];
export type EquipeScoreVerdict = (typeof EQUIPE_SCORE_VERDICT)[number];
export type EquipeSeverity = (typeof EQUIPE_SEVERITY)[number];
export type EquipeEscalationStatus = (typeof EQUIPE_ESCALATION_STATUS)[number];
export type EquipeExceptionStatus = (typeof EQUIPE_EXCEPTION_STATUS)[number];
export type EquipePauseLevel = (typeof EQUIPE_PAUSE_LEVEL)[number];
export type EquipePauseScope = (typeof EQUIPE_PAUSE_SCOPE)[number];
export type EquipePauseStatus = (typeof EQUIPE_PAUSE_STATUS)[number];
export type EquipeIntentStatus = (typeof EQUIPE_INTENT_STATUS)[number];
export type EquipeConnectionStatus = (typeof EQUIPE_CONNECTION_STATUS)[number];
export type EquipeThreadKind = (typeof EQUIPE_THREAD_KIND)[number];

// Validação de entradas (implementação em memória espelha os checks do banco).
export const equipeAccountStatusSchema = z.enum(EQUIPE_ACCOUNT_STATUS);
export const equipePersonRoleSchema = z.enum(EQUIPE_PERSON_ROLE);
export const equipeStaffRoleSchema = z.enum(EQUIPE_STAFF_ROLE);
export const equipeFrontKeySchema = z.enum(EQUIPE_FRONT_KEY);
export const equipeFrontStatusSchema = z.enum(EQUIPE_FRONT_STATUS);
export const equipeOnboardingStepKeySchema = z.enum(EQUIPE_ONBOARDING_STEP);
export const equipeOnboardingStatusSchema = z.enum(EQUIPE_ONBOARDING_STATUS);
export const equipeVersionStatusSchema = z.enum(EQUIPE_VERSION_STATUS);
export const equipeMandateStatusSchema = z.enum(EQUIPE_MANDATE_STATUS);
export const equipeIdeaKindSchema = z.enum(EQUIPE_IDEA_KIND);
export const equipeIdeaStatusSchema = z.enum(EQUIPE_IDEA_STATUS);
export const equipeBatchStatusSchema = z.enum(EQUIPE_BATCH_STATUS);
export const equipeItemStatusSchema = z.enum(EQUIPE_ITEM_STATUS);
export const equipeActorTypeSchema = z.enum(EQUIPE_ACTOR_TYPE);
export const equipeRoundStatusSchema = z.enum(EQUIPE_ROUND_STATUS);
export const equipeScoreVerdictSchema = z.enum(EQUIPE_SCORE_VERDICT);
export const equipeSeveritySchema = z.enum(EQUIPE_SEVERITY);
export const equipeEscalationStatusSchema = z.enum(EQUIPE_ESCALATION_STATUS);
export const equipeExceptionStatusSchema = z.enum(EQUIPE_EXCEPTION_STATUS);
export const equipePauseLevelSchema = z.enum(EQUIPE_PAUSE_LEVEL);
export const equipePauseScopeSchema = z.enum(EQUIPE_PAUSE_SCOPE);
export const equipePauseStatusSchema = z.enum(EQUIPE_PAUSE_STATUS);
export const equipeIntentStatusSchema = z.enum(EQUIPE_INTENT_STATUS);
export const equipeConnectionStatusSchema = z.enum(EQUIPE_CONNECTION_STATUS);
export const equipeThreadKindSchema = z.enum(EQUIPE_THREAD_KIND);

// Payloads jsonb com forma conhecida.
export type EquipeFieldProvenance = "sustained" | "inferred" | "unknown";
export type EquipeContextField = {
  status: EquipeFieldProvenance;
  value?: unknown;
  source?: string;
};
export type EquipeContextFields = Record<string, EquipeContextField>;

// Entradas de criação: $inferInsert sem identidade/escopo/carimbos (o escopo
// vem do primeiro argumento; o repositório preenche id e carimbos).
type NewRow<T> = Omit<T, "id" | "workspaceId" | "accountId" | "createdAt" | "updatedAt">;
export type NewEquipeAccount = Omit<
  typeof equipeAccounts.$inferInsert,
  "id" | "workspaceId" | "createdAt" | "updatedAt"
> & { status?: EquipeAccountStatus };
export type NewEquipeAccountPerson = NewRow<typeof equipeAccountPeople.$inferInsert> & {
  role: EquipePersonRole;
};
export type NewEquipeStaffMember = Omit<
  typeof equipeStaff.$inferInsert,
  "id" | "createdAt" | "updatedAt"
> & { role: EquipeStaffRole };
export type NewEquipeFront = NewRow<typeof equipeFronts.$inferInsert> & {
  key: EquipeFrontKey;
  status?: EquipeFrontStatus;
};
export type NewEquipeOnboardingStep = NewRow<typeof equipeOnboardingSteps.$inferInsert> & {
  step: EquipeOnboardingStepKey;
  status?: EquipeOnboardingStatus;
};
export type NewEquipeContextVersion = NewRow<typeof equipeContextVersions.$inferInsert> & {
  status?: EquipeVersionStatus;
  fields?: EquipeContextFields;
};
export type NewEquipePlan = NewRow<typeof equipePlans.$inferInsert> & {
  status?: EquipeVersionStatus;
};
export type NewEquipeMandate = NewRow<typeof equipeMandates.$inferInsert> & {
  status?: EquipeMandateStatus;
};
export type NewEquipeIdea = NewRow<typeof equipeIdeas.$inferInsert> & {
  kind: EquipeIdeaKind;
  status?: EquipeIdeaStatus;
};
export type NewEquipeBatch = NewRow<typeof equipeBatches.$inferInsert> & {
  status?: EquipeBatchStatus;
};
export type NewEquipeItem = NewRow<typeof equipeItems.$inferInsert> & {
  status?: EquipeItemStatus;
};
export type NewEquipeItemVersion = Omit<
  typeof equipeItemVersions.$inferInsert,
  "id" | "workspaceId" | "accountId" | "createdAt"
>;
export type NewEquipeReceipt = Omit<
  typeof equipeReceipts.$inferInsert,
  "id" | "workspaceId" | "accountId" | "createdAt"
> & { personKind: EquipeActorType };
export type NewEquipeCalibrationRound = NewRow<typeof equipeCalibrationRounds.$inferInsert> & {
  status?: EquipeRoundStatus;
};
export type NewEquipeCalibrationScore = Omit<
  typeof equipeCalibrationScores.$inferInsert,
  "id" | "workspaceId" | "accountId" | "createdAt"
> & { verdict: EquipeScoreVerdict };
export type NewEquipeEscalation = NewRow<typeof equipeEscalations.$inferInsert> & {
  severity: EquipeSeverity;
  status?: EquipeEscalationStatus;
};
export type NewEquipeException = NewRow<typeof equipeExceptions.$inferInsert> & {
  status?: EquipeExceptionStatus;
};
export type NewEquipePause = NewRow<typeof equipePauses.$inferInsert> & {
  level: EquipePauseLevel;
  scope: EquipePauseScope;
  status?: EquipePauseStatus;
};
export type NewEquipePublicationIntent = Omit<
  NewRow<typeof equipePublicationIntents.$inferInsert>,
  "idempotencyKey"
> & {
  status?: EquipeIntentStatus;
};
export type NewEquipeConnection = NewRow<typeof equipeConnections.$inferInsert> & {
  status?: EquipeConnectionStatus;
};
export type NewEquipeThread = NewRow<typeof equipeThreads.$inferInsert> & {
  kind?: EquipeThreadKind;
};
export type NewEquipeEvent = Omit<
  typeof equipeEvents.$inferInsert,
  "id" | "workspaceId" | "accountId"
> & { actorType: EquipeActorType };

// Atualizações parciais (versões, recibos, notas e eventos não têm update).
export type EquipeAccountPatch = Partial<NewEquipeAccount>;
export type EquipeAccountPersonPatch = Partial<NewEquipeAccountPerson>;
export type EquipeStaffPatch = Partial<NewEquipeStaffMember>;
export type EquipeFrontPatch = Partial<NewEquipeFront>;
export type EquipeOnboardingStepPatch = Partial<NewEquipeOnboardingStep>;
export type EquipeContextVersionPatch = Partial<NewEquipeContextVersion>;
export type EquipePlanPatch = Partial<NewEquipePlan>;
export type EquipeMandatePatch = Partial<NewEquipeMandate>;
export type EquipeIdeaPatch = Partial<NewEquipeIdea>;
export type EquipeBatchPatch = Partial<NewEquipeBatch>;
export type EquipeItemPatch = Partial<NewEquipeItem>;
export type EquipeCalibrationRoundPatch = Partial<NewEquipeCalibrationRound>;
export type EquipeEscalationPatch = Partial<NewEquipeEscalation>;
export type EquipeExceptionPatch = Partial<NewEquipeException>;
export type EquipePausePatch = Partial<NewEquipePause>;
export type EquipePublicationIntentPatch = Partial<NewEquipePublicationIntent>;
export type EquipeConnectionPatch = Partial<NewEquipeConnection>;
export type EquipeThreadPatch = Partial<NewEquipeThread>;

// Filtros de leitura.
export type EquipeItemFilter = {
  status?: EquipeItemStatus | EquipeItemStatus[];
  batchId?: string | null;
  frontId?: string;
};
export type EquipeIntentFilter = {
  status?: EquipeIntentStatus | EquipeIntentStatus[];
  itemId?: string;
};
export type EquipeEventFilter = {
  eventType?: string;
  objectType?: string;
  objectId?: string;
  since?: Date;
};
export type EquipeEscalationFilter = {
  itemId?: string;
};
export type EquipeStaffFilter = { role?: EquipeStaffRole; active?: boolean };

// Chave de idempotência da intenção: item + hash da versão.
export function publicationIntentIdempotencyKey(itemId: string, versionHash: string): string {
  return `pi1:${itemId}:${versionHash}`;
}

// Lease padrão do despacho (5 min, como o outbox de efeitos de seleção).
export const EQUIPE_INTENT_LEASE_TTL_MS = 5 * 60 * 1000;

// Erros de persistência (mesmos nas duas implementações).
export class EquipeNotFoundError extends Error {
  readonly code = "equipe_not_found";
  constructor(message = "equipe_not_found") {
    super(message);
    this.name = "EquipeNotFoundError";
  }
}

export class EquipeConflictError extends Error {
  readonly code = "equipe_conflict";
  constructor(message = "equipe_conflict") {
    super(message);
    this.name = "EquipeConflictError";
  }
}
