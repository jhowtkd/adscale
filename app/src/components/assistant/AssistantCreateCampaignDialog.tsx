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
import { useCreateCampaign } from "@/lib/hooks/use-campaigns";

export interface AssistantCreateCampaignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientProfileId: string;
  onSuccess?: (campaignId: string) => void;
}

export default function AssistantCreateCampaignDialog({
  open,
  onOpenChange,
  clientProfileId,
  onSuccess,
}: AssistantCreateCampaignDialogProps) {
  const t = useTranslations("assistant.createCampaign");
  const tc = useTranslations("campaign");
  const [name, setName] = useState("");
  const createCampaign = useCreateCampaign();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !clientProfileId) return;

    createCampaign.mutate(
      {
        name: trimmed,
        client: tc("bootstrapDraftClient"),
        clientProfileId,
      },
      {
        onSuccess: (campaign) => {
          setName("");
          onOpenChange(false);
          onSuccess?.(campaign.id);
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
              <Label htmlFor="assistant-create-campaign-name">{t("nameLabel")}</Label>
              <Input
                id="assistant-create-campaign-name"
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
              disabled={createCampaign.isPending}
            >
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || createCampaign.isPending}
            >
              {t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
