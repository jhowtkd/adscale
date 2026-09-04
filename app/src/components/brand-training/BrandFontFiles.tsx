"use client";

import { useRef, useState } from "react";
import { Check, Loader2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import {
  studioChipClass,
  studioQuietActionClass,
} from "@/components/dashboard/studio-stage/StudioInstrument";
import {
  useBrandFonts,
  useReviewBrandFont,
  useUploadBrandFont,
  type BrandFontAssetRecord,
} from "@/lib/hooks/use-brand-training";

const occupancyFieldClass =
  "w-full rounded-[var(--radius-control)] border-0 bg-white/6 px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]";

export function BrandFontFiles({ clientProfileId }: { clientProfileId: string }) {
  const t = useTranslations("brandTraining.fonts");
  const addToast = useAppStore((s) => s.addToast);
  const fonts = useBrandFonts(clientProfileId);
  const upload = useUploadBrandFont(clientProfileId);
  const review = useReviewBrandFont(clientProfileId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [family, setFamily] = useState("");
  const [source, setSource] = useState("");
  const [weight, setWeight] = useState<BrandFontAssetRecord["weight"]>(400);
  const [style, setStyle] = useState<"normal" | "italic">("normal");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);

  const canSubmit = Boolean(file && family.trim() && source.trim() && rightsConfirmed && !upload.isPending);

  const submit = () => {
    if (!file || !family.trim() || !source.trim() || !rightsConfirmed) return;
    upload.mutate(
      { file, family: family.trim(), source: source.trim(), weight, style },
      {
        onSuccess: () => {
          setFile(null);
          setFamily("");
          setSource("");
          setRightsConfirmed(false);
          if (fileInputRef.current) fileInputRef.current.value = "";
          addToast("success", t("submitted"));
        },
        onError: (error) => addToast("error", error.message),
      },
    );
  };

  return (
    <div data-testid="brand-kit-font-files" className="space-y-5">
      <p className="text-xs text-[var(--text-muted)]">{t("generativeNotice")}</p>

      {fonts.data && fonts.data.length > 0 ? (
        <ul className="divide-y divide-white/8">
          {fonts.data.map((font) => {
            const status = font.reviewStatus ?? "approved";
            return (
              <li key={font.assetKey} className="flex flex-wrap items-center gap-2 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-primary)]">
                  {font.family} · {font.weight} · {font.style}
                </span>
                <span
                  className={cn(
                    "font-mono text-[10px] uppercase tracking-[0.14em]",
                    status === "approved" ? "text-[var(--success-text)]" : "text-[var(--text-muted)]",
                  )}
                >
                  {t(
                    status === "approved"
                      ? "statusApproved"
                      : status === "archived"
                        ? "statusArchived"
                        : "statusPending",
                  )}
                </span>
                {status === "pending_approval" ? (
                  <button
                    type="button"
                    disabled={review.isPending}
                    onClick={() =>
                      review.mutate(
                        { assetKey: font.assetKey, reviewStatus: "approved" },
                        {
                          onSuccess: () => addToast("success", t("reviewApproved")),
                          onError: (error) => addToast("error", error.message),
                        },
                      )
                    }
                    className={studioQuietActionClass}
                  >
                    {t("approveReview")}
                  </button>
                ) : null}
                {status !== "archived" ? (
                  <button
                    type="button"
                    disabled={review.isPending}
                    onClick={() =>
                      review.mutate(
                        { assetKey: font.assetKey, reviewStatus: "archived" },
                        {
                          onSuccess: () => addToast("success", t("reviewArchived")),
                          onError: (error) => addToast("error", error.message),
                        },
                      )
                    }
                    className={studioQuietActionClass}
                  >
                    {t("archiveReview")}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="text-xs font-medium tracking-wide text-[var(--text-secondary)]">{t("file")}</p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={studioChipClass}
          >
            <Upload size={14} aria-hidden="true" />
            <span className="max-w-[12rem] truncate">{file ? file.name : t("uploadChip")}</span>
          </button>
          <input
            ref={fileInputRef}
            id="brand-font-file"
            type="file"
            aria-label={t("file")}
            accept=".ttf,.otf,font/ttf,font/otf"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="sr-only"
          />
        </div>
        <label className="space-y-1 text-xs text-[var(--text-secondary)]">
          <span>{t("family")}</span>
          <input
            value={family}
            onChange={(event) => setFamily(event.target.value)}
            className={occupancyFieldClass}
          />
        </label>
        <label className="space-y-1 text-xs text-[var(--text-secondary)]">
          <span>{t("source")}</span>
          <input
            value={source}
            onChange={(event) => setSource(event.target.value)}
            className={occupancyFieldClass}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-xs text-[var(--text-secondary)]">
            <span>{t("weight")}</span>
            <select
              value={weight}
              onChange={(event) =>
                setWeight(Number(event.target.value) as BrandFontAssetRecord["weight"])
              }
              className={occupancyFieldClass}
            >
              {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs text-[var(--text-secondary)]">
            <span>{t("style")}</span>
            <select
              value={style}
              onChange={(event) => setStyle(event.target.value as "normal" | "italic")}
              className={occupancyFieldClass}
            >
              <option value="normal">{t("normal")}</option>
              <option value="italic">{t("italic")}</option>
            </select>
          </label>
        </div>
      </div>

      <label className="flex items-start gap-2 text-xs text-[var(--text-muted)]">
        <input
          type="checkbox"
          checked={rightsConfirmed}
          onChange={(event) => setRightsConfirmed(event.target.checked)}
          className="mt-0.5"
        />
        <span>{t("rightsConfirmed")}</span>
      </label>

      <div className="flex justify-end">
        <button type="button" onClick={submit} disabled={!canSubmit} className={studioChipClass}>
          {upload.isPending ? (
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          ) : (
            <Check size={14} aria-hidden="true" />
          )}
          <span>{t("sendForReview")}</span>
        </button>
      </div>
    </div>
  );
}
