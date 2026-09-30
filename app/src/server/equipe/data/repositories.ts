import type {
  AccountScope,
  EquipeAccount,
  EquipeBrandHandoff,
  EquipeTaskIntent,
  NewEquipeTaskIntent,
  NewEquipeBrandHandoff,
  EquipeAccountLabel,
  EquipeAccountPatch,
  EquipeAccountPerson,
  EquipeAccountPersonPatch,
  EquipeAccountStatus,
  EquipeBatch,
  EquipeBatchPatch,
  EquipeCalibrationRound,
  EquipeCalibrationRoundPatch,
  EquipeCalibrationScore,
  EquipeConnection,
  EquipeConnectionPatch,
  EquipeContextVersion,
  EquipeContextVersionPatch,
  EquipeEscalation,
  EquipeEscalationFilter,
  EquipeEscalationPatch,
  EquipeEvent,
  EquipeEventFilter,
  EquipeException,
  EquipeExceptionPatch,
  EquipeFront,
  EquipeFrontPatch,
  EquipeGlobalStop,
  EquipeGlobalStopPatch,
  EquipeIdea,
  EquipeIdeaPatch,
  EquipeIntentFilter,
  EquipeItem,
  EquipeItemFilter,
  EquipeItemPatch,
  EquipeItemVersion,
  EquipeMandate,
  EquipeMandatePatch,
  EquipeNotificationDelivery,
  EquipeOnboardingStep,
  EquipeOnboardingStepPatch,
  EquipePause,
  EquipePausePatch,
  EquipePlan,
  EquipePlanPatch,
  EquipePublicationIntent,
  EquipePublicationIntentPatch,
  EquipeReceipt,
  EquipeRoundStatus,
  EquipeStaffFilter,
  EquipeStaffMember,
  EquipeStaffPatch,
  EquipeThread,
  EquipeThreadPatch,
  NewEquipeAccount,
  NewEquipeAccountPerson,
  NewEquipeBatch,
  NewEquipeCalibrationRound,
  NewEquipeCalibrationScore,
  NewEquipeConnection,
  NewEquipeContextVersion,
  NewEquipeEscalation,
  NewEquipeEvent,
  NewEquipeException,
  NewEquipeFront,
  NewEquipeGlobalStop,
  NewEquipeIdea,
  NewEquipeItem,
  NewEquipeItemVersion,
  NewEquipeMandate,
  NewEquipeNotificationDelivery,
  NewEquipeOnboardingStep,
  NewEquipePause,
  NewEquipePlan,
  NewEquipePublicationIntent,
  NewEquipeReceipt,
  NewEquipeStaffMember,
  NewEquipeThread,
} from "./types";
import type { CreateAssistantMessageInput } from "../../repositories/assistant-message";

export type ConversationThread = { id: string; workspaceId: string; clientProfileId: string; campaignId: string | null };

/** Uses the Assistant's store, on the same transaction as the module. */
export interface EquipeConversationRepository {
  get(workspaceId: string, threadId: string): Promise<ConversationThread | null>;
  ensurePrimary(workspaceId: string, clientProfileId: string): Promise<ConversationThread>;
  post(workspaceId: string, sourceEventId: string, input: CreateAssistantMessageInput): Promise<{ id: string }>;
}

// Contrato de persistência da Equipe. Regras do contrato (valem nas duas
// implementações e são cobradas pela suíte compartilhada):
// - escopo da conta é o PRIMEIRO argumento de todo método com escopo;
// - get fora do escopo retorna null; update fora do escopo lança NotFound;
// - violação de unicidade lança EquipeConflictError;
// - versões, recibos e eventos não têm update nem delete (imutáveis/append-only).

export interface AccountScopedRepository<R, C, P, F = undefined> {
  create(scope: AccountScope, input: C): Promise<R>;
  get(scope: AccountScope, id: string, options?: { forUpdate: boolean }): Promise<R | null>;
  list(scope: AccountScope, filter?: F): Promise<R[]>;
  update(scope: AccountScope, id: string, patch: P): Promise<R>;
}

export interface AppendOnlyRepository<R, C, F = undefined> {
  create(scope: AccountScope, input: C): Promise<R>;
  get(scope: AccountScope, id: string, options?: { forUpdate: boolean }): Promise<R | null>;
  list(scope: AccountScope, filter?: F): Promise<R[]>;
}

// Conta = marca num workspace. O próprio id é o account_id das demais tabelas.
export interface EquipeAccountRepository {
  create(workspaceId: string, input: NewEquipeAccount): Promise<EquipeAccount>;
  get(workspaceId: string, accountId: string, options?: { forUpdate: boolean }): Promise<EquipeAccount | null>;
  findByClientProfile(
    workspaceId: string,
    clientProfileId: string
  ): Promise<EquipeAccount | null>;
  list(workspaceId: string): Promise<EquipeAccount[]>;
  update(
    workspaceId: string,
    accountId: string,
    patch: EquipeAccountPatch
  ): Promise<EquipeAccount>;
}

