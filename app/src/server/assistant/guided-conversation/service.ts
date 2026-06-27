import type { GuidedCommandEnvelope } from "@/lib/guided-flow/commands";
import { createHash } from "node:crypto";
import { emitGuidedFlowTelemetry } from "@/server/assistant/guided-flow-telemetry";
import { analyzeExistingCreativeForJourney } from "@/server/assistant/guided-paths/existing-creative";
import { getClientReferencesByIds } from "@/server/repositories/client-reference";
import { getWorkspaceAssetById } from "@/server/repositories/workspace-asset";
import { getGuidedFlowTransitionByCommand } from "@/server/repositories/guided-flow-transition";
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

function commandHash(command: GuidedCommandEnvelope["command"]): string {
  return createHash("sha256").update(JSON.stringify(command)).digest("hex");
}

async function assertScopedReferences(input: {
  workspaceId: string;
  clientProfileId: string;
  referenceIds: string[];
}) {
  const uniqueIds = [...new Set(input.referenceIds)];
  const clientReferences = await getClientReferencesByIds(input.workspaceId, uniqueIds);
  const validClientIds = new Set(
    clientReferences
      .filter((reference) => reference.clientProfileId === input.clientProfileId)
      .map((reference) => reference.id)
  );

  const unresolved = uniqueIds.filter((id) => !validClientIds.has(id));
  const workspaceAssets = await Promise.all(
    unresolved.map((id) => getWorkspaceAssetById(id, input.workspaceId))
  );
  const validWorkspaceIds = new Set(
    workspaceAssets.filter(Boolean).map((asset) => asset!.id)
  );

  const invalid = uniqueIds.filter(
    (id) => !validClientIds.has(id) && !validWorkspaceIds.has(id)
  );
  if (invalid.length > 0) {
    throw new GuidedFlowValidationError("References must belong to the current client or workspace");
  }
  return uniqueIds;
}

export async function applyGuidedConversationCommand(input: {
  workspaceId: string;
  threadId: string;
  clientProfileId: string;
  envelope: GuidedCommandEnvelope;
}) {
  const row = await getGuidedFlowByThread(input.workspaceId, input.threadId);

  if (row) {
    const prior = await getGuidedFlowTransitionByCommand(
      row.id,
      input.envelope.commandId
    );
    if (prior) {
      if (prior.metadata?.commandHash !== commandHash(input.envelope.command)) {
        throw new GuidedFlowValidationError("Command id was reused with a different payload");
      }
      const current = journeyStateFromRow(row);
      return {
        presentation: presentJourneyState(current),
        guidedFlow: row,
        noop: true,
      };
    }
  }

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
    emitGuidedFlowTelemetry({
      workspaceId: input.workspaceId,
      clientProfileId: input.clientProfileId,
      threadId: input.threadId,
      guidedFlowId: row?.id,
      path: state.path,
      step: state.currentStep,
      eventKey: "guided_action_blocked",
      blockerCategory: "validation_error",
      metadata: {
        commandType: input.envelope.command.type,
        reasonCode: "revision_conflict",
        revision: state.revision,
      },
    });
    throw new GuidedFlowRevisionConflictError(
      "Journey revision conflict",
      presentJourneyState(state)
    );
  }

  let resolvedCommand: Parameters<typeof transitionJourney>[1] = input.envelope.command;
  if (input.envelope.command.type === "select_creative") {
    const analysis = await analyzeExistingCreativeForJourney({
      workspaceId: input.workspaceId,
      threadId: input.threadId,
      clientProfileId: input.clientProfileId,
      workspaceAssetId: input.envelope.command.workspaceAssetId,
    });
    resolvedCommand = {
      type: "apply_creative_analysis",
      workspaceAssetId: analysis.workspaceAssetId,
      diagnosis: analysis.diagnosis as unknown as Record<string, unknown>,
      briefingSnapshot: analysis.briefingSnapshot as unknown as Record<string, unknown>,
      assumptions: analysis.assumptions,
      missingFields: analysis.missingFields,
    };
  }

  if (input.envelope.command.type === "set_references") {
    resolvedCommand = {
      ...input.envelope.command,
      referenceIds: await assertScopedReferences({
        workspaceId: input.workspaceId,
        clientProfileId: input.clientProfileId,
        referenceIds: input.envelope.command.referenceIds,
      }),
    };
  }

  let transitionResult;
  try {
    transitionResult = transitionJourney(state, resolvedCommand);
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
      commandHash: commandHash(input.envelope.command),
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
      commandType: input.envelope.command.type,
      reasonCode: "journey_command",
      revision: persisted.revision,
    },
  });

  return { presentation, guidedFlow: persisted, noop: false };
}
