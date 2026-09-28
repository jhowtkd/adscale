import type {
  AccountScope,
  EquipeAccount,
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
  EquipeIdea,
  EquipeIdeaPatch,
  EquipeIntentFilter,
  EquipeItem,
  EquipeItemFilter,
  EquipeItemPatch,
  EquipeItemVersion,
  EquipeMandate,
  EquipeMandatePatch,
  EquipeOnboardingStep,
  EquipeOnboardingStepPatch,
  EquipePause,
  EquipePausePatch,
  EquipePlan,
  EquipePlanPatch,
  EquipePublicationIntent,
  EquipePublicationIntentPatch,
  EquipeReceipt,
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
  NewEquipeIdea,
  NewEquipeItem,
  NewEquipeItemVersion,
  NewEquipeMandate,
  NewEquipeOnboardingStep,
  NewEquipePause,
  NewEquipePlan,
  NewEquipePublicationIntent,
  NewEquipeReceipt,
  NewEquipeStaffMember,
  NewEquipeThread,
} from "./types";

// Contrato de persistência da Equipe. Regras do contrato (valem nas duas
// implementações e são cobradas pela suíte compartilhada):
// - escopo da conta é o PRIMEIRO argumento de todo método com escopo;
// - get fora do escopo retorna null; update fora do escopo lança NotFound;
// - violação de unicidade lança EquipeConflictError;
// - versões, recibos e eventos não têm update nem delete (imutáveis/append-only).

export interface AccountScopedRepository<R, C, P, F = undefined> {
  create(scope: AccountScope, input: C): Promise<R>;
  get(scope: AccountScope, id: string): Promise<R | null>;
  list(scope: AccountScope, filter?: F): Promise<R[]>;
  update(scope: AccountScope, id: string, patch: P): Promise<R>;
}

export interface AppendOnlyRepository<R, C, F = undefined> {
  create(scope: AccountScope, input: C): Promise<R>;
  get(scope: AccountScope, id: string): Promise<R | null>;
  list(scope: AccountScope, filter?: F): Promise<R[]>;
}

// Conta = marca num workspace. O próprio id é o account_id das demais tabelas.
export interface EquipeAccountRepository {
  create(workspaceId: string, input: NewEquipeAccount): Promise<EquipeAccount>;
  get(workspaceId: string, accountId: string): Promise<EquipeAccount | null>;
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

// Lado interno (staff/jobs, atrás do guard de equipe interna): o ÚNICO lugar
// com consultas entre contas — staff global, claim de despacho e varreduras.
export interface InternalEquipeRepositories {
  staff: EquipeStaffRepository;
  claimDueIntents(input: {
    owner: string;
    now: Date;
    limit?: number;
    leaseTtlMs?: number;
  }): Promise<EquipePublicationIntent[]>;
  listAccountsByStatus(status: EquipeAccountStatus): Promise<EquipeAccount[]>;
}

export interface EquipeRepositories {
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