export type EquipeAccountPersonRepository = AccountScopedRepository<
  EquipeAccountPerson,
  NewEquipeAccountPerson,
  EquipeAccountPersonPatch
>;
export type EquipeFrontRepository = AccountScopedRepository<
  EquipeFront,
  NewEquipeFront,
  EquipeFrontPatch
>;
export type EquipeOnboardingStepRepository = AccountScopedRepository<
  EquipeOnboardingStep,
  NewEquipeOnboardingStep,
  EquipeOnboardingStepPatch
>;
export type EquipeContextVersionRepository = AccountScopedRepository<
  EquipeContextVersion,
  NewEquipeContextVersion,
  EquipeContextVersionPatch
>;
export type EquipePlanRepository = AccountScopedRepository<
  EquipePlan,
  NewEquipePlan,
  EquipePlanPatch
>;
export type EquipeMandateRepository = AccountScopedRepository<
  EquipeMandate,
  NewEquipeMandate,
  EquipeMandatePatch
>;
export type EquipeIdeaRepository = AccountScopedRepository<
  EquipeIdea,
  NewEquipeIdea,
  EquipeIdeaPatch
>;
export type EquipeBatchRepository = AccountScopedRepository<
  EquipeBatch,
  NewEquipeBatch,
  EquipeBatchPatch
>;
export type EquipeItemRepository = AccountScopedRepository<
  EquipeItem,
  NewEquipeItem,
  EquipeItemPatch,
  EquipeItemFilter
>;
export type EquipeCalibrationRoundRepository = AccountScopedRepository<
  EquipeCalibrationRound,
  NewEquipeCalibrationRound,
  EquipeCalibrationRoundPatch
>;
export type EquipeCalibrationScoreRepository = AppendOnlyRepository<
  EquipeCalibrationScore,
  NewEquipeCalibrationScore
>;
export type EquipeEscalationRepository = AccountScopedRepository<
  EquipeEscalation,
  NewEquipeEscalation,
  EquipeEscalationPatch,
  EquipeEscalationFilter
>;
export type EquipeExceptionRepository = AccountScopedRepository<
  EquipeException,
  NewEquipeException,
  EquipeExceptionPatch
>;
export type EquipePauseRepository = AccountScopedRepository<
  EquipePause,
  NewEquipePause,
  EquipePausePatch
>;
export type EquipeConnectionRepository = AccountScopedRepository<
  EquipeConnection,
  NewEquipeConnection,
  EquipeConnectionPatch
>;
export type EquipeThreadRepository = AccountScopedRepository<
  EquipeThread,
  NewEquipeThread,
  EquipeThreadPatch
>;
export type EquipeEventRepository = AppendOnlyRepository<
  EquipeEvent,
  NewEquipeEvent,
  EquipeEventFilter
>;

// Outbox delivery records (#549). One row per delivered
// `notification.requested` event; `record` is idempotent per event and
// unions the channels, so a retried run only delivers what is missing.
export interface EquipeDeliveryRepository {
  record(
    scope: AccountScope,
    input: NewEquipeNotificationDelivery
  ): Promise<EquipeNotificationDelivery>;
  getByEvent(
    scope: AccountScope,
    eventId: string
  ): Promise<EquipeNotificationDelivery | null>;
  list(scope: AccountScope): Promise<EquipeNotificationDelivery[]>;
}

// Versões imutáveis: sem update/delete. Unicidade por (item, hash).
export interface EquipeItemVersionRepository
  extends AppendOnlyRepository<EquipeItemVersion, NewEquipeItemVersion, { itemId?: string }> {
  getByHash(scope: AccountScope, itemId: string, versionHash: string): Promise<EquipeItemVersion | null>;
}

// Recibos imutáveis: sem update/delete.
export interface EquipeReceiptRepository
  extends AppendOnlyRepository<EquipeReceipt, NewEquipeReceipt> {
  listByObject(
    scope: AccountScope,
    objectType: string,
    objectId: string
  ): Promise<EquipeReceipt[]>;
}

// Fila de despacho. O insert é idempotente por (item, hash); o claim com lease
// é global e vive no repositório interno (jobs), nunca no escopo da conta.
export interface EquipeIntentRepository {
  insertOrGet(
    scope: AccountScope,
    input: NewEquipePublicationIntent
  ): Promise<{ intent: EquipePublicationIntent; created: boolean }>;
  get(scope: AccountScope, id: string): Promise<EquipePublicationIntent | null>;
  /** Serialize reconciliation outcomes inside the caller's transaction. */
  getForUpdate(scope: AccountScope, id: string): Promise<EquipePublicationIntent | null>;
  getByItemVersion(
    scope: AccountScope,
    itemId: string,
    versionHash: string
  ): Promise<EquipePublicationIntent | null>;
  list(scope: AccountScope, filter?: EquipeIntentFilter): Promise<EquipePublicationIntent[]>;
  update(
    scope: AccountScope,
    id: string,
    patch: EquipePublicationIntentPatch
  ): Promise<EquipePublicationIntent>;
}

