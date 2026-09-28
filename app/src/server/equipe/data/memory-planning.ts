import type { EquipeRepositories } from "./repositories";
import {
  buildRow,
  checkFields,
  makeMemoryAccountRepo,
  type MemoryEquipeStore,
} from "./memory-core";
import {
  equipeFrontKeySchema,
  equipeFrontStatusSchema,
  equipeIdeaKindSchema,
  equipeIdeaStatusSchema,
  equipeMandateStatusSchema,
  equipeOnboardingStatusSchema,
  equipeOnboardingStepKeySchema,
  equipeVersionStatusSchema,
} from "./types";

// Agregado implantação/planejamento em memória: frentes, etapas da
// implantação, contexto versionado, planos, mandatos e ideias.

export type MemoryPlanningRepositories = Pick<
  EquipeRepositories,
  "fronts" | "onboarding" | "contexts" | "plans" | "mandates" | "ideas"
>;

export function makeMemoryPlanningRepositories(
  store: MemoryEquipeStore
): MemoryPlanningRepositories {
  return {
    fronts: makeMemoryAccountRepo({
      table: store.fronts,
      build: (scope, input) =>
        buildRow(
          scope,
          input,
          {
            status: "draft",
            calibrationSequence: 0,
            roundsUsed: 0,
            releasedAt: null,
            calibrationStartedAt: null,
          },
          "full"
        ),
      uniques: [(row) => `${row.accountId}:${row.key}`],
      validateCreate: checkFields(
        { key: equipeFrontKeySchema, status: equipeFrontStatusSchema },
        ["key"]
      ),
      validatePatch: checkFields({ key: equipeFrontKeySchema, status: equipeFrontStatusSchema }),
    }),
    onboarding: makeMemoryAccountRepo({
      table: store.onboarding,
      build: (scope, input) =>
        buildRow(
          scope,
          input,
          {
            status: "pending",
            remindersSent: 0,
            remindersCap: 3,
            owner: null,
            dueAt: null,
            completedAt: null,
          },
          "full"
        ),
      uniques: [(row) => `${row.accountId}:${row.step}`],
      validateCreate: checkFields(
        { step: equipeOnboardingStepKeySchema, status: equipeOnboardingStatusSchema },
        ["step"]
      ),
      validatePatch: checkFields({
        step: equipeOnboardingStepKeySchema,
        status: equipeOnboardingStatusSchema,
      }),
    }),
    contexts: makeMemoryAccountRepo({
      table: store.contexts,
      build: (scope, input) =>
        buildRow(
          scope,
          input,
          { status: "draft", fields: {}, authorRole: null, authorId: null, receiptId: null },
          "full"
        ),
      uniques: [(row) => `${row.accountId}:${row.section}:${row.version}`],
      validateCreate: checkFields({ status: equipeVersionStatusSchema }),
      validatePatch: checkFields({ status: equipeVersionStatusSchema }),
    }),
    plans: makeMemoryAccountRepo({
      table: store.plans,
      build: (scope, input) =>
        buildRow(
          scope,
          input,
          { status: "draft", content: {}, receiptId: null, approvedAt: null },
          "full"
        ),
      uniques: [(row) => `${row.accountId}:${row.version}`],
      validateCreate: checkFields({ status: equipeVersionStatusSchema }),
      validatePatch: checkFields({ status: equipeVersionStatusSchema }),
    }),
    mandates: makeMemoryAccountRepo({
      table: store.mandates,
      build: (scope, input) =>
        buildRow(
          scope,
          input,
          {
            status: "draft",
            shadow: false,
            frontId: null,
            limits: null,
            window: null,
            validFrom: null,
            validUntil: null,
            stopCondition: null,
            receiptId: null,
          },
          "full"
        ),
      uniques: [(row) => `${row.accountId}:${row.version}`],
      validateCreate: checkFields({ status: equipeMandateStatusSchema }),
      validatePatch: checkFields({ status: equipeMandateStatusSchema }),
    }),
    ideas: makeMemoryAccountRepo({
      table: store.ideas,
      build: (scope, input) =>
        buildRow(
          scope,
          input,
          {
            status: "proposed",
            payload: {},
            resultingPlanVersion: null,
            resultingMandateVersion: null,
            decidedAt: null,
            receiptId: null,
          },
          "full"
        ),
      validateCreate: checkFields(
        { kind: equipeIdeaKindSchema, status: equipeIdeaStatusSchema },
        ["kind"]
      ),
      validatePatch: checkFields({ kind: equipeIdeaKindSchema, status: equipeIdeaStatusSchema }),
    }),
  };
}
