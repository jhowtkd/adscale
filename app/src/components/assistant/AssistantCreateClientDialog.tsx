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
import { useCreateClientProfile } from "@/lib/hooks/use-client-profiles";

export interface AssistantCreateClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (clientId: string) => void;
  labels?: Partial<{
    title: string;
    description: string;
    nameLabel: string;
    namePlaceholder: string;
    submit: string;
    cancel: string;
  }>;
}

export default function AssistantCreateClientDialog({
  open,
  onOpenChange,
  onSuccess,
  labels,
}: AssistantCreateClientDialogProps) {
  const t = useTranslations("assistant.createClient");
  const [name, setName] = useState("");
  const createClient = useCreateClientProfile();
  const copy = {
    title: t("title"),
    description: t("description"),
    nameLabel: t("nameLabel"),
    namePlaceholder: t("namePlaceholder"),
    submit: t("submit"),
    cancel: t("cancel"),
    ...labels,
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    createClient.mutate(
      { name: trimmed },
      {
        onSuccess: (profile) => {
          setName("");
          onOpenChange(false);
          onSuccess?.(profile.id);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>{copy.description}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="assistant-create-client-name">{copy.nameLabel}</Label>
              <Input
                id="assistant-create-client-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={copy.namePlaceholder}
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
              disabled={createClient.isPending}
            >
              {copy.cancel}
            </Button>
            <Button type="submit" disabled={!name.trim() || createClient.isPending}>
              {copy.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
