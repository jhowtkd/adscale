import type { EquipeRepositories } from "./repositories";
import {
  buildRow,
  checkFields,
  makeMemoryAccountRepo,
  makeMemoryAppendRepo,
  type MemoryEquipeStore,
} from "./memory-core";
import {
  equipeEscalationStatusSchema,
  equipeExceptionStatusSchema,
  equipePauseLevelSchema,
  equipePauseScopeSchema,
  equipePauseStatusSchema,
  equipeRoundStatusSchema,
  equipeScoreVerdictSchema,
  equipeSeveritySchema,
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
      uniques: [(row) => `${row.frontId}:${row.sequence}`],
      validateCreate: checkFields({ status: equipeRoundStatusSchema }),
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
