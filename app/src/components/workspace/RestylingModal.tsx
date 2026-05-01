"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface RestylingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface RestylingForm {
  name: string;
  client: string;
  offer: string;
  ctaText: string;
  notes: string;
}

interface FormErrors {
  name?: string;
  baseImage?: string;
  styleImage?: string;
}

export default function RestylingModal({ open, onOpenChange }: RestylingModalProps) {
  const t = useTranslations("restyling");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const router = useRouter();

  const [form, setForm] = useState<RestylingForm>({
    name: "",
    client: "",
    offer: "",
    ctaText: "",
    notes: "",
  });
  const [baseImage, setBaseImage] = useState<File | null>(null);
  const [styleImage, setStyleImage] = useState<File | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateField = useCallback(<K extends keyof RestylingForm>(field: K, value: RestylingForm[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field as keyof FormErrors]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field as keyof FormErrors];
        return next;
      });
    }
  }, [errors]);

  const validate = useCallback((): boolean => {
    const newErrors: FormErrors = {};
    if (!form.name.trim()) {
      newErrors.name = tErrors("nameRequired");
    }
    if (!baseImage) {
      newErrors.baseImage = t("baseImageRequired");
    }
    if (!styleImage) {
      newErrors.styleImage = t("styleImageRequired");
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form.name, baseImage, styleImage, tErrors, t]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("name", form.name.trim());
      formData.append("client", form.client.trim());
      formData.append("offer", form.offer.trim());
      formData.append("ctaText", form.ctaText.trim());
      formData.append("notes", form.notes.trim());
      if (baseImage) formData.append("baseImage", baseImage);
      if (styleImage) formData.append("styleImage", styleImage);

      const res = await fetch("/api/quick-tools/restyling", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Submission failed");
      }

      const data = await res.json();
      onOpenChange(false);
      router.push(data.redirectUrl || `/campaigns/${data.campaignId}`);
    } catch (err) {
      console.error("[RestylingModal] submit error:", err);
      setErrors({ name: err instanceof Error ? err.message : "Submission failed" });
    } finally {
      setIsSubmitting(false);
    }
  }, [form, baseImage, styleImage, validate, onOpenChange, router, t]);

  const handleBaseImageChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setBaseImage(file);
    if (errors.baseImage) setErrors((prev) => { const n = { ...prev }; delete n.baseImage; return n; });
  }, [errors.baseImage]);

  const handleStyleImageChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setStyleImage(file);
    if (errors.styleImage) setErrors((prev) => { const n = { ...prev }; delete n.styleImage; return n; });
  }, [errors.styleImage]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="restyling-name">{t("nameLabel")}</Label>
            <Input
              id="restyling-name"
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder={t("namePlaceholder")}
              disabled={isSubmitting}
            />
            {errors.name && <p className="text-sm text-red-500">{errors.name}</p>}
          </div>

          {/* Client */}
          <div className="space-y-1.5">
            <Label htmlFor="restyling-client">{t("clientLabel")}</Label>
            <Input
              id="restyling-client"
              value={form.client}
              onChange={(e) => updateField("client", e.target.value)}
              placeholder={t("clientPlaceholder")}
              disabled={isSubmitting}
            />
          </div>

          {/* Offer */}
          <div className="space-y-1.5">
            <Label htmlFor="restyling-offer">{t("offerLabel")}</Label>
            <Input
              id="restyling-offer"
              value={form.offer}
              onChange={(e) => updateField("offer", e.target.value)}
              placeholder={t("offerPlaceholder")}
              disabled={isSubmitting}
            />
          </div>

          {/* CTA Text */}
          <div className="space-y-1.5">
            <Label htmlFor="restyling-cta">{t("ctaLabel")}</Label>
            <Input
              id="restyling-cta"
              value={form.ctaText}
              onChange={(e) => updateField("ctaText", e.target.value)}
              placeholder={t("ctaPlaceholder")}
              disabled={isSubmitting}
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="restyling-notes">{t("notesLabel")}</Label>
            <Textarea
              id="restyling-notes"
              value={form.notes}
              onChange={(e) => updateField("notes", e.target.value)}
              placeholder={t("notesPlaceholder")}
              rows={3}
              disabled={isSubmitting}
            />
          </div>

          {/* Base Image */}
          <div className="space-y-1.5">
            <Label htmlFor="restyling-base-image">{t("baseImageLabel")}</Label>
            <Input
              id="restyling-base-image"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleBaseImageChange}
              disabled={isSubmitting}
            />
            {baseImage && (
              <p className="text-sm text-[var(--text-muted)]">{baseImage.name}</p>
            )}
            {errors.baseImage && <p className="text-sm text-red-500">{errors.baseImage}</p>}
          </div>

          {/* Style Reference Image */}
          <div className="space-y-1.5">
            <Label htmlFor="restyling-style-image">{t("styleImageLabel")}</Label>
            <Input
              id="restyling-style-image"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleStyleImageChange}
              disabled={isSubmitting}
            />
            {styleImage && (
              <p className="text-sm text-[var(--text-muted)]">{styleImage.name}</p>
            )}
            {errors.styleImage && <p className="text-sm text-red-500">{errors.styleImage}</p>}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? tCommon("loading") : t("submit")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}