"use client";

import { useTranslations } from "next-intl";
import { useCallback, useState, type FormEvent, type KeyboardEvent } from "react";
import { ImagePlus, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChatAttachment } from "@/lib/assistant/chat-attachments";
import { useChatComposerAttachments } from "@/lib/assistant/use-chat-composer-attachments";

export interface AssistantChatInputProps {
  disabled: boolean;
  isStreaming: boolean;
  noThread: boolean;
  onSend: (text: string, attachments?: ChatAttachment[]) => void;
  draftText?: string;
  onDraftTextChange?: (text: string) => void;
}

export default function AssistantChatInput({
  disabled,
  isStreaming,
  noThread,
  onSend,
  draftText,
  onDraftTextChange,
}: AssistantChatInputProps) {
  const t = useTranslations("assistant.chat");
  const [localValue, setLocalValue] = useState("");
  const isControlled = draftText !== undefined && onDraftTextChange !== undefined;
  const value = isControlled ? draftText : localValue;
  const setValue = isControlled ? onDraftTextChange : setLocalValue;
  const [uploadError, setUploadError] = useState<string | null>(null);

  const onUploadError = useCallback(
    (message: string) => setUploadError(message),
    []
  );

  const {
    attachments,
    isUploading,
    dragOver,
    fileInputRef,
    removeAttachment,
    clearAttachments,
    handleFileInputChange,
    dragHandlers,
    addFiles,
  } = useChatComposerAttachments({
    onError: onUploadError,
    maxAttachmentsError: t("maxAttachments"),
    invalidTypeError: t("attachmentTypeError"),
  });

  const canSend =
    !disabled &&
    !isStreaming &&
    !isUploading &&
    (value.trim().length > 0 || attachments.length > 0);

  const submit = () => {
    if (!canSend) {
      return;
    }
    onSend(value.trim(), attachments.length > 0 ? attachments : undefined);
    if (!isControlled) {
      setLocalValue("");
    }
    clearAttachments();
    setUploadError(null);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const file = Array.from(event.clipboardData.files).find((item) =>
      item.type.startsWith("image/")
    );
    if (!file) return;
    event.preventDefault();
    setUploadError(null);
    void addFiles([file]);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "border-t border-[var(--border-subtle)] bg-[var(--surface-base)] p-3",
        dragOver && "ring-2 ring-inset ring-[var(--accent-primary)]"
      )}
      data-testid="assistant-chat-input"
      {...dragHandlers}
    >
      {noThread ? (
        <p className="mb-2 text-xs text-[var(--text-muted)]">{t("noThreadHint")}</p>
      ) : null}

      {attachments.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <div
              key={attachment.assetId}
              className="relative"
              data-testid="assistant-chat-attachment-preview"
            >
              {attachment.url ? (
                <img
                  src={attachment.url}
                  alt={attachment.name}
                  className="h-16 w-16 rounded-md border border-[var(--border-dim)] object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-md border border-[var(--border-dim)] text-xs text-[var(--text-muted)]">
                  {attachment.name}
                </div>
              )}
              <button
                type="button"
                className="absolute -right-1 -top-1 rounded-full bg-[var(--surface-raised)] p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                aria-label={t("removeAttachment")}
                onClick={() => removeAttachment(attachment.assetId)}
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {uploadError ? (
        <p className="mb-2 text-xs text-[var(--danger-text)]" role="alert">
          {uploadError}
        </p>
      ) : null}

      <div
        className={cn(
          "flex items-end gap-2 rounded-[var(--radius-panel)] border border-[var(--border-default)] bg-[var(--surface-raised)] p-2",
          dragOver && "border-[var(--accent-primary)]"
        )}
        data-testid="assistant-chat-input-dropzone"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          data-testid="assistant-chat-file-input"
          onChange={(event) => handleFileInputChange(event.target.files)}
        />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled || isStreaming || isUploading}
          aria-label={t("addImage")}
          onClick={() => fileInputRef.current?.click()}
          className="shrink-0"
        >
          <ImagePlus className="size-4" aria-hidden="true" />
        </Button>
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          disabled={disabled || isStreaming}
          placeholder={t("inputPlaceholder")}
          rows={2}
          className={cn(
            "min-h-[2.5rem] flex-1 resize-none bg-transparent px-2 py-1 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          )}
        />
        <Button
          type="submit"
          size="icon"
          disabled={!canSend}
          aria-label={t("send")}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-control)] bg-[var(--accent-primary)] text-[var(--text-on-accent)] hover:bg-[var(--accent-primary)]"
        >
          <Send className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </form>
  );
}
