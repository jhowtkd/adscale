"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCreateCampaign } from "@/lib/hooks/use-campaigns";
import { cn } from "@/lib/utils";

export function CreateCampaignDialog({
  activeProfile,
  onCreated,
  triggerClassName,
}: {
  activeProfile: { id: string; name: string } | null | undefined;
  onCreated: (campaignId: string) => Promise<boolean>;
  triggerClassName?: string;
}) {
  const t = useTranslations("dashboard.home");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [createdCampaignId, setCreatedCampaignId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const createCampaign = useCreateCampaign();
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeProfile || !name.trim()) return;
    setError(null);
    try {
      const campaignId = createdCampaignId ?? (await createCampaign.mutateAsync({
        name: name.trim(),
        client: activeProfile.name,
        clientProfileId: activeProfile.id,
      })).id;
      if (!createdCampaignId) setCreatedCampaignId(campaignId);
      if (await onCreated(campaignId)) {
        setName("");
        setCreatedCampaignId(null);
        setOpen(false);
      } else setError(t("campaignDialog.linkFailed"));
    } catch {
      setError(t("campaignDialog.createFailed"));
    }
  };
  return <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setCreatedCampaignId(null); }}>
    <button type="button" onClick={() => setOpen(true)} className={cn("inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[var(--border-default)] px-3 text-xs font-medium text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]", triggerClassName)}>
      <Plus size={16} aria-hidden="true" />{t("campaignDialog.open")}
    </button>
    <DialogContent size="sm" showCloseButton={!createCampaign.isPending}>
      <form onSubmit={(event) => void submit(event)}>
        <DialogHeader><DialogTitle>{t("campaignDialog.title")}</DialogTitle></DialogHeader>
        <DialogBody className="space-y-4">
          <label htmlFor="estudio-campaign-name" className="block text-sm font-medium text-[var(--text-primary)]">{t("campaignDialog.nameLabel")}<Input id="estudio-campaign-name" aria-label={t("campaignDialog.nameLabel")} required value={name} onChange={(event) => setName(event.target.value)} className="mt-1 bg-[var(--surface-raised)]" /></label>
          <p className="text-sm text-[var(--text-secondary)]"><span className="font-medium text-[var(--text-primary)]">{t("campaignDialog.brandLabel")}</span><br /><span className={activeProfile ? undefined : "text-[var(--warning-text)]"}>{activeProfile?.name ?? t("campaignDialog.noBrand")}</span></p>
          {error ? <p role="alert" className="text-sm text-[var(--danger-text)]">{error}</p> : null}
        </DialogBody>
        <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={createCampaign.isPending}>{t("campaignDialog.cancel")}</Button><Button type="submit" disabled={!activeProfile || !name.trim() || createCampaign.isPending}>{t("campaignDialog.submit")}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
