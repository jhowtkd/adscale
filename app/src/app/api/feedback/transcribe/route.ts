import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/with-rate-limit";
import { getOpenAI } from "@/server/ai/utils";
import { requireWorkspaceAccess } from "@/server/auth/workspace";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const MAX_MULTIPART_BYTES = MAX_AUDIO_BYTES + 1024 * 1024;
const ALLOWED_AUDIO_TYPES = new Set([
  "audio/webm", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-wav", "audio/ogg",
]);

export async function POST(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const limited = await checkRateLimit(request, { category: "ai", workspaceId: workspace.id });
    if (limited) return limited;

    let formData: FormData | null;
    try {
      formData = await readBoundedFormData(request);
    } catch {
      return apiError("invalidAudio", 400);
    }
    if (!formData) return apiError("audioTooLarge", 413);
    const files = formData.getAll("file");
    if (files.length !== 1 || [...formData.keys()].some((key) => key !== "file")) return apiError("invalidAudio", 400);
    const file = files[0];
    if (!(file instanceof File) || file.size === 0) return apiError("invalidAudio", 400);
    if (file.size > MAX_AUDIO_BYTES) return apiError("audioTooLarge", 413);
    const baseType = file.type.toLowerCase().split(";", 1)[0];
    if (!ALLOWED_AUDIO_TYPES.has(baseType)) return apiError("unsupportedAudioType", 400);

    let result;
    try {
      result = await getOpenAI().audio.transcriptions.create({
        file,
        model: "gpt-4o-mini-transcribe",
        language: "pt",
        response_format: "json",
      });
    } catch {
      return apiError("internalError", 502);
    }
    const text = result.text.trim().slice(0, 4_000);
    if (!text) return apiError("noSpeechRecognized", 422);
    return NextResponse.json({ text });
  } catch (error) {
    return handleApiError(error, "feedback.transcribe.POST");
  }
}

async function readBoundedFormData(request: Request): Promise<FormData | null> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MULTIPART_BYTES) return null;
  if (!request.body) return request.formData();

  const reader = request.body.getReader();
  const chunks: ArrayBuffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_MULTIPART_BYTES) {
        return null;
      }
      chunks.push(value.slice().buffer);
    }
  } finally {
    reader.releaseLock();
  }

  const headers = new Headers(request.headers);
  headers.delete("content-length");
  return new Request(request.url, {
    method: request.method,
    headers,
    body: new Blob(chunks, { type: headers.get("content-type") ?? undefined }),
  }).formData();
}
