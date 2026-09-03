"use client";

import { useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useAppStore } from "@/lib/store";
import {
  studioChipClass,
  studioQuietActionClass,
} from "@/components/dashboard/studio-stage/StudioInstrument";
import {
  useApproveVoice,
  useExtractVoice,
  type BrandVoiceConfig,
} from "@/lib/hooks/use-brand-training";

const occupancyFieldClass =
  "w-full resize-none rounded-[var(--radius-control)] border-0 bg-white/6 px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]";

export function BrandVoiceSection({ clientProfileId }: { clientProfileId: string }) {
  const t = useTranslations("brandTraining");
  const tc = useTranslations("common");
  const addToast = useAppStore((s) => s.addToast);
  const extractVoice = useExtractVoice(clientProfileId);
  const approveVoice = useApproveVoice(clientProfileId);
  const [config, setConfig] = useState<BrandVoiceConfig | null>(null);

  return (
    <div data-testid="brand-kit-voice-proposal" className="space-y-5">
      {!config ? (
        <div className="space-y-4">
          <p className="text-xs text-[var(--text-muted)]">{t("voiceOptional")}</p>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() =>
                extractVoice.mutate(undefined, {
                  onSuccess: setConfig,
                  onError: (err) => addToast("error", err.message),
                })
              }
              disabled={extractVoice.isPending}
              className={studioChipClass}
            >
              {extractVoice.isPending ? (
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles size={14} aria-hidden="true" />
              )}
              <span>{t("generateVoice")}</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <p
            role="status"
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]"
          >
            {t("voiceReviewStatus")} · {config.reviewStatus}
          </p>
          {(["principles", "positiveSignals", "negativeSignals"] as const).map((field) => (
            <label key={field} className="block space-y-1 text-xs text-[var(--text-secondary)]">
              <span>{t(`voice_${field}`)}</span>
              <textarea
                aria-label={t(`voice_${field}`)}
                value={config.config[field].join("\n")}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    config: {
                      ...config.config,
                      [field]: e.target.value.split("\n").filter(Boolean),
                    },
                  })
                }
                rows={4}
                className={occupancyFieldClass}
              />
            </label>
          ))}
          <div className="flex flex-wrap items-center justify-end gap-1">
            <button type="button" onClick={() => setConfig(null)} className={studioQuietActionClass}>
              {tc("cancel")}
            </button>
            <button
              type="button"
              onClick={() =>
                approveVoice.mutate(config.config, {
                  onSuccess: (next) => {
                    setConfig(next);
                    addToast("success", t("voiceApproved"));
                  },
                  onError: (err) => addToast("error", err.message),
                })
              }
              disabled={approveVoice.isPending}
              className={studioChipClass}
            >
              {approveVoice.isPending ? (
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              ) : (
                <Check size={14} aria-hidden="true" />
              )}
              <span>{t("approveVoice")}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
