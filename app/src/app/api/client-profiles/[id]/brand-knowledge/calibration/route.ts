import { NextResponse } from "next/server";

import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  assessCalibrationSlot,
  CALIBRATION_FORMAT,
  calibrationCommandSchema,
  calibrationCredits,
} from "@/server/brand-training/calibration";
import {
  BrandCalibrationError,
  buildCalibrationCandidate,
  startBrandCalibration,
} from "@/server/application/calibrate-brand-training";
import { BrandKnowledgeCompilationError } from "@/server/brand-knowledge/version-compiler";
import {
  BrandKnowledgeEvidenceError,
  getActiveBrandKnowledgeVersion,
} from "@/server/repositories/brand-knowledge";
import {
  BrandTrainingSessionError,
  createTrainingSession,
  getTrainingSession,
  getTrainingSessionById,
  mutateTrainingSession,
} from "@/server/repositories/brand-training-sessions";
import { getCreativeWork } from "@/server/repositories/creative-work";
import { getClientProfile } from "@/server/repositories/client-reference";

function calibrationErrorResponse(error: unknown, scope: string) {
  if (error instanceof BrandTrainingSessionError) {
    switch (error.code) {
      case "not_found":
        return apiError("brandCalibrationNotFound", 404);
      case "stale_session":
        return apiError("stale_input", 409);
      case "round_running":
        return apiError("brandCalibrationRunning", 409);
      case "round_limit":
        return apiError("brandCalibrationRoundLimit", 409);
      case "invalid_feedback":
        return apiError("invalidInput", 400, { detail: error.message });
      case "session_closed":
        return apiError("brandCalibrationClosed", 409);
    }
  }
  if (error instanceof BrandCalibrationError) {
    switch (error.code) {
      case "quote_changed":
        return apiError("brandCalibrationQuoteChanged", 409);
      case "credit_blocked":
        return apiError("insufficientCredits", 402);
      case "invalid_context":
        return apiError("brandCalibrationInvalid", 409, { detail: error.message });
      case "not_found":
        return apiError("brandCalibrationNotFound", 404);
    }
  }
  if (error instanceof BrandKnowledgeCompilationError || error instanceof BrandKnowledgeEvidenceError) {
    return apiError("invalidInput", 409, { detail: error.message });
  }
  return handleApiError(error, scope);
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [{ workspace }, { id }] = await Promise.all([requireWorkspaceAccess(request), params]);
    if (!(await getClientProfile(workspace.id, id))) return apiError("clientProfileNotFound", 404);
    const [session, active] = await Promise.all([
      getTrainingSession(workspace.id, id),
      getActiveBrandKnowledgeVersion(workspace.id, id),
    ]);
    const latest = session?.rounds[session.rounds.length - 1] ?? null;
    const examples = latest
      ? await Promise.all(
          latest.slots.map(async (slot) => {
            const aggregate = await getCreativeWork(workspace.id, slot.workItemId);
            const output =
              aggregate?.outputs.find((candidate) => candidate.id === slot.outputId) ??
              aggregate?.outputs[0] ??
              null;
            const outputId = output?.id ?? slot.outputId;
            return {
              workItemId: slot.workItemId,
              outputId,
              previewUrl: outputId
                ? `/api/creative-work/${slot.workItemId}/outputs/${outputId}/download`
                : null,
              assessment: assessCalibrationSlot({
                output: output
                  ? { id: output.id, status: output.status, quality: output.quality }
                  : null,
                outputId,
                feedback: slot.feedback,
              }),
            };
          }),
        )
      : [];
    return NextResponse.json({
      session,
      activeVersionId: active?.id ?? null,
      quoteCredits: calibrationCredits(CALIBRATION_FORMAT),
      examples,
    });
  } catch (error) {
    return calibrationErrorResponse(error, "client-profiles.[id].brand-knowledge.calibration.GET");
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [{ user, workspace }, { id }, body] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
      request.json().catch(() => null),
    ]);
    if (!(await getClientProfile(workspace.id, id))) return apiError("clientProfileNotFound", 404);
    const parsed = calibrationCommandSchema.safeParse(body);
    if (!parsed.success) return apiError("invalidInput", 400, parsed.error.flatten());
    const command = parsed.data;

    if (command.action === "create") {
      const [existing, active] = await Promise.all([
        getTrainingSession(workspace.id, id),
        getActiveBrandKnowledgeVersion(workspace.id, id),
      ]);
      if ((active?.id ?? null) !== command.expectedActiveVersionId) {
        return apiError("brandCalibrationStale", 409);
      }
      if (existing) return NextResponse.json({ session: existing });
      // The candidate is compiled server-side from reviewed claims and the
      // complete identity — the browser never supplies snapshots, hashes or
      // authorship. This command generates no images and charges nothing.
      const candidate = await buildCalibrationCandidate({ workspaceId: workspace.id, profileId: id });
      const session = await createTrainingSession({
        workspaceId: workspace.id,
        profileId: id,
        userId: user.id,
        candidate,
        baseVersionId: active?.id ?? null,
      });
      return NextResponse.json({ session }, { status: 201 });
    }

    if (command.action === "start") {
      const started = await startBrandCalibration({
        workspaceId: workspace.id,
        profileId: id,
        sessionId: command.sessionId,
        userId: user.id,
        expectedRevision: command.expectedRevision,
        acceptedCredits: command.acceptedCredits,
      });
      const session = await getTrainingSessionById(workspace.id, id, command.sessionId);
      return NextResponse.json({ session, round: started.round, workItemIds: started.workItemIds }, { status: 202 });
    }

    if (command.action === "feedback") {
      const session = await mutateTrainingSession({
        workspaceId: workspace.id,
        profileId: id,
        sessionId: command.sessionId,
        expectedRevision: command.expectedRevision,
        command: {
          type: "feedback",
          round: command.round,
          slot: command.slot,
          rating: command.rating,
          note: command.note,
          dimensions: command.dimensions,
          actorId: user.id,
        },
      });
      return NextResponse.json({ session });
    }

    const session = await mutateTrainingSession({
      workspaceId: workspace.id,
      profileId: id,
      sessionId: command.sessionId,
      expectedRevision: command.expectedRevision,
      command: command.action === "extend" ? { type: "extend" } : { type: "archive" },
    });
    return NextResponse.json({ session });
  } catch (error) {
    return calibrationErrorResponse(error, "client-profiles.[id].brand-knowledge.calibration.POST");
  }
}
