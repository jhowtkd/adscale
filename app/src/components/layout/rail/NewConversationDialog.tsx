"use client";

// "Nova conversa" for the pilot: asks the topic, creates the Assistant thread and binds it to the account
// (`open_parallel_thread`) BEFORE opening it, so the conversation goes through the Strategist and the free ceiling.

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { equipeKeys } from "@/lib/equipe/use-equipe";
import { openParallelConversation, PARALLEL_TOPIC_MAX } from "@/lib/equipe/parallel-thread";

export default function NewConversationDialog({
  open,
  onOpenChange,
  accountId,
  clientProfileId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string | null;
  clientProfileId: string | null;
}) {
  const t = useTranslations("assistant.panel.dialog");
  const router = useRouter();
  const client = useQueryClient();
  const [topic, setTopic] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = Boolean(accountId && clientProfileId);

  const close = (next: boolean) => {
    if (pending) return;
    if (!next) {
      setTopic("");
      setError(null);
    }
    onOpenChange(next);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!accountId || !clientProfileId || pending) return;
    if (!topic.trim()) {
      setError(t("topicRequired"));
      return;
    }
    setPending(true);
    setError(null);
    try {
      const assistantThreadId = await openParallelConversation({ accountId, clientProfileId, topic });
      await client.invalidateQueries({ queryKey: equipeKeys(accountId).accountState });
      setTopic("");
      onOpenChange(false);
      router.push(`/assistant?threadId=${assistantThreadId}`);
    } catch {
      setError(t("error"));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent size="sm" data-testid="new-conversation-dialog">
        <form onSubmit={(event) => void submit(event)} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-2">
            <Label htmlFor="new-conversation-topic">{t("topicLabel")}</Label>
            <Input
              id="new-conversation-topic"
              value={topic}
              maxLength={PARALLEL_TOPIC_MAX}
              placeholder={t("topicPlaceholder")}
              disabled={pending}
              autoFocus
              onChange={(event) => setTopic(event.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "new-conversation-error" : undefined}
            />
            {error ? (
              <p id="new-conversation-error" role="alert" className="text-xs text-[var(--danger-text)]">
                {error}
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => close(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending || !ready}>
              {pending ? t("creating") : t("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
