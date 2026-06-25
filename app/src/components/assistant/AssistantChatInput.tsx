"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface AssistantChatInputProps {
  disabled: boolean;
  isStreaming: boolean;
  noThread: boolean;
  onSend: (text: string) => void;
}

export default function AssistantChatInput({
  disabled,
  isStreaming,
  noThread,
  onSend,
}: AssistantChatInputProps) {
  const t = useTranslations("assistant.chat");
  const [value, setValue] = useState("");

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled || isStreaming) {
      return;
    }
    onSend(trimmed);
    setValue("");
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

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-[var(--border-dim)] bg-[var(--surface-base)] p-4"
      data-testid="assistant-chat-input"
    >
      {noThread ? (
        <p className="mb-2 text-xs text-[var(--text-muted)]">{t("noThreadHint")}</p>
      ) : null}
      <div className="flex items-end gap-2">
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || isStreaming}
          placeholder={t("inputPlaceholder")}
          rows={2}
          className={cn(
            "min-h-[44px] flex-1 resize-none rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] disabled:cursor-not-allowed disabled:opacity-50"
          )}
        />
        <Button
          type="submit"
          size="sm"
          disabled={disabled || isStreaming || !value.trim()}
          aria-label={t("send")}
        >
          <Send className="size-4" aria-hidden="true" />
          {t("send")}
        </Button>
      </div>
    </form>
  );
}
