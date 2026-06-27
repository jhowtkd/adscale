import type { GuidedCommandEnvelope } from "@/lib/guided-flow/commands";
import { emitGuidedFlowTelemetry } from "@/server/assistant/guided-flow-telemetry";
import {
  getGuidedFlowByThread,
  GuidedFlowRevisionConflictError,
  GuidedFlowValidationError,
  applyGuidedFlowCommand,
} from "@/server/repositories/guided-flow";
import { journeyStateFromRow } from "./state";
import { presentJourneyState } from "./presenter";
import {
  GuidedTransitionError,
  transitionJourney,
} from "./transition";

export class GuidedConversationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuidedConversationError";
  }
}

export async function applyGuidedConversationCommand(input: {
  workspaceId: string;
  threadId: string;
  clientProfileId: string;
  envelope: GuidedCommandEnvelope;
}) {
  const row = await getGuidedFlowByThread(input.workspaceId, input.threadId);

  if (!row) {
    if (input.envelope.expectedRevision !== 0) {
      throw new GuidedFlowRevisionConflictError("Guided flow not found", null);
    }

    if (input.envelope.command.type !== "select_path") {
      throw new GuidedFlowValidationError("Guided flow not found");
    }
  }

  const state = row
    ? journeyStateFromRow(row)
    : journeyStateFromRow({
        id: "pending",
        workspaceId: input.workspaceId,
        clientProfileId: input.clientProfileId,
        threadId: input.threadId,
        path: "unclassified",
        status: "active",
        currentStep: "start",
        slots: {},
        missingFields: [],
        assetIds: [],
        referenceIds: [],
        campaignId: null,
        revision: 0,
        schemaVersion: 1,
        recoverableError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

  if (state.revision !== input.envelope.expectedRevision) {
    throw new GuidedFlowRevisionConflictError(
      "Journey revision conflict",
      presentJourneyState(state)
    );
  }

  let transitionResult;
  try {
    transitionResult = transitionJourney(state, input.envelope.command);
  } catch (error) {
    if (error instanceof GuidedTransitionError) {
      throw new GuidedFlowValidationError(error.message);
    }
    throw error;
  }

  if (transitionResult.noop) {
    return {
      presentation: presentJourneyState(state, transitionResult.preview),
      guidedFlow: row,
      noop: true,
    };
  }

  const nextState = {
    ...transitionResult.state,
    revision: state.revision + 1,
  };

  const persisted = await applyGuidedFlowCommand({
    workspaceId: input.workspaceId,
    threadId: input.threadId,
    clientProfileId: input.clientProfileId,
    commandId: input.envelope.commandId,
    commandType: input.envelope.command.type,
    expectedRevision: input.envelope.expectedRevision,
    previousStep: state.currentStep,
    nextStep: nextState.currentStep,
    patch: {
      path: nextState.path,
      status: nextState.status,
      currentStep: nextState.currentStep,
      slots: nextState.slots as Record<string, unknown>,
      missingFields: nextState.missingFields,
      assetIds: nextState.assetIds,
      referenceIds: nextState.referenceIds,
      campaignId: nextState.campaignId,
      revision: nextState.revision,
      schemaVersion: nextState.schemaVersion,
      recoverableError: nextState.recoverableError,
    },
    metadata: {
      commandType: input.envelope.command.type,
    },
  });

  const presentation = presentJourneyState(journeyStateFromRow(persisted));

  emitGuidedFlowTelemetry({
    workspaceId: input.workspaceId,
    clientProfileId: input.clientProfileId,
    threadId: input.threadId,
    guidedFlowId: persisted.id,
    path: persisted.path,
    step: persisted.currentStep,
    eventKey: "guided_input_supplied",
    metadata: {
      inputType: input.envelope.command.type,
      reasonCode: "journey_command",
    },
  });

  return { presentation, guidedFlow: persisted, noop: false };
}
