import { SVG_LOGO_TYPE, isAllowedImageType, validateImageMagicBytes } from "@/lib/upload-config";
import { useAppStore } from "@/lib/store";

/** Matches `attachments.max(5)` on the assistant chat API route. */
export const MAX_CHAT_ATTACHMENTS = 5;

export interface ChatAttachment {
  assetId: string;
  key: string;
  url?: string;
  type: string;
  name: string;
  size: number;
}

export function collectImageFiles(
  files: FileList | File[] | null | undefined
): File[] {
  if (!files) return [];
  return Array.from(files).filter((file) => isAllowedImageType(file.type));
}

export function remainingAttachmentSlots(currentCount: number): number {
  return Math.max(0, MAX_CHAT_ATTACHMENTS - currentCount);
}

/** The server refused the file; `code` is the one it answered with (`svgUnreadable` for an SVG it could not turn into a logo). */
export class ChatAttachmentUploadError extends Error {
  constructor(message: string, readonly code?: string) { super(message); this.name = "ChatAttachmentUploadError"; }
}

export async function uploadChatAttachment(file: File, scope?: { handoffId?: string; clientProfileId?: string | null; asLogo?: boolean }): Promise<ChatAttachment> {
  // The brand logo of a handoff may be an SVG: the server draws it as a PNG and keeps only that (it is never stored, nor served, as an SVG).
  const svgLogo = scope?.asLogo === true && Boolean(scope.handoffId) && file.type === SVG_LOGO_TYPE;
  if (!svgLogo) {
    if (!isAllowedImageType(file.type)) {
      throw new Error("Tipo de arquivo não suportado. Use PNG, JPG ou WebP.");
    }

    if (!(await validateImageMagicBytes(file, file.type))) {
      throw new Error("Arquivo inválido ou corrompido.");
    }
  }

  const formData = new FormData();
  formData.append("file", file);
  if (scope?.handoffId) formData.append("handoffId", scope.handoffId);
  // The logo of a handoff says so (an SVG must, to be taken at all): the server measures it for the plate it asks for (ticket 16). The images of the handoff, and every other upload, say nothing.
  if (scope?.asLogo === true && scope.handoffId) formData.append("purpose", "logo");
  if (!scope?.handoffId && scope?.clientProfileId === null) throw new Error("Selecione uma marca antes de enviar imagens.");
  const clientProfileId = scope?.clientProfileId ?? (!scope?.handoffId ? useAppStore.getState().activeClientProfileId : null);
  if (clientProfileId) formData.append("clientProfileId", clientProfileId);

  const res = await fetch("/api/workspace/assets", {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ChatAttachmentUploadError(
      (typeof err.error === "string" && err.error) || "Falha ao enviar imagem",
      typeof err.code === "string" ? err.code : undefined
    );
  }

  const data = (await res.json()) as {
    asset: {
      id: string;
      key: string;
      url: string;
      type: string;
      name: string;
      size: number;
    };
  };

  return {
    assetId: data.asset.id,
    key: data.asset.key,
    url: data.asset.url,
    type: data.asset.type,
    name: data.asset.name,
    size: data.asset.size,
  };
}
