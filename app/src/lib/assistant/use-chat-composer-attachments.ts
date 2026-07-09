"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
} from "react";
import {
  collectImageFiles,
  remainingAttachmentSlots,
  uploadChatAttachment,
  type ChatAttachment,
} from "@/lib/assistant/chat-attachments";

interface UseChatComposerAttachmentsOptions {
  onError?: (message: string) => void;
  maxAttachmentsError?: string;
  invalidTypeError?: string;
}

export function useChatComposerAttachments(
  options: UseChatComposerAttachmentsOptions = {}
) {
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const attachmentsRef = useRef(attachments);
  const [isUploading, setIsUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const uploadsInFlightRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  const beginUpload = useCallback(() => {
    uploadsInFlightRef.current += 1;
    setIsUploading(true);
  }, []);

  const endUpload = useCallback(() => {
    uploadsInFlightRef.current = Math.max(0, uploadsInFlightRef.current - 1);
    if (uploadsInFlightRef.current === 0) {
      setIsUploading(false);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const addFiles = useCallback(
    async (files: FileList | File[] | null | undefined) => {
      const snapshot = collectImageFiles(files);
      if (snapshot.length === 0) {
        if (files && files.length > 0 && options.invalidTypeError) {
          options.onError?.(options.invalidTypeError);
        }
        return;
      }

      const slots = remainingAttachmentSlots(attachmentsRef.current.length);
      if (slots <= 0) {
        if (options.maxAttachmentsError) {
          options.onError?.(options.maxAttachmentsError);
        }
        return;
      }

      const batch = snapshot.slice(0, slots);
      if (batch.length < snapshot.length && options.maxAttachmentsError) {
        options.onError?.(options.maxAttachmentsError);
      }

      beginUpload();
      try {
        for (const file of batch) {
          try {
            const uploaded = await uploadChatAttachment(file);
            setAttachments((prev) => {
              if (remainingAttachmentSlots(prev.length) <= 0) {
                return prev;
              }
              if (prev.some((item) => item.assetId === uploaded.assetId)) {
                return prev;
              }
              return [...prev, uploaded];
            });
          } catch (error) {
            options.onError?.(
              error instanceof Error ? error.message : "Falha ao enviar imagem"
            );
          }
        }
      } finally {
        endUpload();
      }
    },
    [
      beginUpload,
      endUpload,
      options.invalidTypeError,
      options.maxAttachmentsError,
      options.onError,
    ]
  );

  const removeAttachment = useCallback((assetId: string) => {
    setAttachments((prev) => prev.filter((item) => item.assetId !== assetId));
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments([]);
  }, []);

  const handleFileInputChange = useCallback(
    (files: FileList | null) => {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      void addFiles(files);
    },
    [addFiles]
  );

  const handleDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setDragOver(false);
      void addFiles(event.dataTransfer.files);
    },
    [addFiles]
  );

  return {
    attachments,
    isUploading,
    dragOver,
    fileInputRef,
    addFiles,
    removeAttachment,
    clearAttachments,
    handleFileInputChange,
    dragHandlers: {
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
    },
  };
}
