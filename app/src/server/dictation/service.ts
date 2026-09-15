import "server-only";
import { toFile } from "openai";
import { and, eq, gte } from "drizzle-orm";
import { getOpenAI } from "@/server/ai/utils";
import { db } from "@/server/db";
import { creativeWorkItems, usageEvents } from "@/server/db/schema";
import { trackUsage } from "@/server/repositories/usage";
import { resolveCleanText } from "./checker";

/** Motor da v1 (#350): servidor, sem `language` (detecção automática). */
export const DICTATION_TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";
/** Segundo passo: limpeza leve num modelo de texto barato. */
export const DICTATION_CLEANUP_MODEL = "gpt-4o-mini";
/** Teto antiabuso: 15 min de áudio por dia UTC, por workspace (#352). */
export const DICTATION_DAILY_LIMIT_SECONDS = 15 * 60;
/** Teto por take: 2 min (#351). Folga de 60 s na contabilidade p/ skew de relógio. */
const MAX_ACCOUNTED_SECONDS = 180;
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

const CLEANUP_SYSTEM_PROMPT = [
  "Você recebe a transcrição bruta de um ditado em português (pode conter marcas e termos em inglês).",
  "Devolva o texto com limpeza leve: remova apenas hesitações e muletas (é…, tipo, né, ahn, hum), repetições imediatas de palavras, e ajuste pontuação e capitalização.",
  "NUNCA: reordene frases, resuma, traduza, troque palavras por sinônimos, corrija concordância, resolva autocorreções do falante, complete frases ou preencha lacunas.",
  "Devolva SÓ o texto limpo, sem aspas nem comentários.",
].join(" ");

function utcMidnight(): Date {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  return now;
}

export async function getDictatedSecondsToday(workspaceId: string): Promise<number> {
  const rows = await db
    .select({ amount: usageEvents.amount })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.workspaceId, workspaceId),
        eq(usageEvents.type, "dictation"),
        gte(usageEvents.createdAt, utcMidnight())
      )
    );
  return rows.reduce((sum, row) => sum + (row.amount ?? 0), 0);
}

export interface DictationInput {
  workspaceId: string;
  /** Blob de áudio do MediaRecorder. Nunca persistido — só memória. */
  audio: File;
  /** Duração medida no cliente; direção segura (superestimar come a cota de quem dita). */
  durationSeconds: number;
  workId?: string;
}

export type DictationResult =
  | {
      ok: true;
      text: string;
      cleaned: boolean;
      detectedLanguage: string | null;
      rawLength: number;
      cleanLength: number;
    }
  | { ok: false; code: "daily_limit"; usedSeconds: number }
  | { ok: false; code: "invalid_work" }
  | { ok: false; code: "transcription_failed" };

export async function processDictation(input: DictationInput): Promise<DictationResult> {
  const seconds = Math.min(Math.max(Math.ceil(input.durationSeconds), 1), MAX_ACCOUNTED_SECONDS);

  const usedSeconds = await getDictatedSecondsToday(input.workspaceId);
  if (usedSeconds + seconds > DICTATION_DAILY_LIMIT_SECONDS) {
    return { ok: false, code: "daily_limit", usedSeconds };
  }

  if (input.workId) {
    const work = await db
      .select({ id: creativeWorkItems.id })
      .from(creativeWorkItems)
      .where(
        and(
          eq(creativeWorkItems.id, input.workId),
          eq(creativeWorkItems.workspaceId, input.workspaceId)
        )
      )
      .limit(1);
    if (!work[0]) {
      return { ok: false, code: "invalid_work" };
    }
  }

  let raw: string;
  let detectedLanguage: string | null = null;
  try {
    const extension = input.audio.type.includes("mp4") ? "m4a" : "webm";
    const file = await toFile(Buffer.from(await input.audio.arrayBuffer()), `dictation.${extension}`, {
      type: input.audio.type || "audio/webm",
    });
    const transcription = await getOpenAI().audio.transcriptions.create({
      file,
      model: DICTATION_TRANSCRIBE_MODEL,
    });
    raw = transcription.text?.trim() ?? "";
    detectedLanguage =
      (transcription as { language?: string }).language ?? null;
  } catch {
    return { ok: false, code: "transcription_failed" };
  }
  if (!raw) {
    return { ok: false, code: "transcription_failed" };
  }

  let candidate: string | null = null;
  try {
    const completion = await getOpenAI().chat.completions.create({
      model: DICTATION_CLEANUP_MODEL,
      messages: [
        { role: "system", content: CLEANUP_SYSTEM_PROMPT },
        { role: "user", content: raw },
      ],
    });
    candidate = completion.choices[0]?.message?.content?.trim() || null;
  } catch {
    // Limpeza é opcional: sem ela, o bruto segue (editável pelo operador).
    candidate = null;
  }

  const { text, cleaned, offendingWord } = resolveCleanText(raw, candidate);

  await trackUsage(input.workspaceId, "dictation", seconds, {
    rawLength: raw.length,
    cleanLength: text.length,
    detectedLanguage,
    cleaned,
    checkerOffending: offendingWord ?? null,
    workId: input.workId ?? null,
  });

  if (input.workId) {
    await db
      .update(creativeWorkItems)
      .set({ hasDictatedExcerpt: true })
      .where(eq(creativeWorkItems.id, input.workId));
  }

  return {
    ok: true,
    text,
    cleaned,
    detectedLanguage,
    rawLength: raw.length,
    cleanLength: text.length,
  };
}

export function validateAudio(file: unknown): file is File {
  return (
    typeof File !== "undefined" &&
    file instanceof File &&
    file.size > 0 &&
    file.size <= MAX_AUDIO_BYTES
  );
}
