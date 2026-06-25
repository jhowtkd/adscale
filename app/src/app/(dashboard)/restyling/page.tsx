"use client";

import { useCallback, useReducer } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { RestylingUpload } from "@/components/restyling/RestylingUpload";
import RestylingForm from "@/components/restyling/RestylingForm";
import PageFrame from "@/components/layout/PageFrame";
import PageHeader from "@/components/layout/PageHeader";

interface FormErrors {
  name?: string;
  baseImage?: string;
  styleImage?: string;
}

interface RestylingPageState {
  name: string;
  client: string;
  offer: string;
  ctaText: string;
  styleIntensity: "soft" | "medium" | "strong";
  baseImage: File | null;
  styleImage: File | null;
  errors: FormErrors;
  isSubmitting: boolean;
}

const initialRestylingPageState: RestylingPageState = {
  name: "",
  client: "",
  offer: "",
  ctaText: "",
  styleIntensity: "medium",
  baseImage: null,
  styleImage: null,
  errors: {},
  isSubmitting: false,
};

function restylingPageReducer(
  state: RestylingPageState,
  payload: Partial<RestylingPageState>
): RestylingPageState {
  return { ...state, ...payload };
}

export default function RestylingPage() {
  const t = useTranslations("restyling");
  const tCommon = useTranslations("common");

  const router = useRouter();

  const [state, updateState] = useReducer(restylingPageReducer, initialRestylingPageState);
  const { name, client, offer, ctaText, styleIntensity, baseImage, styleImage, errors, isSubmitting } = state;

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
    updateState({ errors: newErrors });
    return Object.keys(newErrors).length === 0;
  }, [name, baseImage, styleImage, t]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!validate()) return;

      updateState({ isSubmitting: true });

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
        updateState({ isSubmitting: false });
      }
    },
    [name, client, offer, ctaText, styleIntensity, baseImage, styleImage, validate, router, tCommon]
  );

  const handleCancel = useCallback(() => {
    router.push("/campaigns");
  }, [router]);

  return (
    <PageFrame width="form" className="space-y-8">
      <PageHeader title={t("title")} description={t("description")} />

      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <RestylingUpload
            label={t("baseImageLabel")}
            description={t("baseImageDescription")}
            value={baseImage}
            onChange={(file) => updateState({ baseImage: file })}
            error={errors.baseImage}
            translations={uploadTranslations}
          />
          <RestylingUpload
            label={t("styleImageLabel")}
            description={t("styleImageDescription")}
            value={styleImage}
            onChange={(file) => updateState({ styleImage: file })}
            error={errors.styleImage}
            translations={uploadTranslations}
          />
        </div>

        <RestylingForm
          name={name}
          onNameChange={(value) => updateState({ name: value })}
          client={client}
          onClientChange={(value) => updateState({ client: value })}
          offer={offer}
          onOfferChange={(value) => updateState({ offer: value })}
          ctaText={ctaText}
          onCtaTextChange={(value) => updateState({ ctaText: value })}
          styleIntensity={styleIntensity}
          onStyleIntensityChange={(value) => updateState({ styleIntensity: value })}
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
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? tCommon("loading") : t("submit")}
          </Button>
        </div>
      </form>
    </PageFrame>
  );
}
