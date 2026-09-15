import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { processDictation, validateAudio } from "@/server/dictation/service";

/**
 * POST /api/creative-work/dictation — Ditado na caixa do pedido (#351).
 * multipart/form-data: audio (File), durationSeconds (number), workId? (uuid).
 * Não consome créditos e não passa pelo Generation Settlement (#352).
 * Áudio descartado após transcrever — nunca persistido.
 */
export async function POST(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);

    const form = await request.formData();
    const audio = form.get("audio");
    if (!validateAudio(audio)) {
      return apiError("dictationInvalidAudio", 400);
    }

    const durationSeconds = Number(form.get("durationSeconds"));
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      return apiError("dictationInvalidAudio", 400);
    }

    const rawWorkId = form.get("workId");
    let workId: string | undefined;
    if (typeof rawWorkId === "string" && rawWorkId.length > 0) {
      const parsed = z.string().uuid().safeParse(rawWorkId);
      if (!parsed.success) {
        return apiError("invalidInput", 400);
      }
      workId = parsed.data;
    }

    const result = await processDictation({
      workspaceId: workspace.id,
      audio,
      durationSeconds,
      workId,
    });

    if (!result.ok) {
      if (result.code === "daily_limit") {
        return apiError("dictationDailyLimit", 429, { usedSeconds: result.usedSeconds });
      }
      if (result.code === "invalid_work") {
        return apiError("invalidInput", 400);
      }
      return apiError("dictationTranscriptionFailed", 502);
    }

    return NextResponse.json(
      {
        text: result.text,
        cleaned: result.cleaned,
        detectedLanguage: result.detectedLanguage,
        rawLength: result.rawLength,
        cleanLength: result.cleanLength,
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error, "creative-work.dictation.POST");
  }
}
