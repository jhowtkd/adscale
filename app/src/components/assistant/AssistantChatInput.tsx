"use client";

import { useTranslations } from "next-intl";
import { useCallback, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, ImagePlus, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChatAttachment } from "@/lib/assistant/chat-attachments";
import { useChatComposerAttachments } from "@/lib/assistant/use-chat-composer-attachments";
import { assistantIconSendClass } from "./assistant-chrome";

export interface AssistantChatInputProps {
  clientProfileId?: string | null;
  disabled: boolean;
  isStreaming: boolean;
  noThread: boolean;
  onSend: (text: string, attachments?: ChatAttachment[]) => void;
  draftText?: string;
  onDraftTextChange?: (text: string) => void;
  /** "rail": the pill composer of the pilot conversation (v4). */
  variant?: "classic" | "rail";
  /** False hides the attach button and ignores pasted or dropped images: the screen offers only what works. */
  attachmentsEnabled?: boolean;
}

export default function AssistantChatInput({
  clientProfileId,
  disabled,
  isStreaming,
  noThread,
  onSend,
  draftText,
  onDraftTextChange,
  variant = "classic",
  attachmentsEnabled = true,
}: AssistantChatInputProps) {
  const t = useTranslations("assistant.chat");
  const rail = variant === "rail";
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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
    clientProfileId,
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
    if (!attachmentsEnabled) return;
    const file = Array.from(event.clipboardData.files).find((item) =>
      item.type.startsWith("image/")
    );
    if (!file) return;
    event.preventDefault();
    setUploadError(null);
    void addFiles([file]);
  };

  // The pill grows with what is typed, up to a few lines, then scrolls.
  useLayoutEffect(() => {
    const field = textareaRef.current;
    if (!rail || !field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 128)}px`;
  }, [rail, value]);

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        rail
          ? "layer-sticky shrink-0 px-4 pb-3 pt-2 md:pb-8"
          : "layer-sticky shrink-0 border-t border-[var(--border-subtle)] bg-[var(--surface-base)] p-3",
        dragOver && attachmentsEnabled && "ring-2 ring-inset ring-[var(--selection-border)]"
      )}
      data-testid="assistant-chat-input"
      {...(attachmentsEnabled ? dragHandlers : {})}
    >
      {noThread ? (
        <p className="mb-2 text-xs text-[var(--text-muted)]">{t("noThreadHint")}</p>
      ) : null}

      {attachments.length > 0 ? (
        <div className={cn("mb-2 flex flex-wrap gap-2", rail && "mx-auto w-full max-w-[680px]")}>
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
        <p className={cn("mb-2 text-xs text-[var(--danger-text)]", rail && "mx-auto w-full max-w-[680px]")} role="alert">
          {uploadError}
        </p>
      ) : null}

      <div
        className={cn(
          rail
            ? "mx-auto flex w-full max-w-[680px] items-end gap-2 rounded-[28px] border border-[var(--border-default)] bg-[var(--surface-raised)] py-2 pl-4 pr-2 focus-within:ring-2 focus-within:ring-[var(--focus-ring)]"
            : "flex items-end gap-2 rounded-[var(--radius-panel)] border border-[var(--border-default)] bg-[var(--surface-raised)] p-2",
          dragOver && attachmentsEnabled && "border-[var(--selection-border)]"
        )}
        data-testid="assistant-chat-input-dropzone"
      >
        {attachmentsEnabled ? (
          <>
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
          </>
        ) : null}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          disabled={disabled || isStreaming}
          aria-label={t("inputPlaceholder")}
          placeholder={t("inputPlaceholder")}
          rows={rail ? 1 : 2}
          className={cn(
            "flex-1 resize-none bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
            rail ? "max-h-32 min-h-9 self-center px-1 py-[7px] leading-[22px]" : "min-h-[2.5rem] px-2 py-1"
          )}
        />
        {rail ? (
          <button
            type="submit"
            aria-disabled={!canSend ? true : undefined}
            aria-label={t("send")}
            className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--text-primary)] text-[var(--canvas)] outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] aria-disabled:cursor-default aria-disabled:hover:opacity-100"
          >
            <ArrowUp className="size-[18px]" aria-hidden="true" />
          </button>
        ) : (
          <Button
            type="submit"
            size="icon"
            variant="outline"
            disabled={!canSend}
            aria-label={t("send")}
            className={assistantIconSendClass}
          >
            <Send className="size-4" aria-hidden="true" />
          </Button>
        )}
      </div>
    </form>
  );
}
