import { z } from "zod";
import type { EquipeGlobalStopRepository, EquipeRepositories } from "./repositories";
import {
  assertUnique,
  buildRow,
  checkFields,
  copy,
  makeMemoryAccountRepo,
  makeMemoryAppendRepo,
  stripUndefined,
  type MemoryEquipeStore,
} from "./memory-core";
import {
  EquipeNotFoundError,
  equipeEscalationStatusSchema,
  equipeExceptionStatusSchema,
  equipeGlobalStopStatusSchema,
  equipePauseLevelSchema,
  equipePauseScopeSchema,
  equipePauseStatusSchema,
  equipeRoundStatusSchema,
  equipeScoreVerdictSchema,
  equipeSeveritySchema,
  type EquipeGlobalStop,
  type EquipeGlobalStopPatch,
  type NewEquipeGlobalStop,
} from "./types";

// Agregado qualidade/operação em memória: rodadas e notas de calibração
// (notas append-only), escalonamentos, exceções e pausas.

export type MemoryGovernanceRepositories = Pick<
  EquipeRepositories,
  "calibrationRounds" | "calibrationScores" | "escalations" | "exceptions" | "pauses"
>;

export function makeMemoryGovernanceRepositories(
  store: MemoryEquipeStore
): MemoryGovernanceRepositories {
  return {
    calibrationRounds: makeMemoryAccountRepo({
      table: store.calibrationRounds,
      build: (scope, input) =>
        buildRow(scope, input, { status: "open", closedAt: null, decision: null }, "full"),
      uniques: [(row) => `${row.frontId}:${row.sequence}`, (row) => `${row.frontId}:${row.weekKey}`],
      validateCreate: checkFields(
        {
          status: equipeRoundStatusSchema,
          batchId: z.string().uuid(),
          weekKey: z.string().min(1),
        },
        ["batchId", "weekKey"]
      ),
      validatePatch: checkFields({ status: equipeRoundStatusSchema }),
    }),
    calibrationScores: makeMemoryAppendRepo({
      table: store.calibrationScores,
      build: (scope, input) =>
        buildRow(
          scope,
          input,
          { relaxed: false, rubric: null, feedback: null, evidence: null, scoredBy: null },
          "created"
        ),
      uniques: [(row) => `${row.roundId}:${row.itemId}:${row.versionHash}`],
      validateCreate: checkFields({ verdict: equipeScoreVerdictSchema }, ["verdict"]),
    }),
    escalations: makeMemoryAccountRepo({
      table: store.escalations,
      build: (scope, input) =>
        buildRow(
          scope,
          input,
          {
            status: "open",
            frontId: null,
            itemId: null,
            coOwnerRole: null,
            parts: null,
            dueAt: null,
            cause: null,
            lessonCandidate: null,
            resolvedAt: null,
          },
          "full"
        ),
      filter: (rows, filter) =>
        filter.itemId === undefined ? rows : rows.filter((row) => row.itemId === filter.itemId),
      validateCreate: checkFields(
        { severity: equipeSeveritySchema, status: equipeEscalationStatusSchema },
        ["severity"]
      ),
      validatePatch: checkFields({
        severity: equipeSeveritySchema,
        status: equipeEscalationStatusSchema,
      }),
    }),
    exceptions: makeMemoryAccountRepo({
      table: store.exceptions,
      build: (scope, input) =>
        buildRow(
          scope,
          input,
          {
            attempts: 0,
            ownerRole: "account_manager",
            status: "open",
            reason: null,
            dueAt: null,
            assigneeId: null,
            resolvedAt: null,
          },
          "full"
        ),
      validateCreate: checkFields({ status: equipeExceptionStatusSchema }),
      validatePatch: checkFields({ status: equipeExceptionStatusSchema }),
    }),
    pauses: makeMemoryAccountRepo({
      table: store.pauses,
      build: (scope, input) =>
        buildRow(
          scope,
          input,
          { status: "active", frontId: null, reason: null, liftedAt: null },
          "full"
        ),
      validateCreate: checkFields(
        {
          level: equipePauseLevelSchema,
          scope: equipePauseScopeSchema,
          status: equipePauseStatusSchema,
        },
        ["level", "scope"]
      ),
      validatePatch: checkFields({
        level: equipePauseLevelSchema,
        scope: equipePauseScopeSchema,
        status: equipePauseStatusSchema,
      }),
    }),
  };
}

// Parada global em memória (#583): sem escopo, uma ativa no máximo —
// espelha o índice parcial do banco (conflito vira EquipeConflictError).
export function makeMemoryGlobalStops(store: MemoryEquipeStore): EquipeGlobalStopRepository {
  const validate = checkFields({ status: equipeGlobalStopStatusSchema });
  const singleActive = (row: EquipeGlobalStop): string | null =>
    row.status === "active" ? "active" : null;
  return {
    async getActive() {
      const found = [...store.globalStops.rows.values()].find((row) => row.status === "active");
      return found ? copy(found) : null;
    },
    async create(input: NewEquipeGlobalStop) {
      validate(input);
      if (typeof input.reason !== "string" || typeof input.stoppedBy !== "string") {
        throw new Error("equipe_missing_global_stop_fields");
      }
      const now = new Date();
      const row: EquipeGlobalStop = {
        id: crypto.randomUUID(),
        status: "active",
        stoppedAt: now,
        liftedAt: null,
        liftedBy: null,
        liftReason: null,
        ...stripUndefined(input),
        createdAt: now,
        updatedAt: now,
      } as EquipeGlobalStop;
      assertUnique([...store.globalStops.rows.values()], row, [singleActive]);
      store.globalStops.rows.set(row.id, row);
      return copy(row);
    },
    async update(id: string, patch: EquipeGlobalStopPatch) {
      const current = store.globalStops.rows.get(id);
      if (!current) throw new EquipeNotFoundError("equipe_not_found");
      validate(patch);
      const next: EquipeGlobalStop = {
        ...current,
        ...stripUndefined(patch),
        id: current.id,
        updatedAt: new Date(),
      };
      assertUnique([...store.globalStops.rows.values()], next, [singleActive], current.id);
      store.globalStops.rows.set(id, next);
      return copy(next);
    },
  };
}
