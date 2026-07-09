import { isAllowedImageType, validateImageMagicBytes } from "@/lib/upload-config";

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

export async function uploadChatAttachment(file: File): Promise<ChatAttachment> {
  if (!isAllowedImageType(file.type)) {
    throw new Error("Tipo de arquivo não suportado. Use PNG, JPG ou WebP.");
  }

  if (!(await validateImageMagicBytes(file, file.type))) {
    throw new Error("Arquivo inválido ou corrompido.");
  }

  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("/api/workspace/assets", {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (typeof err.error === "string" && err.error) || "Falha ao enviar imagem"
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

export async function uploadChatAttachments(
  files: File[]
): Promise<ChatAttachment[]> {
  const uploaded: ChatAttachment[] = [];
  for (const file of files) {
    uploaded.push(await uploadChatAttachment(file));
  }
  return uploaded;
}
