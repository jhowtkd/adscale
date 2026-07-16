"use client";

import { useState, useCallback, useRef } from "react";
import { AnimatePresence, m } from "framer-motion";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useClientProfiles } from "@/lib/hooks/use-client-profiles";

interface NewCampaignForm {
  name: string;
  clientName: string;
}

interface FormErrors {
  name?: string;
  clientName?: string;
}

export interface NewCampaignSubmitData {
  name: string;
  client: string;
  clientProfileId: string | null;
}

interface NewCampaignModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: NewCampaignSubmitData) => void;
  initialValues?: { name: string; clientName: string } | null;
  templateName?: string | null;
  submitDisabled?: boolean;
}

export default function NewCampaignModal({
  open,
  onOpenChange,
  onSubmit,
  initialValues = null,
  templateName = null,
  submitDisabled = false,
}: NewCampaignModalProps) {
  const tCampaign = useTranslations("campaign");
  const tBriefing = useTranslations("briefing");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const tTemplate = useTranslations("template");

  const initialForm = {
    name: initialValues?.name ?? "",
    clientName: initialValues?.clientName ?? "",
  };
  const formSourceKey = `${open}\u0000${initialForm.name}\u0000${initialForm.clientName}`;
  const [appliedFormSourceKey, setAppliedFormSourceKey] = useState(formSourceKey);
  const [form, setForm] = useState<NewCampaignForm>(initialForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [clientProfileId, setClientProfileId] = useState<string | null>(null);
  const { data: clientProfiles = [] } = useClientProfiles();
  const touchedRef = useRef<Record<keyof NewCampaignForm, boolean>>({
    name: false,
    clientName: false,
  });

  if (appliedFormSourceKey !== formSourceKey) {
    setAppliedFormSourceKey(formSourceKey);
    setForm(initialForm);
    setErrors({});
    setClientProfileId(null);
  }

  const normalizedClient = form.clientName.trim().toLocaleLowerCase();
  const exactProfileMatch = normalizedClient
    ? clientProfiles.find(
      (profile) => profile.name.trim().toLocaleLowerCase() === normalizedClient
    )
    : undefined;
  const effectiveClientProfileId = clientProfileId ?? exactProfileMatch?.id ?? null;

  const updateField = useCallback(
    <K extends keyof NewCampaignForm>(field: K, value: NewCampaignForm[K]) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      if (touchedRef.current[field]) {
        setErrors((prev) => {
          const next = { ...prev };
          delete next[field as keyof FormErrors];
          return next;
        });
      }
    },
    []
  );

  const validate = useCallback((): boolean => {
    const newErrors: FormErrors = {};
    if (!form.name.trim()) newErrors.name = tErrors("nameRequired");
    if (!form.clientName.trim()) newErrors.clientName = tErrors("clientRequired");
    setErrors(newErrors);
    touchedRef.current = {
      name: true,
      clientName: true,
    };
    return Object.keys(newErrors).length === 0;
  }, [form, tErrors]);

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      if (submitDisabled) return;
      if (!validate()) return;
      onSubmit({
        name: form.name,
        client: form.clientName,
        clientProfileId: effectiveClientProfileId,
      });
    },
    [effectiveClientProfileId, form, validate, onSubmit, submitDisabled]
  );

  const handleCancel = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="sm"
        className="bg-[var(--surface-raised)] border border-[var(--border-dim)] p-0 gap-0"
      >
        <DialogHeader>
          <DialogTitle className="text-[18px] font-semibold text-[var(--text-primary)]">
            {tCampaign("createNew")}
          </DialogTitle>
          <DialogDescription className="text-sm text-[var(--text-secondary)]">
            {templateName
              ? tTemplate("prefilledFromTemplate", { name: templateName })
              : tCampaign("createDescription")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="campaign-name" className="text-[13px] text-[var(--text-secondary)]">
                {tCampaign("name")} <span className="text-[var(--accent-rose)]">*</span>
              </Label>
              <Input
                id="campaign-name"
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                onBlur={() => {
                  touchedRef.current = { ...touchedRef.current, name: true };
                }}
                placeholder={tBriefing("namePlaceholder")}
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? "name-error" : undefined}
                className={cn(
                  "bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
                  errors.name && "border-[var(--accent-rose)]"
                )}
              />
              <AnimatePresence>
                {errors.name && (
                  <m.p
                    id="name-error"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="text-xs text-[var(--accent-rose)]"
                  >
                    {errors.name}
                  </m.p>
                )}
              </AnimatePresence>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="campaign-client-profile" className="text-[13px] text-[var(--text-secondary)]">
                {tCampaign("clientProfile")}
              </Label>
              <select
                id="campaign-client-profile"
                value={effectiveClientProfileId ?? ""}
                onChange={(event) => {
                  const profile = clientProfiles.find(
                    (candidate) => candidate.id === event.target.value
                  );
                  setClientProfileId(profile?.id ?? null);
                  if (profile) updateField("clientName", profile.name);
                }}
                className="h-10 w-full rounded-[var(--radius-control)] border border-[var(--border-dim)] bg-[var(--surface-base)] px-3 text-sm text-[var(--text-primary)]"
              >
                <option value="">{tCampaign("customClient")}</option>
                {clientProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-[var(--text-muted)]">
                {tCampaign("clientProfileHint")}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="campaign-client" className="text-[13px] text-[var(--text-secondary)]">
                {tCampaign("client")} <span className="text-[var(--accent-rose)]">*</span>
              </Label>
              <Input
                id="campaign-client"
                value={form.clientName}
                onChange={(e) => {
                  updateField("clientName", e.target.value);
                  const normalizedClient = e.target.value.trim().toLocaleLowerCase();
                  const exactMatch = clientProfiles.find(
                    (profile) =>
                      profile.name.trim().toLocaleLowerCase() === normalizedClient
                  );
                  setClientProfileId(exactMatch?.id ?? null);
                }}
                onBlur={() => {
                  touchedRef.current = { ...touchedRef.current, clientName: true };
                }}
                placeholder={tBriefing("clientPlaceholder")}
                aria-invalid={!!errors.clientName}
                aria-describedby={errors.clientName ? "client-error" : undefined}
                className={cn(
                  "bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
                  errors.clientName && "border-[var(--accent-rose)]"
                )}
              />
              <AnimatePresence>
                {errors.clientName && (
                  <m.p
                    id="client-error"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="text-xs text-[var(--accent-rose)]"
                  >
                    {errors.clientName}
                  </m.p>
                )}
              </AnimatePresence>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              className="border-[var(--border-dim)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-base)]"
            >
              {tCommon("cancel")}
            </Button>
            <Button
              type="submit"
              disabled={submitDisabled}
              className="bg-[var(--accent-green)] text-[var(--accent-green-on-fill)] hover:opacity-90"
            >
              {tCommon("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
