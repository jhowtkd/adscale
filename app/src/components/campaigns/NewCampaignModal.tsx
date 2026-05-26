"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import {
  Dialog,
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
import { ChevronDown, Upload, X } from "lucide-react";

// ============================================
// Types
// ============================================

interface NewCampaignForm {
  name: string;
  clientName: string;
  clientProfileId: string | null;
}

interface FormErrors {
  name?: string;
  clientName?: string;
  clientProfileId?: string;
}

interface NewCampaignModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    name: string;
    client: string;
    clientProfileId: string | null;
  }) => void;
}

// ============================================
// Component
// ============================================

export default function NewCampaignModal({
  open,
  onOpenChange,
  onSubmit,
}: NewCampaignModalProps) {
  const tCampaign = useTranslations("campaign");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");

  const { data: clientProfiles, isLoading: profilesLoading } = useClientProfiles();

  const [form, setForm] = useState<NewCampaignForm>({
    name: "",
    clientName: "",
    clientProfileId: null,
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const updateField = useCallback(
    <K extends keyof NewCampaignForm>(field: K, value: NewCampaignForm[K]) => {
      if (value === null) return;
      setForm((prev) => ({ ...prev, [field]: value }));
      if (touched[field]) {
        setErrors((prev) => {
          const next = { ...prev };
          delete next[field as keyof FormErrors];
          return next;
        });
      }
    },
    [touched]
  );

  const validate = useCallback((): boolean => {
    const newErrors: FormErrors = {};
    if (!form.name.trim()) newErrors.name = tErrors("nameRequired");
    if (!form.clientName.trim()) newErrors.clientName = tErrors("clientRequired");
    if (!form.clientProfileId) newErrors.clientProfileId = tErrors("clientProfileRequired");
    setErrors(newErrors);
    setTouched({
      name: true,
      clientName: true,
      clientProfileId: true,
    });
    return Object.keys(newErrors).length === 0;
  }, [form, tErrors]);

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!validate()) return;
      onSubmit({
        name: form.name,
        client: form.clientName,
        clientProfileId: form.clientProfileId,
      });
      setForm({
        name: "",
        clientName: "",
        clientProfileId: null,
      });
      setErrors({});
      setTouched({});
      setSelectedFile(null);
      onOpenChange(false);
    },
    [form, validate, onSubmit, onOpenChange]
  );

  const handleCancel = useCallback(() => {
    onOpenChange(false);
    setErrors({});
    setTouched({});
    setSelectedFile(null);
  }, [onOpenChange]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  }, []);

  const handleRemoveFile = useCallback(() => {
    setSelectedFile(null);
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[calc(100vh-2rem)] overflow-hidden bg-[var(--surface-raised)] border border-[var(--border-dim)] p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-[18px] font-semibold text-[var(--text-primary)]">
            {tCampaign("createNew")}
          </DialogTitle>
          <DialogDescription className="text-sm text-[var(--text-secondary)]">
            {tCampaign("createDescription")}
          </DialogDescription>
        </DialogHeader>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="max-h-[calc(100vh-10rem)] overflow-y-auto px-6 pb-4 space-y-5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {/* Campaign Name */}
          <div className="space-y-1.5">
            <Label className="text-[13px] text-[var(--text-secondary)]">
              {tCampaign("name")} <span className="text-[var(--accent-rose)]">*</span>
            </Label>
            <Input
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              onBlur={() => setTouched((p) => ({ ...p, name: true }))}
              placeholder={tCampaign("namePlaceholder")}
              className={cn(
                "bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
                errors.name && "border-[var(--accent-rose)]"
              )}
            />
            <AnimatePresence>
              {errors.name && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="text-xs text-[var(--accent-rose)]"
                >
                  {errors.name}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          {/* Client/Product Name */}
          <div className="space-y-1.5">
            <Label className="text-[13px] text-[var(--text-secondary)]">
              {tCampaign("client")} <span className="text-[var(--accent-rose)]">*</span>
            </Label>
            <Input
              value={form.clientName}
              onChange={(e) => updateField("clientName", e.target.value)}
              onBlur={() => setTouched((p) => ({ ...p, clientName: true }))}
              placeholder={tCampaign("clientPlaceholder")}
              className={cn(
                "bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
                errors.clientName && "border-[var(--accent-rose)]"
              )}
            />
            <AnimatePresence>
              {errors.clientName && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="text-xs text-[var(--accent-rose)]"
                >
                  {errors.clientName}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          {/* Client Profile */}
          <div className="space-y-1.5">
            <Label className="text-[13px] text-[var(--text-secondary)]">
              {tCampaign("clientProfile")} <span className="text-[var(--accent-rose)]">*</span>
            </Label>
            <div className="relative">
              <select
                value={form.clientProfileId ?? ""}
                onChange={(e) => updateField("clientProfileId", e.target.value || null)}
                onBlur={() => setTouched((p) => ({ ...p, clientProfileId: true }))}
                className={cn(
                  "w-full h-10 px-3 pr-10 bg-[var(--surface-base)] border rounded-md text-sm text-[var(--text-primary)] appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-[var(--accent-blue)] focus:border-[var(--accent-blue)]",
                  errors.clientProfileId && "border-[var(--accent-rose)]"
                )}
              >
                <option value="">{profilesLoading ? tCommon("loading") : tCampaign("selectClientProfile")}</option>
                {clientProfiles?.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={16}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none"
              />
            </div>
            <AnimatePresence>
              {errors.clientProfileId && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="text-xs text-[var(--accent-rose)]"
                >
                  {errors.clientProfileId}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          {/* Optional Upload */}
          <div className="space-y-1.5">
            <Label className="text-[13px] text-[var(--text-secondary)]">
              {tCampaign("keyCreative")} <span className="text-[var(--text-muted)]">({tCommon("optional")})</span>
            </Label>
            <div
              className={cn(
                "border border-dashed rounded-lg p-4 transition-colors",
                selectedFile
                  ? "border-[var(--accent-mint)] bg-[rgba(47,182,125,0.05)]"
                  : "border-[var(--border-dim)] hover:border-[var(--border-medium)] hover:bg-[var(--surface-raised)]"
              )}
            >
              {selectedFile ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Upload size={16} className="text-[var(--accent-mint)]" />
                    <span className="text-sm text-[var(--text-primary)] truncate max-w-[200px]">
                      {selectedFile.name}
                    </span>
                    <span className="text-xs text-[var(--text-muted)]">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveFile}
                    className="p-1 hover:bg-[var(--surface-base)] rounded"
                  >
                    <X size={14} className="text-[var(--text-muted)]" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center gap-2 cursor-pointer">
                  <Upload size={24} className="text-[var(--text-muted)]" />
                  <span className="text-sm text-[var(--text-secondary)]">
                    {tCampaign("uploadCreativeHint")}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">
                    PNG, JPG, WebP — {tCampaign("maxFileSize")}
                  </span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          </div>
        </form>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t border-[var(--border-dim)] flex-row justify-end gap-2">
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
            onClick={handleSubmit}
            className="bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue-light)]"
          >
            {tCommon("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