export interface EquipeStaffRepository {
  create(input: NewEquipeStaffMember): Promise<EquipeStaffMember>;
  get(id: string): Promise<EquipeStaffMember | null>;
  list(filter?: EquipeStaffFilter): Promise<EquipeStaffMember[]>;
  update(id: string, patch: EquipeStaffPatch): Promise<EquipeStaffMember>;
}

// Parada global (#583): fonte única sem escopo, no lado interno. Uma linha
// ativa no máximo (o banco reforça com índice parcial; a memória com checagem).
export interface EquipeGlobalStopRepository {
  getActive(): Promise<EquipeGlobalStop | null>;
  create(input: NewEquipeGlobalStop): Promise<EquipeGlobalStop>;
  update(id: string, patch: EquipeGlobalStopPatch): Promise<EquipeGlobalStop>;
}

// Lado interno (staff/jobs, atrás do guard de equipe interna): o ÚNICO lugar
// com consultas entre contas — staff global, claim de despacho e varreduras.
export interface InternalEquipeRepositories {
  /** Called inside the opening transaction, before checking existing accounts. */
  lockWorkspace(workspaceId: string): Promise<void>;
  listPendingTaskIntents(): Promise<EquipeTaskIntent[]>;
  listWorkspaceIds(options?: { after?: string; limit?: number }): Promise<string[]>;
  getVerifiedWorkspaceMember(workspaceId: string, userId: string): Promise<{ name: string; email: string } | null>;
  createClientProfile(workspaceId: string, name: string): Promise<{ id: string }>;
  staff: EquipeStaffRepository;
  // #583 — parada global de publicações.
  globalStops: EquipeGlobalStopRepository;
  /** Every account, any status: the global stop fans out across all of them. */
  listAccounts(): Promise<EquipeAccount[]>;
  claimDueIntents(input: {
    owner: string;
    now: Date;
    limit?: number;
    leaseTtlMs?: number;
    /** Revalidate only publish_disabled holds, through the normal dispatch gate. */
    revalidatePublishDisabled?: boolean;
  }): Promise<EquipePublicationIntent[]>;
  listAccountsByStatus(status: EquipeAccountStatus): Promise<EquipeAccount[]>;
  /** Cross-account round scan for the internal quality pipeline (#546). */
  listCalibrationRounds(filter?: {
    status?: EquipeRoundStatus | EquipeRoundStatus[];
  }): Promise<EquipeCalibrationRound[]>;
  /**
   * Cross-account round lookup by id: the internal detail console resolves
   * the account scope from the id alone (#554). Null when unknown.
   */
  getCalibrationRound(id: string): Promise<EquipeCalibrationRound | null>;
  /**
   * Cross-account escalation lookup by id: same scope resolution for the
   * internal escalation console (#554). Null when unknown.
   */
  getEscalation(id: string): Promise<EquipeEscalation | null>;
  /** Cross-account front scan: the quality pipeline labels rounds by front (#554). */
  listFronts(): Promise<EquipeFront[]>;
  /**
   * Brand + workspace names per account for the internal consoles (#554).
   * Read-only join over client profiles and workspaces; rows without a
   * match come back with null names.
   */
  listAccountLabels(): Promise<EquipeAccountLabel[]>;
}

export interface EquipeRepositories {
  taskOutbox: AppendOnlyRepository<EquipeTaskIntent, NewEquipeTaskIntent> & {
    markDispatched(scope: AccountScope, id: string, at: Date): Promise<void>;
  };
  handoffs: AppendOnlyRepository<EquipeBrandHandoff, NewEquipeBrandHandoff>;
  conversations: EquipeConversationRepository;
  accounts: EquipeAccountRepository;
  people: EquipeAccountPersonRepository;
  fronts: EquipeFrontRepository;
  onboarding: EquipeOnboardingStepRepository;
  contexts: EquipeContextVersionRepository;
  plans: EquipePlanRepository;
  mandates: EquipeMandateRepository;
  ideas: EquipeIdeaRepository;
  batches: EquipeBatchRepository;
  items: EquipeItemRepository;
  itemVersions: EquipeItemVersionRepository;
  receipts: EquipeReceiptRepository;
  calibrationRounds: EquipeCalibrationRoundRepository;
  calibrationScores: EquipeCalibrationScoreRepository;
  escalations: EquipeEscalationRepository;
  exceptions: EquipeExceptionRepository;
  pauses: EquipePauseRepository;
  intents: EquipeIntentRepository;
  connections: EquipeConnectionRepository;
  threads: EquipeThreadRepository;
  events: EquipeEventRepository;
  deliveries: EquipeDeliveryRepository;
}

// Unidade de trabalho: um comando futuro escreve estado + equipe_events +
// intenções de efeito atomicamente dentro de run().
export interface EquipeUnitOfWork {
  repos: EquipeRepositories;
  internal: InternalEquipeRepositories;
  run<T>(
    fn: (repos: EquipeRepositories, internal: InternalEquipeRepositories) => Promise<T>
  ): Promise<T>;
}
