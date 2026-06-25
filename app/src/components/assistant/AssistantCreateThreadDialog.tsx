"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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
import { useCreateAssistantThread } from "@/lib/hooks/use-assistant-threads";

export interface AssistantCreateThreadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientProfileId: string;
  campaignId?: string | null;
  onSuccess?: (threadId: string) => void;
}

export default function AssistantCreateThreadDialog({
  open,
  onOpenChange,
  clientProfileId,
  campaignId,
  onSuccess,
}: AssistantCreateThreadDialogProps) {
  const t = useTranslations("assistant.createThread");
  const [name, setName] = useState("");
  const createThread = useCreateAssistantThread();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !clientProfileId) return;

    createThread.mutate(
      {
        clientProfileId,
        ...(campaignId ? { campaignId } : {}),
        name: trimmed,
      },
      {
        onSuccess: (thread) => {
          setName("");
          onOpenChange(false);
          onSuccess?.(thread.id);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="assistant-create-thread-name">{t("nameLabel")}</Label>
              <Input
                id="assistant-create-thread-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("namePlaceholder")}
                autoFocus
                required
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createThread.isPending}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={!name.trim() || createThread.isPending}>
              {t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
