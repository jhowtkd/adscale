"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { toast } from "sonner";

import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { RestylingUpload } from "@/components/restyling/RestylingUpload";
import RestylingForm from "@/components/restyling/RestylingForm";

interface FormErrors {
  name?: string;
  baseImage?: string;
  styleImage?: string;
}

export default function RestylingPage() {
  const t = useTranslations("restyling");
  const tCommon = useTranslations("common");

  const router = useRouter();

  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [offer, setOffer] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [styleIntensity, setStyleIntensity] = useState<"soft" | "medium" | "strong">("medium");
  const [baseImage, setBaseImage] = useState<File | null>(null);
  const [styleImage, setStyleImage] = useState<File | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const uploadTranslations = {
    dragDrop: t("dragDrop"),
    onlyImages: t("onlyImages"),
    maxSize: t("maxSize"),
  };

  const validate = useCallback((): boolean => {
    const newErrors: FormErrors = {};
    if (!name.trim()) {
      newErrors.name = t("nameRequired");
    }
    if (!baseImage) {
      newErrors.baseImage = t("baseImageRequired");
    }
    if (!styleImage) {
      newErrors.styleImage = t("styleImageRequired");
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [name, baseImage, styleImage, t]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!validate()) return;

      setIsSubmitting(true);

      try {
        const formData = new FormData();
        formData.append("name", name.trim());
        formData.append("client", client.trim());
        formData.append("offer", offer.trim());
        formData.append("ctaText", ctaText.trim());
        formData.append("styleIntensity", styleIntensity);
        if (baseImage) formData.append("baseImage", baseImage);
        if (styleImage) formData.append("styleImage", styleImage);

        const res = await apiFetch("/api/restyling", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || data.message || "Submission failed");
        }

        const data = await res.json();
        router.push(data.redirectUrl || `/campaigns/${data.campaignId}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : tCommon("error"));
        setIsSubmitting(false);
      }
    },
    [name, client, offer, ctaText, styleIntensity, baseImage, styleImage, validate, router, tCommon, t]
  );

  const handleCancel = useCallback(() => {
    router.push("/campaigns");
  }, [router]);

  return (
    <div className="max-w-3xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.19, 1, 0.22, 1] as [number, number, number, number] }}
        className="pb-8 border-b border-[var(--border-dim)] mb-8"
      >
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-[var(--text-primary)]">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {t("description")}
        </p>
      </motion.div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <RestylingUpload
            label={t("baseImageLabel")}
            description={t("baseImageDescription")}
            value={baseImage}
            onChange={setBaseImage}
            error={errors.baseImage}
            translations={uploadTranslations}
          />
          <RestylingUpload
            label={t("styleImageLabel")}
            description={t("styleImageDescription")}
            value={styleImage}
            onChange={setStyleImage}
            error={errors.styleImage}
            translations={uploadTranslations}
          />
        </div>

        <RestylingForm
          name={name}
          onNameChange={setName}
          client={client}
          onClientChange={setClient}
          offer={offer}
          onOfferChange={setOffer}
          ctaText={ctaText}
          onCtaTextChange={setCtaText}
          styleIntensity={styleIntensity}
          onStyleIntensityChange={setStyleIntensity}
          errors={errors}
        />

        <div className="flex items-center gap-3 pt-4 border-t border-[var(--border-dim)]">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={isSubmitting}
            className="border-[var(--border-dim)] text-[var(--text-secondary)]"
          >
            {tCommon("cancel")}
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue-light)] hover:-translate-y-px active:scale-[0.98] transition-all duration-200 disabled:opacity-60"
          >
            {isSubmitting ? tCommon("loading") : t("submit")}
          </Button>
        </div>
      </form>
    </div>
  );
}